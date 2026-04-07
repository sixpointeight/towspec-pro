const https = require('https');
const http = require('http');
const { URL } = require('url');

const AAA_BASE = 'https://rsi.aaa.biz';
const USERNAME = process.env.AAA_RSI_USERNAME || '';
const PASSWORD = process.env.AAA_RSI_PASSWORD || '';

// Make an HTTP/HTTPS request returning { body, headers, statusCode }
function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === 'http:' ? http : https;
    const req = mod.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ body, headers: res.headers, statusCode: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (postData) req.write(postData);
    req.end();
  });
}

// Follow redirects, maintaining cookies
async function fetchWithCookies(urlStr, method = 'GET', postData = null, cookies = {}, extraHeaders = {}) {
  const maxRedirects = 6;
  let currentUrl = urlStr;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    const parsed = new URL(currentUrl);
    const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    const options = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': cookieHeader,
        ...extraHeaders,
        ...(postData ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    };

    const res = await request(options, method === 'POST' ? postData : null);

    // Collect Set-Cookie headers
    const setCookie = res.headers['set-cookie'] || [];
    for (const c of setCookie) {
      const match = c.match(/^([^=]+)=([^;]*)/);
      if (match) cookies[match[1].trim()] = match[2].trim();
    }

    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      currentUrl = new URL(res.headers.location, currentUrl).toString();
      method = res.statusCode === 307 || res.statusCode === 308 ? method : 'GET';
      postData = method === 'GET' ? null : postData;
      redirectCount++;
      continue;
    }

    return { body: res.body, statusCode: res.statusCode, cookies, finalUrl: currentUrl };
  }
  throw new Error('Too many redirects');
}

function extractNonce(html, name) {
  const match = html.match(new RegExp(`name="${name}"\\s+value="([^"]+)"`));
  return match ? match[1] : null;
}

function cleanText(str) {
  return str.replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim();
}

function parseHtmlSections(html) {
  const result = {};

  // Extract text between h2 headings
  // Find all <h2>...</h2> blocks
  const h2Pattern = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const h2Matches = [...html.matchAll(h2Pattern)];

  for (let i = 0; i < h2Matches.length; i++) {
    const heading = cleanText(h2Matches[i][1].replace(/<[^>]+>/g, ''));
    if (!heading || heading.length > 100) continue;

    // Get content between this h2 and the next h2 (or end)
    const start = h2Matches[i].index + h2Matches[i][0].length;
    const end = i + 1 < h2Matches.length ? h2Matches[i + 1].index : html.length;
    const contentHtml = html.slice(start, end);

    // Strip tags and clean
    const text = cleanText(contentHtml.replace(/<[^>]+>/g, ' '));
    if (text) result[heading] = text;
  }

  return result;
}

async function login() {
  if (!USERNAME || !PASSWORD) throw new Error('Credentials not configured');

  const cookies = {};

  // GET login page for nonce
  const loginPage = await fetchWithCookies(`${AAA_BASE}/my-account/`, 'GET', null, cookies);
  const nonce = extractNonce(loginPage.body, 'woocommerce-login-nonce');
  const referer = extractNonce(loginPage.body, '_wp_http_referer') || '/my-account/';
  if (!nonce) throw new Error('Could not find login nonce');

  // POST login
  const postData = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
    'woocommerce-login-nonce': nonce,
    '_wp_http_referer': referer,
    login: 'Log in',
    rememberme: 'forever',
  }).toString();

  await fetchWithCookies(`${AAA_BASE}/my-account/`, 'POST', postData, cookies, {
    Referer: `${AAA_BASE}/my-account/`,
  });

  return cookies;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const url = event.queryStringParameters?.url || '';
  if (!url || !url.startsWith(`${AAA_BASE}/procedures/`)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid URL' }) };
  }

  try {
    const cookies = await login();
    const res = await fetchWithCookies(url, 'GET', null, cookies);

    if (res.statusCode !== 200) {
      return { statusCode: res.statusCode, headers, body: JSON.stringify({ error: `HTTP ${res.statusCode}` }) };
    }

    if (res.body.includes('paid subscriber') || res.body.includes('woocommerce-login-nonce')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication failed — check credentials' }) };
    }

    const sections = parseHtmlSections(res.body);

    // Extract title
    const titleMatch = res.body.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
      || res.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? cleanText(titleMatch[1].replace(/<[^>]+>/g, '')) : '';

    // Extract size
    const sizeMatch = res.body.match(/(\d+"[^<]*length[^<]*width)/i);
    const size = sizeMatch ? cleanText(sizeMatch[1]) : '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ title, size, sections }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
