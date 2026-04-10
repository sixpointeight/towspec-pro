const https = require('https');
const { parse: parseHtml } = require('node-html-parser');
const { URL } = require('url');
const querystring = require('querystring');

const AAA_BASE = 'https://rsi.aaa.biz';
const USERNAME = process.env.AAA_RSI_USERNAME || '';
const PASSWORD = process.env.AAA_RSI_PASSWORD || '';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

function httpsGet(urlStr, cookieStr, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Cookie': cookieStr,
        ...extraHeaders,
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

function httpsPost(urlStr, postBody, cookieStr, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const buf = Buffer.from(postBody, 'utf8');
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length,
        'Cookie': cookieStr,
        ...extraHeaders,
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('Timeout')));
    req.write(buf);
    req.end();
  });
}

function mergeCookies(existing, headers) {
  const raw = headers['set-cookie'] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  const updated = Object.assign({}, existing);
  for (const c of list) {
    if (!c) continue;
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (!m) continue;
    const name = m[1].trim();
    const value = m[2].trim();
    if (c.includes('Max-Age=0') || c.includes('max-age=0')) {
      delete updated[name];
    } else {
      updated[name] = value;
    }
  }
  return updated;
}

function jar2str(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function login() {
  const loginRes = await httpsGet(`${AAA_BASE}/my-account/`, '');
  let jar = mergeCookies({}, loginRes.headers);

  const dom = parseHtml(loginRes.body);
  const nonceEl = dom.querySelector('input[name="woocommerce-login-nonce"]');
  if (!nonceEl) throw new Error('Login nonce not found');
  const nonce = nonceEl.getAttribute('value');
  const refEl = dom.querySelector('input[name="_wp_http_referer"]');
  const referer = refEl ? refEl.getAttribute('value') : '/my-account/';

  const body = querystring.stringify({
    username: USERNAME,
    password: PASSWORD,
    'woocommerce-login-nonce': nonce,
    '_wp_http_referer': referer,
    login: 'Log in',
    rememberme: 'forever',
  });

  const postRes = await httpsPost(`${AAA_BASE}/my-account/`, body, jar2str(jar), {
    Referer: `${AAA_BASE}/my-account/`,
  });
  jar = mergeCookies(jar, postRes.headers);

  const essential = {};
  for (const [k, v] of Object.entries(jar)) {
    if (k.startsWith('wordpress_logged_in_') || k === 'fakesessid') {
      essential[k] = v;
    }
  }

  if (!Object.keys(essential).some(k => k.startsWith('wordpress_logged_in_'))) {
    throw new Error('Auth cookie not received — check credentials');
  }

  return essential;
}

function cleanText(str) {
  return str.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

const LOCKOUT_SKIP = new Set(['Lockout Procedures', 'Opening Instructions', 'Lockout Primary Procedure']);

function parseProcedure(html) {
  const dom = parseHtml(html);
  const result = {};

  // Title
  const titleEl = dom.querySelector('h1.entry-title') || dom.querySelector('h1');
  if (titleEl) result.title = cleanText(titleEl.text);

  // ── Tow procedure pictures table ──────────────────────────────
  const towPicsTable = dom.querySelector('.tow-procedure-pics');
  if (towPicsTable) {
    const headers = towPicsTable.querySelectorAll('th').map(th => cleanText(th.text));
    const tow_cols = [];
    for (const row of towPicsTable.querySelectorAll('tr')) {
      const tds = row.querySelectorAll('td');
      if (tds.length) {
        tds.forEach((td, i) => {
          const imgs = td.querySelectorAll('img').map(img => img.getAttribute('src')).filter(Boolean);
          if (imgs.length) {
            tow_cols.push({ label: headers[i] || '', images: imgs });
          }
        });
        break;
      }
    }
    if (tow_cols.length) result.towPics = tow_cols;
  }

  // ── Lockout structured data ───────────────────────────────────
  const lockoutDiv = dom.querySelector('.lockout-procedure');
  if (lockoutDiv) {
    const lockout = {};

    // Difficulty level (e.g. L-1)
    for (const strong of lockoutDiv.querySelectorAll('strong')) {
      const t = cleanText(strong.text);
      if (/^L-\d+$/.test(t)) { lockout.difficultyLevel = t; break; }
    }

    // Difficulty description
    const textLeft = lockoutDiv.querySelector('.text-left');
    if (textLeft) {
      const em = textLeft.querySelector('em');
      lockout.difficultyDesc = cleanText(em ? em.text : textLeft.text);
    }

    // Lockout pictures (Tool | Upper View | Lower View)
    const picsTable = lockoutDiv.querySelector('.lockout-pictures');
    if (picsTable) {
      const picHeaders = picsTable.querySelectorAll('th').map(th => cleanText(th.text));
      const imgs = picsTable.querySelectorAll('img').map(img => img.getAttribute('src')).filter(Boolean);
      if (imgs.length) {
        lockout.pictures = imgs.map((src, i) => ({ label: picHeaders[i] || '', src }));
      }
    }

    // Warnings and Linkage
    const warnTable = lockoutDiv.querySelector('.lockout-warning-linkage-details');
    if (warnTable) {
      for (const row of warnTable.querySelectorAll('tr')) {
        const th = row.querySelector('th');
        const td = row.querySelector('td');
        if (th && td) {
          const key = cleanText(th.text).toLowerCase();
          const val = cleanText(td.text);
          if (key.includes('warning')) lockout.warnings = val;
          else if (key.includes('linkage')) lockout.linkage = val;
        }
      }
    }

    // Opening instructions
    let openingH2 = null;
    for (const h2 of lockoutDiv.querySelectorAll('h2')) {
      if (h2.text.includes('Opening')) { openingH2 = h2; break; }
    }
    if (openingH2) {
      const parts = [];
      let el = openingH2.nextElementSibling;
      while (el && el.tagName !== 'H2') {
        if (el.tagName !== 'TABLE') {
          const t = cleanText(el.text);
          if (t) parts.push(t);
        }
        el = el.nextElementSibling;
      }
      if (parts.length) lockout.openingInstructions = parts.join(' ');
    }

    // Cautions
    const cautionTable = lockoutDiv.querySelector('.lockout-caution-details');
    if (cautionTable) {
      const td = cautionTable.querySelector('td');
      if (td) lockout.cautions = cleanText(td.text);
    }

    if (Object.keys(lockout).length) result.lockout = lockout;
  }

  // ── Regular h2 sections ───────────────────────────────────────
  const sections = {};
  for (const h2 of dom.querySelectorAll('h2')) {
    const heading = cleanText(h2.text);
    if (!heading || heading.length > 100 || LOCKOUT_SKIP.has(heading)) continue;
    const parts = [];
    let el = h2.nextElementSibling;
    while (el && el.tagName !== 'H2') {
      const t = cleanText(el.text);
      if (t) parts.push(t);
      el = el.nextElementSibling;
    }
    if (parts.length) sections[heading] = parts.join(' ');
  }
  if (Object.keys(sections).length) result.sections = sections;

  return result;
}

exports.handler = async (event) => {
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const params = event.queryStringParameters || {};
  const url = params.url || '';

  if (!url || !url.startsWith(`${AAA_BASE}/procedures/`)) {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Invalid URL' }) };
  }
  if (!USERNAME || !PASSWORD) {
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'AAA_RSI_USERNAME / AAA_RSI_PASSWORD not configured' }) };
  }

  try {
    const essential = await login();
    const procRes = await httpsGet(url, jar2str(essential), {
      Referer: `${AAA_BASE}/procedures/`,
    });

    if (procRes.body.includes('paid subscriber') || procRes.body.includes('woocommerce-login-nonce')) {
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Authentication failed — credentials may be incorrect or account lacks an active subscription' }),
      };
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(parseProcedure(procRes.body)),
    };
  } catch (err) {
    console.error('Error:', err.message);
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
