import os
import json
import re
from typing import Dict, List, Optional, Tuple
import requests
from openai import OpenAI

def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    return os.getenv(name, default)

def _format_list(values: Optional[List[str]]) -> str:
    if not values:
        return "default reading mix"
    return ", ".join([v for v in values if v])

def _build_generation_options(options: Optional[Dict[str, object]]) -> str:
    if not options:
        return ""

    difficulty = options.get("difficulty") or "medium"
    objectives = _format_list(options.get("assessment_objectives"))
    formats_list = [fmt for fmt in (options.get("question_formats") or []) if fmt and fmt != "table"]
    formats = _format_list(formats_list)
    strictness = options.get("marking_strictness") or "moderate"
    text_type = options.get("text_type") or "unspecified"
    register = options.get("register") or "unspecified"
    cognitive_load = options.get("cognitive_load") or "unspecified"
    format_counts = options.get("question_format_counts") or {}
    filtered_counts = {k: v for k, v in format_counts.items() if k != "table"}
    counts_text = ", ".join([f"{k}:{v}" for k, v in filtered_counts.items() if v is not None])

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

def _normalize_option_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return re.sub(r"^[A-Ga-g][\.|\)]\s+", "", text)

def _normalize_mc_answer(value: Optional[str]) -> Optional[str]:
    """Normalize MCQ correct_answer to a single uppercase letter A/B/C/D."""
    if value is None:
        return None
    text = str(value).strip().upper()
    # Extract the first letter if it's a valid option at start
    match = re.match(r"^([A-D])(?:\.|$|\s|,|\))", text)
    if match:
        return match.group(1)
    # Handle "Option A" or "Answer: B" patterns - look for standalone letter
    option_match = re.search(r"(?:OPTION|ANSWER|CHOICE|CORRECT)[:\s]+([A-D])\b", text)
    if option_match:
        return option_match.group(1)
    # Last resort: find any standalone single letter A-D
    standalone_match = re.search(r"(?<![A-Z])([A-D])(?![A-Z])", text)
    if standalone_match:
        return standalone_match.group(1)
    return value

def _normalize_tf_answer(value: Optional[str]) -> Optional[str]:
    """Normalize TF correct_answer to T/F/NG."""
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in ('t', 'true', 'yes'):
        return 'T'
    if text in ('f', 'false', 'no'):
        return 'F'
    if text in ('ng', 'not given', 'not_given', 'notgiven', 'n/a', 'na'):
        return 'NG'
    # Return original if unrecognized
    return value.strip().upper() if value else None

def _resolve_ai_config(options: Optional[Dict[str, object]]) -> Tuple[str, str]:
    provider = _env("DEFAULT_AI_PROVIDER", "deepseek")
    model = ""
    if options:
        provider = options.get("ai_provider") or provider
        model = options.get("ai_model") or ""

    if provider == "qwen":
        return provider, model or (_env("QWEN_MODEL", "qwen-plus") or "qwen-plus")
    if provider == "gemini":
        return provider, model or (_env("VERTEX_MODEL", "gemini-1.5-pro") or "gemini-1.5-pro")
    return "deepseek", model or (_env("DEEPSEEK_MODEL", "deepseek-chat") or "deepseek-chat")

def _get_openai_client(provider: str) -> OpenAI:
    if provider == "qwen":
        api_key = _env("QWEN_API_KEY")
        if not api_key:
            raise ValueError("QWEN_API_KEY not configured")
        api_key = api_key.strip()  # Ensure no whitespace
        base_url = _env("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
        return OpenAI(api_key=api_key, base_url=base_url)
    api_key = _env("DEEPSEEK_API_KEY")
    if not api_key:
        raise ValueError("DEEPSEEK_API_KEY not configured")
    api_key = api_key.strip()  # Ensure no whitespace
    base_url = _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    return OpenAI(api_key=api_key, base_url=base_url)

def _get_vertex_credentials():
    service_json = _env("VERTEX_SERVICE_ACCOUNT_JSON")
    if service_json:
        from google.oauth2 import service_account
        info = json.loads(service_json)
        return service_account.Credentials.from_service_account_info(info)
    credentials_path = _env("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_path:
        from google.oauth2 import service_account
        return service_account.Credentials.from_service_account_file(credentials_path)
    raise ValueError("Vertex credentials not configured")

def _call_vertex_gemini(system_prompt: str, user_prompt: str, model: str, temperature: float, max_tokens: int) -> str:
    project_id = _env("VERTEX_PROJECT_ID")
    if not project_id:
        raise ValueError("VERTEX_PROJECT_ID not configured")
    location = _env("VERTEX_LOCATION", "us-central1")

    creds = _get_vertex_credentials()
    scoped = creds.with_scopes(["https://www.googleapis.com/auth/cloud-platform"])
    from google.auth.transport.requests import Request
    scoped.refresh(Request())

    url = (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project_id}/locations/{location}/publishers/google/"
        f"models/{model}:generateContent"
    )
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": user_prompt}]}
        ],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens
        }
    }
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {scoped.token}"},
        json=payload,
        timeout=60
    )
    resp.raise_for_status()
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join([p.get("text", "") for p in parts])

