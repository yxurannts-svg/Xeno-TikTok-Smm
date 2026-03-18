// XenoBot v3 — TikTok View Bot (Node.js + Playwright-Core)
// Works on Termux Android with the installed Chromium
//
// SETUP (one time):
//   pkg install nodejs
//   npm install playwright-core
//
// USAGE:
//   node bot.js --url "VIDEO_URL" --views 100
//   node bot.js --url "URL" --views 50 --speed slow
//   node bot.js --url "URL" --views 200 --speed medium --proxy none

const { chromium } = require('playwright-core');
const https = require('https');
const http  = require('http');
const url   = require('url');

// ─── Parse args ───────────────────────────────
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i !== -1 && args[i+1] ? args[i+1] : def;
}
if (!args.includes('--url')) {
  console.log('\n\x1b[91m[!]\x1b[0m Usage: node bot.js --url "VIDEO_URL" --views 100 --speed medium\n');
  process.exit(1);
}

const TARGET_URL  = getArg('url', '');
const VIEWS       = parseInt(getArg('views', '100'));
const SPEED       = getArg('speed', 'medium');
const PROXY_MODE  = getArg('proxy', 'free');
const PROXY_FILE  = getArg('proxies', '');

// ─── Colors ────────────────────────────────────
const R='\x1b[91m', G='\x1b[92m', Y='\x1b[93m',
      C='\x1b[96m', W='\x1b[97m', D='\x1b[2m', X='\x1b[0m';

function ts() {
  return new Date().toTimeString().slice(0,8);
}
const log = {
  ok:   m => console.log(`${D}[${ts()}]${X} ${G}+${X} ${m}`),
  err:  m => console.log(`${D}[${ts()}]${X} ${R}-${X} ${m}`),
  info: m => console.log(`${D}[${ts()}]${X} ${C}>${X} ${m}`),
  warn: m => console.log(`${D}[${ts()}]${X} ${Y}!${X} ${m}`),
};

// ─── Chromium paths ────────────────────────────
const CHROME_PATHS = [
  '/data/data/com.termux/files/usr/bin/chromium-browser',
  '/data/data/com.termux/files/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
];

const fs = require('fs');
function findChromium() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ─── User Agents ───────────────────────────────
const AGENTS = [
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
];

const VIEWPORTS = [
  { width: 390,  height: 844 },
  { width: 412,  height: 915 },
  { width: 360,  height: 800 },
  { width: 393,  height: 852 },
];

const REFERRERS = [
  'https://www.google.com/',
  'https://www.google.com/search?q=tiktok',
  'https://t.co/',
  'https://www.instagram.com/',
  '',
];

const rand     = (a, b) => a + Math.random() * (b - a);
const randInt  = (a, b) => Math.floor(rand(a, b+1));
const pick     = arr => arr[randInt(0, arr.length-1)];
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ─── Resolve short URL ─────────────────────────
function resolveUrl(inputUrl) {
  return new Promise(resolve => {
    if (!inputUrl.includes('vm.tiktok.com') && !inputUrl.includes('vt.tiktok.com')) {
      return resolve(inputUrl);
    }
    log.info('Resolving short URL...');
    const parsed = url.parse(inputUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({ host: parsed.host, path: parsed.path, method: 'HEAD' }, res => {
      const loc = res.headers.location || inputUrl;
      log.ok('Resolved: ' + loc.slice(0, 55) + '...');
      resolve(loc);
    });
    req.on('error', () => resolve(inputUrl));
    req.setTimeout(6000, () => { req.destroy(); resolve(inputUrl); });
    req.end();
  });
}

// ─── Extract video ID ──────────────────────────
function getVideoId(u) {
  const m = u.match(/\/video\/(\d+)/);
  if (m) return m[1];
  const m2 = u.match(/tiktok\.com\/v\/(\d+)/);
  return m2 ? m2[1] : null;
}

// ─── Fetch free proxies ────────────────────────
function fetchProxies() {
  return new Promise(resolve => {
    log.info('Fetching free proxies...');
    const sources = [
      'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=5000&anonymity=elite',
      'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
      'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    ];
    let proxies = [];
    let done = 0;
    if (sources.length === 0) return resolve([]);
    for (const src of sources) {
      https.get(src, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          data.split('\n').forEach(l => {
            l = l.trim();
            if (l && l.includes(':') && l.length < 22) proxies.push(l);
          });
          done++;
          if (done === sources.length || proxies.length > 100) {
            proxies = proxies.sort(() => Math.random() - 0.5);
            log.ok('Loaded ' + proxies.length + ' proxies');
            resolve(proxies);
          }
        });
      }).on('error', () => {
        done++;
        if (done === sources.length) {
          proxies = proxies.sort(() => Math.random() - 0.5);
          resolve(proxies);
        }
      }).setTimeout(8000);
    }
  });
}

