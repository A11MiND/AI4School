import os
import json
from typing import Dict, List, Optional
from openai import OpenAI

# DeepSeek Configuration
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=BASE_URL)

def _format_list(values: Optional[List[str]]) -> str:
    if not values:
        return "default reading mix"
    return ", ".join([v for v in values if v])

def _build_generation_options(options: Optional[Dict[str, object]]) -> str:
    if not options:
        return ""

    difficulty = options.get("difficulty") or "medium"
    objectives = _format_list(options.get("assessment_objectives"))
    formats = _format_list(options.get("question_formats"))
    strictness = options.get("marking_strictness") or "moderate"
    text_type = options.get("text_type") or "unspecified"
    register = options.get("register") or "unspecified"
    cognitive_load = options.get("cognitive_load") or "unspecified"
    format_counts = options.get("question_format_counts") or {}
    counts_text = ", ".join([f"{k}:{v}" for k, v in format_counts.items() if v is not None])

    return f"""
CUSTOMIZATION (apply these preferences strictly):
- Difficulty: {difficulty}
- Assessment objectives: {objectives}
- Question formats: {formats}
- Question counts: {counts_text or 'use sensible defaults'}
- Marking strictness: {strictness}
- Text type: {text_type}
- Register: {register}
- Cognitive load: {cognitive_load}
"""

def generate_dse_questions(article_content: str, options: Optional[Dict[str, object]] = None):
    """
    Generate HKDSE Paper 1 style questions from an article using a customizable prompt.
    """
    options_block = _build_generation_options(options)
    
    system_prompt = f"""You are an HKDSE English Language Paper 1 (Reading) question setter and marker.
You are fully familiar with HKDSE Paper 1 question types, difficulty level, and marking standards.

{options_block}

TASK
Generate a complete HKDSE Paper 1–style reading question set based only on the provided ARTICLE.

STRUCTURE
Generate questions that match the selected Question formats only. If a format is not selected, do NOT include it.
Use a balanced mix across the selected formats.

OUTPUT REQUIREMENTS

Your output MUST contain the following THREE parts in this order:

PART 1 — QUESTIONS (Student Version)
(Keep this brief as we will process the JSON)

PART 2 — ANSWERS & MARKING SCHEME (Teacher Version)
(Keep this brief as we will process the JSON)

PART 3 — MACHINE-READABLE JSON
Provide a single JSON object in a code block using the structure below:

{{
    "questions": [
        {{
            "id": "Q1",
            "question_text": "...",
            "question_type": "mc|tf|matching|gap|short_answer|sentence_completion|summary|open_ended|table|phrase_extraction",
            "options": ["A", "B", "C", "D"],
            "correct_answer": "B",
            "marks": 1,
            "expected_points": ["...", "..."]
        }}
    ]
}}

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

        if isinstance(data.get("questions"), list):
            for item in data.get("questions", []):
                question_type = item.get("question_type") or item.get("type") or "short_answer"
                expected_points = item.get("expected_points")
                focus_points = item.get("focus_points")
                correct_answer = item.get("correct_answer")
                if expected_points is not None:
                    correct_answer = json.dumps(expected_points)
                elif focus_points is not None:
                    correct_answer = json.dumps(focus_points)

                questions.append({
                    "question_text": item.get("question_text") or item.get("question") or "",
                    "question_type": question_type,
                    "options": item.get("options", None),
                    "correct_answer": correct_answer
                })
        else:
            # Legacy Section A (MCQ)
            for item in data.get('sectionA', []):
                questions.append({
                    "question_text": f"[Section A] {item.get('question')}",
                    "question_type": "mcq",
                    "options": item.get('options', []),
                    "correct_answer": item.get('answer')  # The letter, e.g., "B"
                })
                
            # Legacy Section B (Short)
            for item in data.get('sectionB', []):
                questions.append({
                    "question_text": f"[Section B] {item.get('question')} ({item.get('marks')} marks)",
                    "question_type": "short",
                    "options": None,
                    "correct_answer": json.dumps(item.get('expected_points')) # Store as stringified JSON
                })
                
            # Legacy Section C (Long/Summary)
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


def _extract_json_block(content: str) -> Optional[Dict[str, object]]:
    if not content:
        return None

    json_str = ""
    if "```json" in content:
        json_str = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        json_str = content.split("```")[1].split("```")[0].strip()
    else:
        start = content.find("{")
        end = content.rfind("}") + 1
        if start != -1 and end != -1:
            json_str = content[start:end]

    if not json_str:
        return None

    try:
        return json.loads(json_str)
    except Exception:
        return None


def grade_open_answer(
    question_text: str,
    expected_points: Optional[object],
    student_answer: str,
    strictness: str = "moderate",
    max_tokens: int = 180,
    max_chars: int = 1200
) -> float:
    if not student_answer:
        return 0.0

    trimmed_answer = student_answer[:max_chars]

    if isinstance(expected_points, str):
        try:
            expected_points = json.loads(expected_points)
        except Exception:
            pass

    expected_points_text = expected_points
    if isinstance(expected_points, list):
        expected_points_text = "; ".join([str(x) for x in expected_points])

    system_prompt = """You are an HKDSE Reading short/long answer grader.
Grade the student response against the expected points.
Return a JSON object with keys: score (0-1 float), rationale (1-2 sentences).
Be strict about the requested strictness level: strict, moderate, or lenient.
"""

    user_prompt = f"""
Question: {question_text}
Expected points: {expected_points_text}
Strictness: {strictness}
Student answer: {trimmed_answer}
"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            stream=False,
            temperature=0.2,
            max_tokens=max_tokens
        )
        content = response.choices[0].message.content
        data = _extract_json_block(content)
        if not data:
            return 0.0

        score = float(data.get("score", 0))
        if score < 0:
            return 0.0
        if score > 1:
            return 1.0
        return score
    except Exception as e:
        print(f"Error grading answer: {e}")
        return 0.0

