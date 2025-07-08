import os
import json
import time

# LangChain imports
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate
from langchain.chains import LLMChain
import openai # Keep for APIError if needed for specific error handling

# --- Configuration ---
MODEL_NAME = "gpt-3.5-turbo-0125"  # Or your preferred OpenAI model
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5

# --- 1. LLM and Prompt Setup ---

def get_llm_instance(model_name=MODEL_NAME, temperature=0.3):
    """Initializes and returns the LangChain ChatOpenAI instance."""
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("OPENAI_API_KEY environment variable not set.")
    return ChatOpenAI(
        model_name=model_name,
        temperature=temperature
    )

def get_prioritization_prompt_template():
    """Defines and returns the ChatPromptTemplate for CoT prioritization."""
    system_template_str = """
You are an expert AI QA Analyst. Your task is to analyze a website health check report using a step-by-step reasoning process (Chain-of-Thought).
Based on this analysis, you will prioritize the identified issues and provide actionable advice.

Follow these steps carefully:
1.  **Identify Issues:** List each distinct issue found in the report (broken links, alt text problems, H1 tag issues, console errors).
2.  **Impact Assessment:** For each identified issue, briefly explain its potential impact on:
    a.  User Experience (UX)
    b.  Search Engine Optimization (SEO)
    c.  Accessibility (A11y)
3.  **Severity Assignment:** Based on the impact assessment, assign a severity level (Low, Medium, High) to each issue. Justify your severity rating.
4.  **Prioritized Recommendations:** Create a prioritized list of actions to address these issues. Start with the highest severity issues. For each action, provide a concise suggestion for how to fix it.
5.  **Overall Summary:** Provide a brief overall summary of the website's health based on your analysis.

Present your final output clearly, using markdown for headings and lists where appropriate.
If no significant issues are found across all categories, state that the page appears healthy based on these checks.
"""

    human_template_str = """
Here is the website health report for the URL: {url_checked}
Final URL (after redirects): {final_url}
Page Fetch Status: {fetch_status}

Identified Issues:
<report_data>
{report_details_string}
</report_data>

Please perform the Chain-of-Thought analysis and prioritization as instructed.
"""
    system_message_prompt = SystemMessagePromptTemplate.from_template(system_template_str)
    human_message_prompt = HumanMessagePromptTemplate.from_template(human_template_str)
    return ChatPromptTemplate.from_messages([system_message_prompt, human_message_prompt])

def create_prioritization_llm_chain(llm, prompt_template):
    """Creates and returns an LLMChain for the prioritization task."""
    return LLMChain(
        llm=llm,
        prompt=prompt_template,
        verbose=False  # Set to True for debugging LangChain's internal steps
    )

# --- 2. Data Preparation ---

def format_report_details_for_prompt(health_data_dict):
    """Formats the detailed findings from the health report into a string for the LLM prompt."""
    details_parts = []
    if health_data_dict.get('broken_links'):
        details_parts.append(
            f"Broken Internal Links ({len(health_data_dict['broken_links'])}):\n"
            f"{json.dumps(health_data_dict['broken_links'], indent=2)}"
        )
    if health_data_dict.get('images_missing_alt'):
        details_parts.append(
            f"Images Missing/Empty Alt Text ({len(health_data_dict['images_missing_alt'])}):\n"
            f"{json.dumps(health_data_dict['images_missing_alt'], indent=2)}"
        )
    if health_data_dict.get('h1_status'):
        details_parts.append(
            f"H1 Tag Status:\n{json.dumps(health_data_dict['h1_status'], indent=2)}"
        )
    if health_data_dict.get('console_errors'):
        details_parts.append(
            f"Severe Console Errors ({len(health_data_dict['console_errors'])}):\n"
            f"{json.dumps(health_data_dict['console_errors'], indent=2)}"
        )

    if not details_parts:
        return "No specific issues found in the report sections provided."
    return "\n\n".join(details_parts)

def prepare_input_for_chain(health_data_dict):
    """Prepares the input dictionary for the LLMChain based on the health report."""
    report_details_string = format_report_details_for_prompt(health_data_dict)
    return {
        "url_checked": health_data_dict.get('url_checked', 'N/A'),
        "final_url": health_data_dict.get('final_url', 'N/A'),
        "fetch_status": health_data_dict.get('fetch_status', 'N/A'),
        "report_details_string": report_details_string
    }

# --- 3. Execution and Error Handling ---

