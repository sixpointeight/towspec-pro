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


def parse_procedure(html):
    soup = BeautifulSoup(html, 'html.parser')

    result = {}

    # Vehicle title and size
    title_el = soup.find('h1', class_='entry-title') or soup.find('h1')
    if title_el:
        result['title'] = clean_text(title_el.get_text())

    size_el = soup.find(string=re.compile(r'\d+".*length.*width', re.I))
    if size_el:
        result['size'] = clean_text(str(size_el))

    # Find all h2 sections inside the article/main content
    # The content headings are h2 tags
    sections = {}
    all_h2 = soup.find_all('h2')

    for h2 in all_h2:
        heading = clean_text(h2.get_text())
        if not heading or len(heading) > 100:
            continue

        # Collect all content until the next h2
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

    # Check for images (vehicle photos, diagrams)
    imgs = []
    for img in soup.find_all('img'):
        src = img.get('src', '')
        alt = img.get('alt', '')
        if src and ('procedure' in src.lower() or 'upload' in src.lower()):
            if not any(x in src for x in ['cbike', 'rsi-light', 'logo']):
                imgs.append({'src': src, 'alt': alt})
    if imgs:
        result['images'] = imgs

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

        # Check if we got bounced to login (session expired)
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


# Serve static files
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
