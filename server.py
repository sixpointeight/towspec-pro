import os
import re
import json
import threading
import requests
from flask import Flask, send_from_directory, jsonify, request
from bs4 import BeautifulSoup

app = Flask(__name__, static_folder='.')

AAA_BASE = 'https://rsi.aaa.biz'
USERNAME = os.environ.get('AAA_RSI_USERNAME', '')
PASSWORD = os.environ.get('AAA_RSI_PASSWORD', '')

session_lock = threading.Lock()
aaa_session = None


def create_session():
    s = requests.Session()
    s.headers.update({'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'})
    return s


def login():
    global aaa_session
    s = create_session()
    try:
        r = s.get(f'{AAA_BASE}/my-account/', timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        nonce_el = soup.find('input', {'name': 'woocommerce-login-nonce'})
        referer_el = soup.find('input', {'name': '_wp_http_referer'})
        if not nonce_el:
            print('ERROR: Could not find login nonce')
            return None
        data = {
            'username': USERNAME,
            'password': PASSWORD,
            'woocommerce-login-nonce': nonce_el['value'],
            '_wp_http_referer': referer_el['value'] if referer_el else '/my-account/',
            'login': 'Log in',
            'rememberme': 'forever',
        }
        r2 = s.post(f'{AAA_BASE}/my-account/', data=data, allow_redirects=True, timeout=15)
        if 'log-out' in r2.text or 'logout' in r2.text or r2.url != f'{AAA_BASE}/my-account/':
            print(f'Login successful. Redirected to: {r2.url}')
            aaa_session = s
            return s
        else:
            print('Login may have failed — no logout link found')
            aaa_session = s
            return s
    except Exception as e:
        print(f'Login error: {e}')
        return None


def get_session():
    global aaa_session
    with session_lock:
        if aaa_session is None:
            login()
        return aaa_session


def clean_text(text):
    text = re.sub(r'\s+', ' ', text).strip()
    return text


LOCKOUT_SKIP = {'Lockout Procedures', 'Opening Instructions', 'Lockout Primary Procedure'}


def parse_procedure(html):
    soup = BeautifulSoup(html, 'html.parser')
    result = {}

    # Vehicle title
    title_el = soup.find('h1', class_='entry-title') or soup.find('h1')
    if title_el:
        result['title'] = clean_text(title_el.get_text())

    # ── Tow procedure pictures table ──────────────────────────────
    tow_pics_table = soup.find('table', class_='tow-procedure-pics')
    if tow_pics_table:
        headers = [clean_text(th.get_text()) for th in tow_pics_table.find_all('th')]
        tow_cols = []
        for row in tow_pics_table.find_all('tr'):
            tds = row.find_all('td')
            if tds:
                for i, td in enumerate(tds):
                    imgs = [img.get('src', '') for img in td.find_all('img') if img.get('src')]
                    if imgs:
                        label = headers[i] if i < len(headers) else ''
                        tow_cols.append({'label': label, 'images': imgs})
                break
        if tow_cols:
            result['towPics'] = tow_cols

    # ── Lockout structured data ───────────────────────────────────
    lockout_div = soup.find('div', class_='lockout-procedure')
    if lockout_div:
        lockout = {}

        # Difficulty level (e.g. L-1)
        for strong in lockout_div.find_all('strong'):
            txt = clean_text(strong.get_text())
            if re.match(r'^L-\d+$', txt):
                lockout['difficultyLevel'] = txt
                break

        # Difficulty description
        text_left = lockout_div.find('p', class_='text-left')
        if text_left:
            em = text_left.find('em')
            lockout['difficultyDesc'] = clean_text(em.get_text() if em else text_left.get_text())

        # Lockout pictures (Tool | Upper View | Lower View)
        pics_table = lockout_div.find('table', class_='lockout-pictures')
        if pics_table:
            pic_headers = [clean_text(th.get_text()) for th in pics_table.find_all('th')]
            imgs = [img.get('src', '') for img in pics_table.find_all('img') if img.get('src')]
            if imgs:
                lockout['pictures'] = [
                    {'label': pic_headers[i] if i < len(pic_headers) else '', 'src': imgs[i]}
                    for i in range(len(imgs))
                ]

        # Warnings and Linkage
        warn_table = lockout_div.find('table', class_='lockout-warning-linkage-details')
        if warn_table:
            for row in warn_table.find_all('tr'):
                th = row.find('th')
                td = row.find('td')
                if th and td:
                    key = clean_text(th.get_text()).lower()
                    val = clean_text(td.get_text())
                    if 'warning' in key:
                        lockout['warnings'] = val
                    elif 'linkage' in key:
                        lockout['linkage'] = val

        # Opening instructions
        opening_h2 = None
        for h2 in lockout_div.find_all('h2'):
            if 'opening' in h2.get_text().lower():
                opening_h2 = h2
                break
        if opening_h2:
            parts = []
            el = opening_h2.find_next_sibling()
            while el and el.name != 'h2':
                if el.name != 'table':
                    t = clean_text(el.get_text(separator=' '))
                    if t:
                        parts.append(t)
                el = el.find_next_sibling()
            if parts:
                lockout['openingInstructions'] = ' '.join(parts)

        # Cautions
        caution_table = lockout_div.find('table', class_='lockout-caution-details')
        if caution_table:
            td = caution_table.find('td')
            if td:
                lockout['cautions'] = clean_text(td.get_text())

        if lockout:
            result['lockout'] = lockout

    # ── Regular h2 sections ───────────────────────────────────────
    sections = {}
    for h2 in soup.find_all('h2'):
        heading = clean_text(h2.get_text())
        if not heading or len(heading) > 100 or heading in LOCKOUT_SKIP:
            continue
        content_parts = []
        el = h2.find_next_sibling()
        while el and el.name != 'h2':
            text = clean_text(el.get_text(separator=' '))
            if text:
                content_parts.append(text)
            el = el.find_next_sibling()
        if content_parts:
            sections[heading] = ' '.join(content_parts)

    if sections:
        result['sections'] = sections

    return result


@app.route('/api/procedure')
def procedure():
    url = request.args.get('url', '').strip()
    if not url or not url.startswith(f'{AAA_BASE}/procedures/'):
        return jsonify({'error': 'Invalid URL'}), 400

    s = get_session()
    if s is None:
        return jsonify({'error': 'Authentication failed'}), 500

    try:
        r = s.get(url, timeout=20)

        if 'paid subscriber' in r.text or 'woocommerce-login-nonce' in r.text:
            print('Session expired, re-logging in...')
            with session_lock:
                login()
            s = aaa_session
            r = s.get(url, timeout=20)

        if r.status_code != 200:
            return jsonify({'error': f'HTTP {r.status_code}'}), r.status_code

        parsed = parse_procedure(r.text)
        return jsonify(parsed)

    except Exception as e:
        print(f'Fetch error for {url}: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)


if __name__ == '__main__':
    print('Logging in to AAA RSI...')
    login()
    print(f'Starting server on port 5000...')
    app.run(host='0.0.0.0', port=5000, debug=False)
