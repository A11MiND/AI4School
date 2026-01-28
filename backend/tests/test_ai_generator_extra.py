import json
from app.services import ai_generator


class FakeResponse:
    def __init__(self, content):
        self.choices = [type("Choice", (), {"message": type("Msg", (), {"content": content})()})()]


def test_generate_questions_json_block(monkeypatch):
    content = """
```json
{"questions": [{"question_text": "Q1", "question_type": "mcq", "options": ["A"], "correct_answer": "A"}]}
```
"""

    def fake_create(*args, **kwargs):
        return FakeResponse(content)

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    questions = ai_generator.generate_dse_questions("Article", {"question_formats": ["mcq"]})
    assert questions[0]["question_text"] == "Q1"


def test_generate_questions_plain_code_block(monkeypatch):
    content = """
```
{"questions": [{"question_text": "Q2", "question_type": "short_answer", "expected_points": ["p1"]}]}
```
"""

    def fake_create(*args, **kwargs):
        return FakeResponse(content)

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    questions = ai_generator.generate_dse_questions("Article")
    assert questions[0]["correct_answer"] == "[\"p1\"]"


def test_generate_questions_focus_points(monkeypatch):
    content = """
```json
{"questions": [{"question_text": "QF", "question_type": "short_answer", "focus_points": ["f1"]}]}
```
"""

    def fake_create(*args, **kwargs):
        return FakeResponse(content)

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    questions = ai_generator.generate_dse_questions("Article")
    assert questions[0]["correct_answer"] == "[\"f1\"]"


def test_generate_questions_legacy_sections(monkeypatch):
    content = json.dumps({
        "sectionA": [{"question": "Q1", "options": ["A"], "answer": "A"}],
        "sectionB": [{"question": "Q2", "marks": 2, "expected_points": ["x"]}],
        "sectionC": {"question": "Q3", "word_limit": 120, "focus_points": ["y"]}
    })

    def fake_create(*args, **kwargs):
        return FakeResponse(content)

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    questions = ai_generator.generate_dse_questions("Article")
    assert any("[Section A]" in q["question_text"] for q in questions)
    assert any("[Section B]" in q["question_text"] for q in questions)
    assert any("[Section C]" in q["question_text"] for q in questions)


def test_generate_questions_no_json(monkeypatch):
    def fake_create(*args, **kwargs):
        return FakeResponse("no json here")

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    questions = ai_generator.generate_dse_questions("Article")
    assert questions == []


def test_generate_questions_brace_fallback(monkeypatch):
    content = "prefix {\"questions\": [{\"question\": \"Q3\"}]} suffix"

    def fake_create(*args, **kwargs):
        return FakeResponse(content)

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    questions = ai_generator.generate_dse_questions("Article")
    assert questions[0]["question_text"] == "Q3"


def test_generate_questions_exception(monkeypatch):
    def fake_create(*args, **kwargs):
        raise Exception("fail")

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    questions = ai_generator.generate_dse_questions("Article")
    assert len(questions) == 3


def test_grade_open_answer_paths(monkeypatch):
    def fake_create(*args, **kwargs):
        return FakeResponse("""```json\n{"score": 1.2}\n```""")

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    score = ai_generator.grade_open_answer("Q", ["a"], "answer", strictness="strict")
    assert score == 1.0


def test_grade_open_answer_negative(monkeypatch):
    def fake_create(*args, **kwargs):
        return FakeResponse("""```json\n{"score": -1}\n```""")

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    score = ai_generator.grade_open_answer("Q", ["a"], "answer")
    assert score == 0.0


def test_grade_open_answer_invalid_json(monkeypatch):
    def fake_create(*args, **kwargs):
        return FakeResponse("no json")

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    score = ai_generator.grade_open_answer("Q", "[]", "answer")
    assert score == 0.0


def test_grade_open_answer_empty():
    score = ai_generator.grade_open_answer("Q", "[]", "")
    assert score == 0.0


def test_extract_json_block_empty():
    assert ai_generator._extract_json_block("") is None
    assert ai_generator._extract_json_block("{bad json") is None
    assert ai_generator._extract_json_block("```{bad}```") is None


def test_grade_open_answer_expected_points_string(monkeypatch):
    def fake_create(*args, **kwargs):
        return FakeResponse("""```json\n{"score": 0.6}\n```""")

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    score = ai_generator.grade_open_answer("Q", "not-json", "answer")
    assert score == 0.6


def test_grade_open_answer_exception(monkeypatch):
    def fake_create(*args, **kwargs):
        raise Exception("boom")

    monkeypatch.setattr(ai_generator.client.chat.completions, "create", fake_create)

    score = ai_generator.grade_open_answer("Q", ["x"], "answer")
    assert score == 0.0
