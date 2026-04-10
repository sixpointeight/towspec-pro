// Uses Node.js 18+ built-in fetch — no external dependencies needed
const { parse } = require('node-html-parser');

const AAA_BASE = 'https://rsi.aaa.biz';
const USERNAME = process.env.AAA_RSI_USERNAME || '';
const PASSWORD = process.env.AAA_RSI_PASSWORD || '';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

function cookieString(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const c of setCookieHeaders) {
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (m) jar[m[1].trim()] = m[2].trim();
  }
  return jar;
}

async function aaaFetch(url, options = {}, cookieJar = {}) {
  const resp = await fetch(url, {
    ...options,
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      ...options.headers,
      'Cookie': cookieString(cookieJar),
    },
  });

  // Merge any new cookies
  const setCookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
  Object.assign(cookieJar, parseCookies(setCookies));

  // Follow redirects manually (so we capture cookies from each hop)
  if ([301, 302, 303, 307, 308].includes(resp.status)) {
    const location = resp.headers.get('location');
    if (location) {
      const nextUrl = new URL(location, url).toString();
      const nextMethod = [307, 308].includes(resp.status) ? (options.method || 'GET') : 'GET';
      const nextBody = nextMethod === 'GET' ? undefined : options.body;
      return aaaFetch(nextUrl, { ...options, method: nextMethod, body: nextBody }, cookieJar);
    }
  }

  return { resp, cookieJar };
}

async function login() {
  const jar = {};

  // GET login page → extract nonce
  const { resp: loginResp } = await aaaFetch(`${AAA_BASE}/my-account/`, {}, jar);
  const loginHtml = await loginResp.text();
  const root = parse(loginHtml);

  const nonceEl = root.querySelector('input[name="woocommerce-login-nonce"]');
  if (!nonceEl) throw new Error('Login nonce not found — site structure may have changed');
  const nonce = nonceEl.getAttribute('value');

  const refererEl = root.querySelector('input[name="_wp_http_referer"]');
  const referer = refererEl ? refererEl.getAttribute('value') : '/my-account/';

  // POST credentials
  const body = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
    'woocommerce-login-nonce': nonce,
    '_wp_http_referer': referer,
    login: 'Log in',
    rememberme: 'forever',
  }).toString();

  await aaaFetch(`${AAA_BASE}/my-account/`, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${AAA_BASE}/my-account/`,
    },
  }, jar);

  return jar;
}

function cleanText(str) {
  return str.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function parseSections(root) {
  const sections = {};
  for (const h2 of root.querySelectorAll('h2')) {
    const heading = cleanText(h2.text);
    if (!heading || heading.length > 100) continue;
    const parts = [];
    let el = h2.nextElementSibling;
    while (el && el.tagName !== 'H2') {
      const t = cleanText(el.text);
      if (t) parts.push(t);
      el = el.nextElementSibling;
    }
    if (parts.length) sections[heading] = parts.join(' ');
  }
  return sections;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  const url = (event.queryStringParameters || {}).url || '';
  if (!url || !url.startsWith(`${AAA_BASE}/procedures/`)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid URL' }) };
  }
  if (!USERNAME || !PASSWORD) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'AAA_RSI_USERNAME / AAA_RSI_PASSWORD not set in environment variables' }) };
  }

  try {
    const jar = await login();

    const { resp } = await aaaFetch(url, {}, jar);
    const html = await resp.text();

    if (html.includes('paid subscriber') || html.includes('woocommerce-login-nonce')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication failed — verify AAA_RSI_USERNAME and AAA_RSI_PASSWORD in Netlify → Site configuration → Environment variables' }) };
    }

    const root = parse(html);

    const titleEl = root.querySelector('h1.entry-title') || root.querySelector('h1');
    const title = titleEl ? cleanText(titleEl.text) : '';

    const sizeMatch = html.match(/(\d+"[^<"]*length[^<"]*width)/i);
    const size = sizeMatch ? cleanText(sizeMatch[1]) : '';

    const sections = parseSections(root);

    return { statusCode: 200, headers, body: JSON.stringify({ title, size, sections }) };
  } catch (err) {
    console.error('Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
