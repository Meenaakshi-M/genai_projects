import openai
import json
import os
import time

# --- Configuration ---
# Ensure your OPENAI_API_KEY is set as an environment variable
# openai.api_key = os.getenv("OPENAI_API_KEY") # For older openai library versions
# For openai v1.0.0+ client is initialized like this:
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MODEL_NAME = "gpt-3.5-turbo" # Or "gpt-4" if you have access and prefer higher quality (and cost)
MAX_RETRIES = 3
RETRY_DELAY = 5 # seconds

# --- AI Agent Function ---

def analyze_health_report_with_ai(health_report_json_str):
    """
    Sends the website health report to an LLM for analysis and suggestions.
    """
    if not client.api_key:
        return "Error: OPENAI_API_KEY not found. Please set it as an environment variable."

    try:
        health_data = json.loads(health_report_json_str)
    except json.JSONDecodeError:
        return "Error: Invalid JSON input for health report."

    # Construct a detailed prompt
    prompt_messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful AI QA Assistant. Your task is to analyze a website health check report, "
                "summarize the findings, prioritize issues by potential impact (user experience, SEO, accessibility), "
                "and suggest general best practices for fixing common types of issues found. "
                "Be concise yet informative. Use markdown for formatting if appropriate (e.g., lists)."
            )
        },
        {
            "role": "user",
            "content": f"""
            Please analyze the following website health report:

            URL Checked: {health_data.get('url_checked')}
            Final URL (after redirects): {health_data.get('final_url')}
            Page Fetch Status: {health_data.get('fetch_status')}

            Broken Internal Links Found ({len(health_data.get('broken_links', []))}):
            {json.dumps(health_data.get('broken_links', []), indent=2) if health_data.get('broken_links') else "None"}

            Images Missing or with Empty Alt Text ({len(health_data.get('images_missing_alt', []))}):
            {json.dumps(health_data.get('images_missing_alt', []), indent=2) if health_data.get('images_missing_alt') else "None"}

            H1 Tag Status:
            {json.dumps(health_data.get('h1_status', {}), indent=2) if health_data.get('h1_status') else "Not checked"}

            Severe Console Errors Found ({len(health_data.get('console_errors', []))}):
            {json.dumps(health_data.get('console_errors', []), indent=2) if health_data.get('console_errors') else "None"}

            ---
            Based on this report, provide:
            1. A concise overall summary of the website's health.
            2. Prioritized list of issues (if any) with a brief explanation of their potential impact.
            3. General actionable advice or best practices for addressing the types of issues found.
            If no significant issues are found, acknowledge that the page appears to be in good health based on these checks.
            """
        }
    ]

    print(f"\n--- Sending data to {MODEL_NAME} for analysis... ---")

    for attempt in range(MAX_RETRIES):
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=prompt_messages,
                temperature=0.5, # Lower temperature for more factual, less creative output
                max_tokens=1000 # Adjust as needed based on expected output length
            )
            # Ensure the response structure is as expected
            if response.choices and response.choices[0].message:
                ai_summary = response.choices[0].message.content.strip()
                return ai_summary
            else:
                print(f"Warning: Unexpected API response structure on attempt {attempt + 1}.")
                # Log or handle unexpected structure, e.g. by returning an error or default message
                if attempt == MAX_RETRIES - 1:
                    return "Error: Received unexpected API response structure after multiple retries."

        except openai.APIError as e: # Catch OpenAI specific errors
            print(f"OpenAI API Error on attempt {attempt + 1}/{MAX_RETRIES}: {e}")
            if attempt == MAX_RETRIES - 1:
                return f"Error: OpenAI API request failed after {MAX_RETRIES} retries: {e}"
            print(f"Retrying in {RETRY_DELAY} seconds...")
            time.sleep(RETRY_DELAY)
        except Exception as e: # Catch other potential errors (network, etc.)
            print(f"An unexpected error occurred on attempt {attempt + 1}/{MAX_RETRIES}: {e}")
            if attempt == MAX_RETRIES - 1:
                return f"Error: An unexpected error occurred after {MAX_RETRIES} retries: {e}"
            print(f"Retrying in {RETRY_DELAY} seconds...")
            time.sleep(RETRY_DELAY)

    return "Error: AI analysis failed after multiple retries."


# --- Main execution (for testing this script directly) ---
if __name__ == "__main__":
    # This is example JSON data. In a real scenario,
    # this would come from running website_health_checker.py
    example_health_report_str = """
    {
      "url_checked": "https://example.com/testpage",
      "final_url": "https://example.com/testpage",
      "fetch_status": "OK",
      "broken_links": [
        {
          "url": "https://example.com/broken-page",
          "status_code": 404,
          "text": "Broken Link Text"
        }
      ],
      "images_missing_alt": [
        {
          "src": "images/logo_no_alt.png",
          "issue": "Missing alt attribute"
        },
        {
          "src": "images/banner_empty_alt.jpg",
          "issue": "Empty alt attribute"
        }
      ],
      "h1_status": {
        "status": "Multiple H1s",
        "count": 2,
        "texts": ["Main Title", "Another H1"]
      },
      "console_errors": [
        {
          "level": "SEVERE",
          "message": "Uncaught TypeError: Cannot read property 'doSomething' of undefined",
          "source": "https://example.com/scripts/main.js?ver=1.2.3:45:12",
          "timestamp": 1678886400000
        }
      ]
    }
    """

    # Simulate a case with no issues
    example_no_issues_report_str = """
    {
      "url_checked": "https://flawless-site.com",
      "final_url": "https://flawless-site.com",
      "fetch_status": "OK",
      "broken_links": [],
      "images_missing_alt": [],
      "h1_status": {
        "status": "OK",
        "count": 1,
        "texts": ["Perfect Main Title"]
      },
      "console_errors": []
    }
    """

    print("--- Analyzing Report with Issues ---")
    ai_analysis = analyze_health_report_with_ai(example_health_report_str)
    print("\n--- AI Analysis Result ---")
    print(ai_analysis)

    print("\n\n--- Analyzing Report with No Issues ---")
    ai_analysis_no_issues = analyze_health_report_with_ai(example_no_issues_report_str)
    print("\n--- AI Analysis Result (No Issues) ---")
    print(ai_analysis_no_issues)