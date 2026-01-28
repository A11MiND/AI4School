from app.services.ai_generator import _build_generation_options, _extract_json_block


def test_build_generation_options():
    opts = {
        "difficulty": "hard",
        "assessment_objectives": ["reading_inference"],
        "question_formats": ["mc", "gap"],
        "marking_strictness": "strict",
        "text_type": "article",
        "register": "formal",
        "cognitive_load": "multi-skill",
        "question_format_counts": {"mc": 2, "gap": 1}
    }
    text = _build_generation_options(opts)
    assert "Difficulty: hard" in text
    assert "Question formats: mc, gap" in text
    assert "Question counts: mc:2, gap:1" in text


def test_extract_json_block():
    content = """
    ```json
    {"ok": true, "count": 2}
    ```
    """
    data = _extract_json_block(content)
    assert data == {"ok": True, "count": 2}
