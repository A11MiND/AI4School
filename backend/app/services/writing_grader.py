from __future__ import annotations

import json
from typing import Dict, List, Optional

from .ai_generator import _call_chat, _extract_json_block, _resolve_ai_config


def _default_feedback(text: str) -> List[Dict[str, str]]:
    lines = [s.strip() for s in text.split(".") if s.strip()]
    sample = lines[:3]
    out: List[Dict[str, str]] = []
    for sentence in sample:
        out.append(
            {
                "sentence": sentence,
                "issue": "Improve precision and cohesion.",
                "suggestion": "Use clearer topic focus and add a connector to link this idea with the previous sentence.",
            }
        )
    return out


def grade_writing_response(
    prompt_text: str,
    student_text: str,
    rubric_context: Optional[str] = None,
    strictness: str = "moderate",
    max_tokens: int = 900,
) -> Dict[str, object]:
    if not student_text or not student_text.strip():
        return {
            "content": 0.0,
            "language": 0.0,
            "organization": 0.0,
            "overall": 0.0,
            "summary_feedback": "No valid response submitted.",
            "sentence_feedback": [],
            "improvement": {
                "content": "Add relevant ideas and development.",
                "language": "Use clearer grammar and vocabulary.",
                "organization": "Structure your writing with coherent paragraphing.",
            },
        }

    provider, model = _resolve_ai_config(None)

    system_prompt = (
        "You are an HKDSE Paper 2 writing examiner. "
        "Assess writing using three dimensions: Content (C), Language (L), Organization (O), each from 0 to 7. "
        "Be fair and meaning-focused. Respect strictness setting (lenient/moderate/strict).\n\n"
        "Return ONLY a JSON object inside a JSON code block with this schema:\n"
        "{\n"
        "  \"content\": 0-7 number,\n"
        "  \"language\": 0-7 number,\n"
        "  \"organization\": 0-7 number,\n"
        "  \"overall\": 0-7 number,\n"
        "  \"summary_feedback\": \"1-3 sentences\",\n"
        "  \"improvement\": {\"content\":\"...\",\"language\":\"...\",\"organization\":\"...\"},\n"
        "  \"sentence_feedback\": [\n"
        "    {\"sentence\":\"...\",\"issue\":\"...\",\"suggestion\":\"...\"}\n"
        "  ]\n"
        "}\n"
    )

    user_prompt = (
        f"Strictness: {strictness}\n"
        f"Rubric context: {rubric_context or 'Use standard HKDSE Paper 2 descriptors for C/L/O.'}\n\n"
        f"Prompt:\n{prompt_text}\n\n"
        f"Student response:\n{student_text[:6000]}"
    )

    try:
        content = _call_chat(
            provider=provider,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=max_tokens,
        )
        data = _extract_json_block(content)
        if not data:
            return {
                "content": 0.0,
                "language": 0.0,
                "organization": 0.0,
                "overall": 0.0,
                "summary_feedback": "Automated grading could not parse output.",
                "sentence_feedback": _default_feedback(student_text),
                "improvement": {
                    "content": "Develop clearer ideas and support.",
                    "language": "Improve grammar control and lexical variety.",
                    "organization": "Use clearer logical flow and linking.",
                },
            }

        def _clip(x: object) -> float:
            try:
                v = float(x)
            except Exception:
                return 0.0
            if v < 0:
                return 0.0
            if v > 7:
                return 7.0
            return round(v, 2)

        content_score = _clip(data.get("content", 0.0))
        language_score = _clip(data.get("language", 0.0))
        organization_score = _clip(data.get("organization", 0.0))
        overall_score = _clip(data.get("overall", (content_score + language_score + organization_score) / 3))

        sentence_feedback = data.get("sentence_feedback")
        if not isinstance(sentence_feedback, list):
            sentence_feedback = _default_feedback(student_text)

        improvement = data.get("improvement")
        if not isinstance(improvement, dict):
            improvement = {
                "content": "Support your main points with clearer details.",
                "language": "Use more precise vocabulary and grammar control.",
                "organization": "Strengthen paragraphing and transitions.",
            }

        return {
            "content": content_score,
            "language": language_score,
            "organization": organization_score,
            "overall": overall_score,
            "summary_feedback": str(data.get("summary_feedback", "")),
            "sentence_feedback": sentence_feedback,
            "improvement": improvement,
        }
    except Exception:
        return {
            "content": 0.0,
            "language": 0.0,
            "organization": 0.0,
            "overall": 0.0,
            "summary_feedback": "Automated grading failed. Please review manually.",
            "sentence_feedback": _default_feedback(student_text),
            "improvement": {
                "content": "Add task-relevant ideas and examples.",
                "language": "Revise grammar and lexical choice.",
                "organization": "Improve coherence and paragraph structure.",
            },
        }
