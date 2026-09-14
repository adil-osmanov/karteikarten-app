import google.generativeai as genai
import os

try:
    if "GEMINI_API_KEY" in os.environ:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content('Write a 5-word sentence in German.')
    print("SUCCESS:", response.text)
except Exception as e:
    print("FAILED:", str(e))
