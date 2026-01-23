import os
import json
from openai import OpenAI

# DeepSeek Configuration
DEEPSEEK_API_KEY = "sk-8210bc52b5c4451a9601e75aadae242d"
BASE_URL = "https://api.deepseek.com"

client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=BASE_URL)

def generate_dse_questions(article_content: str):
    """
    Generate HKDSE Paper 1 style questions from an article using the specific teacher prompt.
    """
    
    system_prompt = """You are an HKDSE English Language Paper 1 (Reading) question setter and marker.
You are fully familiar with HKDSE Paper 1 question types, difficulty level, and marking standards.

TASK
Generate a complete HKDSE Paper 1–style reading question set based only on the provided ARTICLE.

STRUCTURE (must follow exactly)

Section A — Multiple Choice
- 10 questions
- 4 options (A–D) for each question
- Skills tested: main idea, detail, vocabulary in context, inference
- One correct answer per question
- Distractors must be plausible and based on common misreadings of the article

Section B — Short Answer / Information Transfer
- 5 questions
- Each question worth 4 marks
- Question types may include:
  - Short answer
  - Paraphrasing
  - Identifying writer’s views or attitudes
  - Information matching / table completion
- Indicate suggested answer length where appropriate (e.g. 20–30 words)

Section C — Summary / Extended Response
- 1 question
- Suggested length: about 120 words
- Require candidates to select and organise relevant ideas from the article
- Do NOT allow copying long phrases directly from the article

OUTPUT REQUIREMENTS

Your output MUST contain the following THREE parts in this order:

PART 1 — QUESTIONS (Student Version)
(Keep this brief as we will process the JSON)

PART 2 — ANSWERS & MARKING SCHEME (Teacher Version)
(Keep this brief as we will process the JSON)

PART 3 — MACHINE-READABLE JSON
Provide a single JSON object in a code block using the structure below:

{
  "sectionA": [
    {
      "id": "A1",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "answer": "B",
      "skill": "inference"
    }
  ],
  "sectionB": [
    {
      "id": "B1",
      "question": "...",
      "marks": 4,
      "expected_points": ["...", "..."]
    }
  ],
  "sectionC": {
    "question": "...",
    "marks": 10,
    "focus_points": ["...", "..."],
    "word_limit": 120
  }
}

RULES
- Use ONLY information from the ARTICLE
- No outside knowledge or assumptions
- No explanation of reasoning or meta-comments
- English language only
- HKDSE-level difficulty and tone
"""

    user_prompt = f"""
    <ARTICLE>
    {article_content}
    </ARTICLE>
    """

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            stream=False,
            temperature=0.7 # Slight creativity for distractors
        )
        
        content = response.choices[0].message.content
        
        # Extract JSON part
        json_str = ""
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
             json_str = content.split("```")[1].split("```")[0].strip()
        else:
             # Fallback, try to find the start and end of json object
             start = content.find("{")
             end = content.rfind("}") + 1
             if start != -1 and end != -1:
                 json_str = content[start:end]

        if not json_str:
            print("No JSON found in response")
            return []

        data = json.loads(json_str)
        
        # Convert to our unified Question format
        questions = []
        
        # Process Section A (MCQ)
        for item in data.get('sectionA', []):
            questions.append({
                "question_text": f"[Section A] {item.get('question')}",
                "question_type": "mcq",
                "options": item.get('options', []),
                "correct_answer": item.get('answer')  # The letter, e.g., "B"
            })
            
        # Process Section B (Short)
        for item in data.get('sectionB', []):
            questions.append({
                "question_text": f"[Section B] {item.get('question')} ({item.get('marks')} marks)",
                "question_type": "short",
                "options": None,
                "correct_answer": json.dumps(item.get('expected_points')) # Store as stringified JSON
            })
            
        # Process Section C (Long/Summary)
        sect_c = data.get('sectionC', {})
        if sect_c:
             questions.append({
                "question_text": f"[Section C] {sect_c.get('question')} (Word limit: {sect_c.get('word_limit', 120)})",
                "question_type": "long",
                "options": None,
                "correct_answer": json.dumps(sect_c.get('focus_points')) # Store as stringified JSON
            })

        return questions
        
    except Exception as e:
        print(f"Error calling DeepSeek: {e}")
        print("Falling back to dummy data for development.")
        # Fallback dummy data
        return [
            {
                "question_text": "What is the main idea of the passage?",
                "question_type": "mcq",
                "options": ["The history of AI", "The drawbacks of AI", "How AI helps in education", "Future of jobs"],
                "correct_answer": "C"
            },
             {
                "question_text": "According to the text, when was the first computer invented?",
                "question_type": "mcq",
                "options": ["1950", "1980", "2000", "1900"],
                "correct_answer": "A"
            },
            {
                "question_text": "Explain the author's view on technology.",
                "question_type": "short_answer",
                "options": [],
                "correct_answer": "Technology is a double-edged sword..."
            }
        ]