def _call_chat(provider: str, model: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    if provider == "gemini":
        return _call_vertex_gemini(system_prompt, user_prompt, model, temperature, max_tokens)

    client = _get_openai_client(provider)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        stream=False,
        temperature=temperature,
        max_tokens=max_tokens
    )
    return response.choices[0].message.content

def _format_matching_answer(value: Optional[object]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        pairs: List[str] = []
        for item in value:
            if isinstance(item, dict):
                if len(item) == 1:
                    key, match = next(iter(item.items()))
                    pairs.append(f"{key}->{match}")
                    continue
                left = item.get("left") or item.get("item") or item.get("question") or item.get("prompt")
                right = item.get("right") or item.get("match") or item.get("option") or item.get("answer")
                if left is not None and right is not None:
                    pairs.append(f"{left}->{right}")
                    continue
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                pairs.append(f"{item[0]}->{item[1]}")
                continue
            if isinstance(item, str):
                pairs.append(item)
        if pairs:
            return ", ".join(pairs)
        return json.dumps(value)
    if isinstance(value, dict):
        if isinstance(value.get("pairs"), list):
            return _format_matching_answer(value.get("pairs"))
        if isinstance(value.get("matches"), list):
            return _format_matching_answer(value.get("matches"))
        if isinstance(value.get("answer"), str):
            return value.get("answer")
        pairs = [f"{key}->{match}" for key, match in value.items()]
        return ", ".join(pairs)
    return str(value)

def generate_dse_questions(article_content: str, options: Optional[Dict[str, object]] = None):
    """
    Generate HKDSE Paper 1 style questions from an article using a customizable prompt.
    """
    options_block = _build_generation_options(options)
    provider, model = _resolve_ai_config(options)
    
    system_prompt = (
        "You are an HKDSE English Language Paper 1 (Reading) question setter and marker.\n"
        "You are fully familiar with HKDSE Paper 1 question types, difficulty level, and marking standards.\n\n"
        f"{options_block}\n"
        "TASK\n"
        "Generate a complete HKDSE Paper 1–style reading question set based only on the provided ARTICLE.\n\n"
        "STRUCTURE\n"
        "Generate questions that match the selected Question formats only. If a format is not selected, do NOT include it.\n"
        "Use a balanced mix across the selected formats.\n\n"
        "OUTPUT REQUIREMENTS\n\n"
        "Return ONLY a JSON object inside a JSON code block. Do NOT add any other text.\n\n"
        "JSON SCHEMA\n"
        "{\n"
        "  \"questions\": [\n"
        "    {\n"
        "      \"id\": \"Q1\",\n"
        "      \"question_text\": \"...\",\n"
        "      \"question_type\": \"mc|tf|matching|gap|short_answer|sentence_completion|summary|open_ended|phrase_extraction\",\n"
        "      \"options\": [\"...\"],\n"
        "      \"correct_answer\": \"...\",\n"
        "      \"marks\": 1,\n"
        "      \"expected_points\": [\"...\", \"...\"]\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "ANSWER FORMAT RULES (MUST FOLLOW)\n"
        "- mc: options = 4 choices (no labels like \"A.\"), correct_answer = one letter \"A\"/\"B\"/\"C\"/\"D\" only.\n"
        "- tf: options = [\"T\",\"F\",\"NG\"], correct_answer = \"T\" or \"F\" or \"NG\" only.\n"
        "- gap / sentence_completion: correct_answer = exact word/phrase from passage.\n"
        "- matching: question_text includes LEFT list (1.,2.,3.); options = RIGHT list only; correct_answer = \"1->C, 2->A\".\n"
        "- short_answer / summary / open_ended / phrase_extraction: expected_points = list of key points; correct_answer may be empty.\n\n"
        "RULES\n"
        "- Use ONLY information from the ARTICLE\n"
        "- No outside knowledge or assumptions\n"
        "- No explanation of reasoning or meta-comments\n"
        "- English language only\n"
        "- HKDSE-level difficulty and tone\n"
    )

    user_prompt = f"""
    <ARTICLE>
    {article_content}
    </ARTICLE>
    """

    try:
        temperature = 0.2 if provider in {"qwen", "gemini"} else 0.4
        content = _call_chat(
            provider=provider,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=2000
        )
        
        data = _extract_json_block(content)
        if not data:
            if os.getenv("AI_DEBUG_LOG") == "1":
                preview = content[:2000] if content else ""
                print(f"AI raw output (first 2000 chars): {preview}")
            retry_system_prompt = system_prompt + "\nRETURN ONLY THE JSON OBJECT IN A JSON CODE BLOCK. DO NOT ADD ANY OTHER TEXT."
            retry_content = _call_chat(
                provider=provider,
                model=model,
                system_prompt=retry_system_prompt,
                user_prompt=user_prompt,
                temperature=0.2,
                max_tokens=2000
            )
            data = _extract_json_block(retry_content)
        if not data and content:
            repair_prompt = (
                "Convert the following text into the required JSON schema. "
                "Return ONLY a JSON object inside a JSON code block. Do NOT add any other text.\n\n"
                "JSON SCHEMA\n"
                "{\n"
                "  \"questions\": [\n"
                "    {\n"
                "      \"id\": \"Q1\",\n"
                "      \"question_text\": \"...\",\n"
                "      \"question_type\": \"mc|tf|matching|gap|short_answer|sentence_completion|summary|open_ended|phrase_extraction\",\n"
                "      \"options\": [\"...\"],\n"
                "      \"correct_answer\": \"...\",\n"
                "      \"marks\": 1,\n"
                "      \"expected_points\": [\"...\", \"...\"]\n"
                "    }\n"
                "  ]\n"
                "}\n\n"
                "ANSWER FORMAT RULES (MUST FOLLOW)\n"
                "- mc: options = 4 choices (no labels like \"A.\"), correct_answer = one letter \"A\"/\"B\"/\"C\"/\"D\" only.\n"
                "- tf: options = [\"T\",\"F\",\"NG\"], correct_answer = \"T\" or \"F\" or \"NG\" only.\n"
                "- gap / sentence_completion: correct_answer = exact word/phrase from passage.\n"
                "- matching: question_text includes LEFT list (1.,2.,3.); options = RIGHT list only; correct_answer = \"1->C, 2->A\".\n"
                "- short_answer / summary / open_ended / phrase_extraction: expected_points = list of key points; correct_answer may be empty.\n"
            )
            repair_input = content[:4000]
            repair_content = _call_chat(
                provider=provider,
                model=model,
                system_prompt=repair_prompt,
                user_prompt=repair_input,
                temperature=0.0,
                max_tokens=2000
            )
            data = _extract_json_block(repair_content)
        if not data:
            print("No JSON found in response")
            raise ValueError("AI response did not include valid JSON")
        
        # Convert to our unified Question format
        questions = []

        if isinstance(data.get("questions"), list):
            for item in data.get("questions", []):
                question_type = item.get("question_type") or item.get("type") or "short_answer"
                if question_type in {"table", "table_chart"}:
                    continue
                expected_points = item.get("expected_points")
                focus_points = item.get("focus_points")
                correct_answer = item.get("correct_answer") or item.get("answer") or item.get("correct")
                normalized_options = item.get("options")
                
                # Normalize correct_answer based on question type
                if question_type in {"mc", "mcq"}:
                    # For MCQ, ensure correct_answer is a single letter A/B/C/D
                    correct_answer = _normalize_mc_answer(correct_answer)
                elif question_type in {"tf", "tfng", "true_false"}:
                    # For TF, ensure correct_answer is T/F/NG
                    correct_answer = _normalize_tf_answer(correct_answer)
                elif expected_points is not None:
                    correct_answer = json.dumps(expected_points)
                elif focus_points is not None:
                    correct_answer = json.dumps(focus_points)

                if question_type == "matching":
                    correct_answer = _format_matching_answer(correct_answer)

                if isinstance(normalized_options, list):
                    normalized_options = [
                        _normalize_option_text(option)
                        for option in normalized_options
                        if option is not None
                    ]

                questions.append({
                    "question_text": item.get("question_text") or item.get("question") or "",
                    "question_type": question_type,
                    "options": normalized_options,
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
        print(f"Error calling {provider} ({model}): {e}")
        raise


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

    system_prompt = """You are an experienced HKDSE English Reading examiner grading student responses.

GRADING PRINCIPLES:
1. Focus on MEANING and CONTENT, not exact wording
2. Accept synonyms, paraphrases, and alternative expressions that convey the same meaning
3. Minor spelling errors should NOT affect the score if meaning is clear
4. Partial credit is allowed (e.g., 0.5 for partially correct answers)
5. Consider the context and what the student is trying to express

STRICTNESS LEVELS:
- lenient: Give credit for any reasonable attempt that shows understanding
- moderate: Accept answers that convey the key meaning, even if not perfectly worded
- strict: Require all key points to be addressed accurately

SCORING GUIDE:
- 1.0: Complete and accurate answer covering all expected points
- 0.7-0.9: Mostly correct with minor omissions or imprecisions
- 0.4-0.6: Partially correct, captures some key points
- 0.1-0.3: Shows some understanding but largely incomplete
- 0.0: Completely wrong or irrelevant

Return a JSON object: {"score": <0-1 float>, "rationale": "<brief explanation>"}
"""

    user_prompt = f"""
Question: {question_text}
Expected answer/key points: {expected_points_text}
Strictness level: {strictness}
Student's answer: {trimmed_answer}

Grade this response based on meaning and content, not exact wording.
"""

    provider, model = _resolve_ai_config(None)

    try:
        content = _call_chat(
            provider=provider,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=max_tokens
        )
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