def invoke_llm_chain_with_retry(chain, input_data, max_retries=MAX_RETRIES, delay_seconds=RETRY_DELAY_SECONDS):
    """Invokes the LLMChain with retry logic for API errors."""
    last_exception = None
    for attempt in range(max_retries):
        try:
            print(f"\n--- Attempt {attempt + 1}/{max_retries}: Sending data to {chain.llm.model_name} via LangChain for CoT analysis... ---")
            response_dict = chain.invoke(input_data)
            # LLMChain typically returns output in a 'text' key
            ai_analysis_text = response_dict.get('text')
            if ai_analysis_text:
                return ai_analysis_text
            else:
                # This case should be rare if the LLM responds, but good to have
                last_exception = ValueError("LLM response did not contain 'text' output.")
                print(f"Warning: {last_exception} Response: {response_dict}")

        except openai.APIError as e: # More specific OpenAI error handling
            last_exception = e
            print(f"OpenAI API Error on attempt {attempt + 1}: {e}")
            if "insufficient_quota" in str(e).lower():
                # If it's a quota error, no point in retrying immediately
                return f"OpenAI Quota Error: {e}. Please check your OpenAI billing and plan."
        except Exception as e: # Catch other potential errors (network, LangChain specific)
            last_exception = e
            print(f"An unexpected error occurred on attempt {attempt + 1}: {e}")

        if attempt < max_retries - 1:
            print(f"Retrying in {delay_seconds} seconds...")
            time.sleep(delay_seconds)

    return f"Error: LangChain analysis failed after {max_retries} retries. Last error: {last_exception}"

# --- 4. Main Orchestration Function ---

def analyze_with_langchain_cot(health_report_json_str):
    """
    Orchestrates the Chain-of-Thought analysis using LangChain.
    1. Parses input JSON.
    2. Initializes LLM and Chain.
    3. Prepares input data for the chain.
    4. Invokes the chain with retry logic.
    """
    try:
        health_data_dict = json.loads(health_report_json_str)
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON input for health report. Details: {e}"

    try:
        llm = get_llm_instance()
        prompt_template = get_prioritization_prompt_template()
        prioritization_chain = create_prioritization_llm_chain(llm, prompt_template)
        chain_input_data = prepare_input_for_chain(health_data_dict)
    except ValueError as e: # Catches API key not set error from get_llm_instance
        return str(e)
    except Exception as e: # Catch other setup errors
        return f"Error during LangChain setup: {e}"

    return invoke_llm_chain_with_retry(prioritization_chain, chain_input_data)


# --- 5. Test Execution Block ---
if __name__ == "__main__":
    # Example health report with some issues
    example_health_report_with_issues_str = """
    {
      "url_checked": "https://example.com/testpage-issues",
      "final_url": "https://example.com/testpage-issues",
      "fetch_status": "OK",
      "broken_links": [
        {"url": "https://example.com/broken-1", "status_code": 404, "text": "Old Link"},
        {"url": "https://example.com/broken-2", "status_code": 500, "text": "Service Link"}
      ],
      "images_missing_alt": [
        {"src": "img/important.png", "issue": "Missing alt attribute"}
      ],
      "h1_status": {"status": "Missing H1", "count": 0, "texts": []},
      "console_errors": [
        {"level": "SEVERE", "message": "TypeError: x is not a function", "source": "main.js:10"}
      ]
    }
    """

    # Example health report with no significant issues
    example_health_report_no_issues_str = """
    {
      "url_checked": "https://flawless-site.com",
      "final_url": "https://flawless-site.com",
      "fetch_status": "OK",
      "broken_links": [],
      "images_missing_alt": [],
      "h1_status": {"status": "OK", "count": 1, "texts": ["Perfect Main Title"]},
      "console_errors": []
    }
    """

    print("--- Analyzing Report with Issues (LangChain CoT) ---")
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY not set. Skipping test.")
    else:
        ai_analysis_issues = analyze_with_langchain_cot(example_health_report_with_issues_str)
        print("\n--- LangChain CoT Analysis Result (With Issues) ---")
        print(ai_analysis_issues)

    print("\n\n--- Analyzing Report with No Issues (LangChain CoT) ---")
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY not set. Skipping test.")
    else:
        ai_analysis_no_issues = analyze_with_langchain_cot(example_health_report_no_issues_str)
        print("\n--- LangChain CoT Analysis Result (No Issues) ---")
        print(ai_analysis_no_issues)