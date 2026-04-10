const https = require('https');
const { parse: parseHtml } = require('node-html-parser');
const { URL } = require('url');
const querystring = require('querystring');

const AAA_BASE = 'https://rsi.aaa.biz';
const USERNAME = process.env.AAA_RSI_USERNAME || '';
const PASSWORD = process.env.AAA_RSI_PASSWORD || '';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

// Low-level HTTPS request — returns { statusCode, headers, body }
function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(new Error('Request timed out')); });
    if (body) req.write(body);
    req.end();
  });
}

// Parse all Set-Cookie headers into a flat key=value object
function extractCookies(headers) {
  const jar = {};
  const raw = headers['set-cookie'] || [];
  // Node's http module returns set-cookie as an array
  const list = Array.isArray(raw) ? raw : [raw];
  for (const c of list) {
    if (!c) continue;
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (m) jar[m[1].trim()] = m[2].trim();
  }
  return jar;
}

function cookieString(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// GET or POST a URL, following redirects, accumulating cookies
async function aRequest(url, method, postBody, cookieJar, extraHeaders = {}) {
  const MAX_REDIRECTS = 8;
  let currentUrl = url;
  let currentMethod = method;
  let currentBody = postBody;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const parsed = new URL(currentUrl);
    const isPost = currentMethod === 'POST' && currentBody;
    const bodyBuf = isPost ? Buffer.from(currentBody, 'utf8') : null;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: currentMethod,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': cookieString(cookieJar),
        ...extraHeaders,
        ...(isPost ? {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': bodyBuf.length,
        } : {}),
      },
    };

    const res = await httpsRequest(options, bodyBuf);

    // Merge cookies from this response
    Object.assign(cookieJar, extractCookies(res.headers));

    if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
      const location = res.headers['location'];
      if (!location) break;
      currentUrl = new URL(location, currentUrl).toString();
      if (res.statusCode !== 307 && res.statusCode !== 308) {
        currentMethod = 'GET';
        currentBody = null;
      }
      continue;
    }

    return res;
  }
  throw new Error('Too many redirects');
}

async function login() {
  const jar = {};

  // Step 1: GET login page → extract WooCommerce nonce
  const loginRes = await aRequest(`${AAA_BASE}/my-account/`, 'GET', null, jar);
  const loginDom = parseHtml(loginRes.body);

  const nonceEl = loginDom.querySelector('input[name="woocommerce-login-nonce"]');
  if (!nonceEl) throw new Error('Login nonce not found on AAA RSI login page');
  const nonce = nonceEl.getAttribute('value');

  const refEl = loginDom.querySelector('input[name="_wp_http_referer"]');
  const referer = refEl ? refEl.getAttribute('value') : '/my-account/';

  // Step 2: POST credentials
  const body = querystring.stringify({
    username: USERNAME,
    password: PASSWORD,
    'woocommerce-login-nonce': nonce,
    '_wp_http_referer': referer,
    login: 'Log in',
    rememberme: 'forever',
  });

  await aRequest(`${AAA_BASE}/my-account/`, 'POST', body, jar, {
    Referer: `${AAA_BASE}/my-account/`,
  });

  return jar;
}

function cleanText(str) {
  return str.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function parseSections(dom) {
  const sections = {};
  for (const h2 of dom.querySelectorAll('h2')) {
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
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const url = (event.queryStringParameters || {}).url || '';
  if (!url || !url.startsWith(`${AAA_BASE}/procedures/`)) {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Invalid URL' }) };
  }
  if (!USERNAME || !PASSWORD) {
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'AAA_RSI_USERNAME / AAA_RSI_PASSWORD not configured in Netlify environment variables' }) };
  }

  try {
    const jar = await login();

    const procedureRes = await aRequest(url, 'GET', null, jar);

    if (procedureRes.body.includes('paid subscriber') || procedureRes.body.includes('woocommerce-login-nonce')) {
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Authentication failed — credentials may be incorrect or the account does not have an active subscription' }),
      };
    }

    const dom = parseHtml(procedureRes.body);

    const titleEl = dom.querySelector('h1.entry-title') || dom.querySelector('h1');
    const title = titleEl ? cleanText(titleEl.text) : '';

    const sizeMatch = procedureRes.body.match(/(\d+"[^<"]*length[^<"]*width)/i);
    const size = sizeMatch ? cleanText(sizeMatch[1]) : '';

    const sections = parseSections(dom);

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ title, size, sections }),
    };
  } catch (err) {
    console.error('Procedure error:', err.message);
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
