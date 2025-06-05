from ai_health_analyzer import analyze_health_report_with_ai
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options as ChromeOptions
from webdriver_manager.chrome import ChromeDriverManager
import json
import time
import os

# --- Configuration ---
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 PortfolioHealthChecker/1.0"
REQUEST_TIMEOUT = 10 # seconds for HTTP requests

# --- Helper Functions ---
def get_page_content(url):
    """Fetches HTML content of a page and the final URL after redirects."""
    headers = {'User-Agent': USER_AGENT}
    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        response.raise_for_status() # Raises an HTTPError for bad responses (4XX or 5XX)
        # Use response.url to get the final URL after any redirects
        return response.text, response.url
    except requests.exceptions.RequestException as e:
        print(f"Error fetching {url}: {e}")
        return None, url # Return original URL if fetch failed

def is_internal_link(link_url, base_domain):
    """Checks if a link is internal to the base_domain."""
    return urlparse(link_url).netloc == base_domain

# --- Checker Functions ---

def check_broken_links(soup, page_url):
    """
    Finds all links on the page and checks their status codes.
    Only checks internal links by default to keep scope manageable.
    """
    broken_links = []
    internal_links_to_check = set() # Use a set to avoid duplicate checks
    base_domain = urlparse(page_url).netloc

    for anchor_tag in soup.find_all('a', href=True):
        href = anchor_tag['href']
        if not href or href.startswith('#') or href.startswith('mailto:') or href.startswith('tel:'):
            continue

        absolute_url = urljoin(page_url, href) # Resolve relative URLs

        if is_internal_link(absolute_url, base_domain):
            internal_links_to_check.add(absolute_url)

    print(f"Found {len(internal_links_to_check)} unique internal links to check.")
    for link_url in internal_links_to_check:
        try:
            # Use HEAD request to be faster and save bandwidth, fallback to GET if HEAD fails
            # Some servers might not correctly implement HEAD
            headers = {'User-Agent': USER_AGENT}
            response = requests.head(link_url, headers=headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
            if response.status_code >= 400:
                # If HEAD fails, try GET as a fallback for a more robust check
                print(f"HEAD request for {link_url} failed with {response.status_code}. Trying GET...")
                response_get = requests.get(link_url, headers=headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
                if response_get.status_code >= 400:
                    broken_links.append({'url': link_url, 'status_code': response_get.status_code, 'text': anchor_tag.get_text(strip=True)})
            # Optional: Add a small delay to be polite to servers
            # time.sleep(0.1)
        except requests.exceptions.Timeout:
            broken_links.append({'url': link_url, 'status_code': 'Timeout', 'text': anchor_tag.get_text(strip=True)})
        except requests.exceptions.RequestException as e:
            broken_links.append({'url': link_url, 'status_code': str(e), 'text': anchor_tag.get_text(strip=True)})
    return broken_links

def check_alt_texts(soup):
    """Checks for images missing alt text or with empty alt text."""
    images_missing_alt = []
    for img_tag in soup.find_all('img'):
        alt_text = img_tag.get('alt')
        src = img_tag.get('src', 'N/A')
        if alt_text is None:
            images_missing_alt.append({'src': src, 'issue': 'Missing alt attribute'})
        elif not alt_text.strip():
            images_missing_alt.append({'src': src, 'issue': 'Empty alt attribute'})
    return images_missing_alt

def check_h1_tags(soup):
    """Checks for the number of H1 tags."""
    h1_tags = soup.find_all('h1')
    count = len(h1_tags)
    texts = [h1.get_text(strip=True) for h1 in h1_tags]
    if count == 1:
        return {'status': 'OK', 'count': count, 'texts': texts}
    elif count == 0:
        return {'status': 'Missing H1', 'count': count, 'texts': texts}
    else:
        return {'status': 'Multiple H1s', 'count': count, 'texts': texts}

def check_console_errors(page_url):
    """Uses Selenium to load the page and check for JavaScript console errors."""
    console_errors = []
    chrome_options = ChromeOptions()
    chrome_options.add_argument("--headless")  # Run in headless mode
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--log-level=3") # Suppress non-critical logs from ChromeDriver
    # Enable logging preferences for browser console
    chrome_options.set_capability('goog:loggingPrefs', {'browser': 'SEVERE'})


    print(f"Initializing WebDriver for {page_url}...")
    driver = None # Initialize driver to None
    try:
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        driver.get(page_url)
        # Wait a bit for dynamic content to load and potentially trigger errors
        time.sleep(3) # Adjust as needed

        logs = driver.get_log('browser')
        for entry in logs:
            # We only care about severe errors for this basic check
            if entry['level'] == 'SEVERE':
                console_errors.append({
                    'level': entry['level'],
                    'message': entry['message'],
                    'source': entry.get('source', 'N/A'), # Sometimes source might not be available
                    'timestamp': entry['timestamp']
                })
    except Exception as e:
        print(f"Selenium error checking console for {page_url}: {e}")
        console_errors.append({'level': 'DRIVER_ERROR', 'message': str(e)})
    finally:
        if driver:
            driver.quit()
    return console_errors

# --- Main Orchestrator ---
def run_website_health_checks(start_url):
    """Runs all health checks for the given URL."""
    print(f"Starting health check for: {start_url}\n")
    results = {
        'url_checked': start_url,
        'final_url': start_url, # Will be updated if redirected
        'fetch_status': 'OK',
        'broken_links': [],
        'images_missing_alt': [],
        'h1_status': {},
        'console_errors': []
    }

    html_content, final_url = get_page_content(start_url)
    results['final_url'] = final_url

    if not html_content:
        results['fetch_status'] = f"Failed to fetch content for {start_url}"
        print(f"Aborting checks for {start_url} due to fetch failure.")
        return results

    soup = BeautifulSoup(html_content, 'html.parser')

    print("\n--- Checking Broken Links (Internal) ---")
    results['broken_links'] = check_broken_links(soup, final_url)
    print(f"Found {len(results['broken_links'])} broken internal links.")

    print("\n--- Checking Image Alt Texts ---")
    results['images_missing_alt'] = check_alt_texts(soup)
    print(f"Found {len(results['images_missing_alt'])} images with alt text issues.")

    print("\n--- Checking H1 Tags ---")
    results['h1_status'] = check_h1_tags(soup)
    print(f"H1 Tag Status: {results['h1_status']['status']} (Count: {results['h1_status']['count']})")

    print("\n--- Checking Console Errors (via Selenium) ---")
    # Only run Selenium if the initial page load was successful
    results['console_errors'] = check_console_errors(final_url)
    print(f"Found {len(results['console_errors'])} SEVERE console errors.")

    print("\n--- Health Check Complete ---")
    return results

# --- Main execution ---
if __name__ == "__main__":
    # target_url = "https://www.google.com" # A generally healthy site
    # target_url = "https://httpstat.us/404" # A site that is a 404
    # target_url = "https://jigsaw.w3.org/ अमआ FidlerProxy/ErroPage_files/image002.gif" # Example that might timeout or fail
    target_url = input("Enter the URL to check: ")

    if not target_url.startswith(('http://', 'https://')):
        print("Invalid URL. Please include http:// or https://")
    else:
        health_report = run_website_health_checks(target_url)

        # Output the raw JSON report
        print("\n\n--- Raw JSON Health Report ---")
        health_report_json_str = json.dumps(health_report, indent=2)
        print(health_report_json_str)

        # You can save this JSON to a file if needed
        with open('health_report.json', 'w') as f:
             json.dump(health_report, f, indent=2)
        print("\nReport saved to health_report.json")

        # --- Call the AI Analyzer ---
        print("\n\n--- AI-Powered Analysis & Summary ---")
        if os.getenv("OPENAI_API_KEY"): # Only proceed if API key is available
            ai_summary = analyze_health_report_with_ai(health_report_json_str)
            print(ai_summary)
        else:
            print("Skipping AI analysis: OPENAI_API_KEY not set.")