// ─── Single view attempt ───────────────────────
async function sendView(browser, pageUrl, proxy) {
  let ctx = null;
  try {
    const ctxOpts = {
      userAgent: pick(AGENTS),
      viewport:  pick(VIEWPORTS),
      locale:    pick(['en-US', 'en-GB', 'id-ID', 'es-US']),
      timezoneId: pick(['America/New_York', 'Europe/London', 'Asia/Jakarta', 'America/Los_Angeles']),
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua-Mobile': '?1',
      },
    };
    if (proxy) ctxOpts.proxy = { server: 'http://' + proxy };

    ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();

    // Anti-detection: remove webdriver fingerprint
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] });
      window.chrome = { runtime: {} };
    });

    const referer = pick(REFERRERS);
    await page.goto(pageUrl, {
      referer,
      waitUntil: 'domcontentloaded',
      timeout: 22000,
    });

    // Watch video — random 4-14 seconds like a real user
    const watchTime = rand(4000, 14000);
    await sleep(watchTime * 0.4);
    await page.evaluate(() => window.scrollBy(0, Math.random() * 100 + 20));
    await sleep(watchTime * 0.6);

    const title = await page.title().catch(() => '');
    if (title && title.length > 3) {
      return { ok: true, msg: `Watched ${(watchTime/1000).toFixed(1)}s` };
    }
    return { ok: false, msg: 'Bad page: ' + title.slice(0, 25) };

  } catch (e) {
    const s = String(e);
    if (s.includes('ERR_')) return { ok: false, msg: 'Network/proxy error' };
    if (s.includes('Timeout') || s.includes('timeout')) return { ok: false, msg: 'Timeout' };
    return { ok: false, msg: s.slice(0, 50) };
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

// ─── Progress bar ──────────────────────────────
function progress(sent, total, success, fail) {
  const pct = Math.floor(sent / total * 30);
  const rate = sent > 0 ? Math.round(success / sent * 100) : 0;
  const bar = G + '█'.repeat(pct) + D + '░'.repeat(30 - pct) + X;
  process.stdout.write(`\r  ${bar} ${sent}/${total} | +${success} -${fail} | ${rate}%  `);
}

// ─── Main ─────────────────────────────────────
(async () => {
  console.log(`\n${R}  ╔╗ ╔═╗╔╦╗  ${Y}XenoBot v3${X}`);
  console.log(`${R}  ╔╩╗║ ║ ║   ${D}Node.js + Playwright${X}`);
  console.log(`${R}  ╚═╝╚═╝ ╩   ${D}Termux Edition${X}\n`);

  // Resolve URL
  const resolvedUrl = await resolveUrl(TARGET_URL);
  const videoId = getVideoId(resolvedUrl);
  if (!videoId) {
    log.err('Cannot extract video ID — check URL');
    log.warn('URL should look like: https://www.tiktok.com/@user/video/1234567890');
    process.exit(1);
  }

  log.info('Video ID : ' + videoId);
  log.info('Views    : ' + VIEWS);
  log.info('Speed    : ' + SPEED);
  log.info('Proxy    : ' + PROXY_MODE);
  console.log();

  // Find Chromium
  const chromePath = findChromium();
  if (!chromePath) {
    log.err('Chromium not found!');
    console.log('\n' + Y + 'Install in Termux:' + X);
    console.log('  ' + C + 'pkg install x11-repo' + X);
    console.log('  ' + C + 'pkg install chromium' + X);
    process.exit(1);
  }
  log.ok('Chromium: ' + chromePath);

  // Load proxies
  let proxies = [];
  if (PROXY_MODE === 'free') {
    proxies = await fetchProxies();
    if (proxies.length === 0) {
      log.warn('No proxies loaded — running without proxy');
    }
  } else if (PROXY_MODE === 'custom' && PROXY_FILE) {
    try {
      proxies = fs.readFileSync(PROXY_FILE, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
      log.ok('Loaded ' + proxies.length + ' custom proxies');
    } catch (e) {
      log.err('Cannot read proxy file: ' + e.message);
      process.exit(1);
    }
  } else {
    log.warn('No proxy — TikTok sees your real IP. Use slow speed!');
  }

  // Speed config
  const speeds = { slow: [7000, 16000], medium: [2500, 7000], fast: [600, 2500] };
  const [dMin, dMax] = speeds[SPEED] || speeds.medium;
  log.info(`Delay: ${dMin/1000}–${dMax/1000}s between views (+ watch time)`);
  console.log('\n' + W + '─'.repeat(52) + X + '\n');

  // Launch browser
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--mute-audio',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-extensions',
      ],
    });
  } catch (e) {
    log.err('Failed to launch Chromium: ' + e.message);
    log.warn('Make sure chromium is installed: pkg install chromium');
    process.exit(1);
  }
  log.ok('Chromium launched!\n');

  let sent = 0, success = 0, fail = 0, proxyIdx = 0;

  const cleanup = async () => {
    console.log('\n');
    log.warn('Stopped. Sent: ' + sent + ' | Success: ' + success + ' | Failed: ' + fail);
    await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  while (sent < VIEWS) {
    const proxy = proxies.length > 0 ? proxies[proxyIdx % proxies.length] : null;
    proxyIdx++;

    const result = await sendView(browser, resolvedUrl, proxy);
    sent++;

    if (result.ok) {
      success++;
      log.ok(`[${sent}/${VIEWS}] ${result.msg}`);
    } else {
      fail++;
      log.err(`[${sent}/${VIEWS}] ${result.msg}`);
      proxyIdx++; // skip dead proxy faster
    }

    progress(sent, VIEWS, success, fail);

    if (sent < VIEWS) {
      await sleep(rand(dMin, dMax));
    }
  }

  console.log('\n\n' + W + '─'.repeat(52) + X + '\n');
  log.ok(`Done! ${success}/${VIEWS} views (${VIEWS > 0 ? Math.round(success/VIEWS*100) : 0}% success rate)`);
  log.info('Wait 5–15 min then check TikTok view count');
  console.log();

  if (success < VIEWS * 0.35) {
    log.warn('Low success rate. Tips:');
    log.warn('  Try --speed slow');
    log.warn('  Use residential proxies for better results');
    log.warn('  Make sure Termux is from F-Droid not Play Store');
  } else {
    log.ok('Good success rate! Views should appear soon.');
  }

  await browser.close();
})();
