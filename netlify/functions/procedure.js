const https = require('https');
const { parse: parseHtml } = require('node-html-parser');
const { URL } = require('url');
const querystring = require('querystring');

const AAA_BASE = 'https://rsi.aaa.biz';
const USERNAME = process.env.AAA_RSI_USERNAME || '';
const PASSWORD = process.env.AAA_RSI_PASSWORD || '';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

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

function extractCookies(headers) {
  const jar = {};
  const raw = headers['set-cookie'] || [];
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

async function aRequest(urlStr, method, postBody, cookieJar, extraHeaders = {}) {
  const MAX_REDIRECTS = 8;
  let currentUrl = urlStr;
  let currentMethod = method;
  let currentBody = postBody;
  const trace = [];

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
    const newCookies = extractCookies(res.headers);
    Object.assign(cookieJar, newCookies);

    trace.push({
      url: currentUrl,
      method: currentMethod,
      status: res.statusCode,
      newCookieKeys: Object.keys(newCookies),
      location: res.headers['location'] || null,
    });

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

    return { res, trace };
  }
  throw new Error('Too many redirects');
}

async function login(debug = false) {
  const jar = {};
  const steps = [];

  // GET login page
  const { res: loginRes, trace: t1 } = await aRequest(`${AAA_BASE}/my-account/`, 'GET', null, jar);
  if (debug) steps.push({ step: 'GET login page', trace: t1, cookiesAfter: Object.keys(jar) });

  const loginDom = parseHtml(loginRes.body);
  const nonceEl = loginDom.querySelector('input[name="woocommerce-login-nonce"]');
  if (!nonceEl) throw new Error('Login nonce not found');
  const nonce = nonceEl.getAttribute('value');

  const refEl = loginDom.querySelector('input[name="_wp_http_referer"]');
  const referer = refEl ? refEl.getAttribute('value') : '/my-account/';

  if (debug) steps.push({ step: 'Parsed nonce', nonceFound: true, nonceLength: nonce.length });

  // POST credentials
  const body = querystring.stringify({
    username: USERNAME,
    password: PASSWORD,
    'woocommerce-login-nonce': nonce,
    '_wp_http_referer': referer,
    login: 'Log in',
    rememberme: 'forever',
  });

  const { res: postRes, trace: t2 } = await aRequest(`${AAA_BASE}/my-account/`, 'POST', body, jar, {
    Referer: `${AAA_BASE}/my-account/`,
  });

  if (debug) steps.push({
    step: 'POST login',
    trace: t2,
    cookiesAfter: Object.keys(jar),
    hasAuthCookie: Object.keys(jar).some(k => k.includes('wordpress_logged_in')),
    finalUrl: postRes ? 'got response' : 'no response',
  });

  return { jar, steps };
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

  const params = event.queryStringParameters || {};
  const isDebug = params.debug === '1';

  // Debug endpoint — no credentials shown, just diagnostics
  if (isDebug) {
    try {
      const { jar, steps } = await login(true);
      const hasAuth = Object.keys(jar).some(k => k.includes('wordpress_logged_in'));

      // Try fetching a known procedure URL
      const testUrl = `${AAA_BASE}/procedures/2025/Tesla/Model-3/RWD/Electric/2025-tesla-model-3-rwd-2/`;
      const { res: procRes, trace: t3 } = await aRequest(testUrl, 'GET', null, jar);
      const isPaywalled = procRes.body.includes('paid subscriber') || procRes.body.includes('woocommerce-login-nonce');
      const hasTowInfo = procRes.body.includes('Tow Information');

      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({
          envVarsSet: { username: !!USERNAME, password: !!PASSWORD },
          loginSteps: steps,
          cookieCount: Object.keys(jar).length,
          hasAuthCookie: hasAuth,
          procedureCheck: { trace: t3, isPaywalled, hasTowInfo, statusCode: procRes.statusCode },
        }, null, 2),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: responseHeaders,
        body: JSON.stringify({ debugError: err.message, stack: err.stack }),
      };
    }
  }

  const url = params.url || '';
  if (!url || !url.startsWith(`${AAA_BASE}/procedures/`)) {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Invalid URL' }) };
  }
  if (!USERNAME || !PASSWORD) {
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'AAA_RSI_USERNAME / AAA_RSI_PASSWORD not configured' }) };
  }

  try {
    const { jar } = await login(false);
    const { res: procedureRes } = await aRequest(url, 'GET', null, jar);

    if (procedureRes.body.includes('paid subscriber') || procedureRes.body.includes('woocommerce-login-nonce')) {
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Authentication failed — credentials may be incorrect or account lacks an active subscription' }),
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
    console.error('Error:', err.message);
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
