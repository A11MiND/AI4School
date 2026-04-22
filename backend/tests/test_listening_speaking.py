from app.auth import jwt
from app.models.assignment import Assignment
from app.models.speaking_session import SpeakingSession
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_create_listening_paper_success(client, db_session):
    teacher = User(username="teacher_listening", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.post(
        "/papers/listening",
        headers=auth_header(teacher),
        json={
            "title": "Listening Unit 1",
            "transcript": "Speaker A: Hello. Speaker B: Hi.",
            "audio_url": "https://cdn.example.com/audio1.mp3",
            "role_script": [
                {"role": "A", "text": "Hello"},
                {"role": "B", "text": "Hi"}
            ],
            "questions": [
                {
                    "question_text": "What did A say?",
                    "question_type": "mcq",
                    "options": ["Hello", "Goodbye"],
                    "correct_answer": "A"
                }
            ]
        },
    )
    assert res.status_code == 200
    assert res.json()["message"] == "Listening paper created"

    list_res = client.get("/papers", headers=auth_header(teacher))
    assert list_res.status_code == 200
    assert any(p.get("paper_type") == "listening" for p in list_res.json())


def test_create_listening_paper_forbidden_for_student(client, db_session):
    student = User(username="student_listening", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add(student)
    db_session.commit()

    res = client.post(
        "/papers/listening",
        headers=auth_header(student),
        json={"title": "Nope", "questions": []},
    )
    assert res.status_code == 403


def test_speaking_session_compaction_flow(client, db_session):
    teacher = User(username="teacher_speaking", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_speaking", password_hash=jwt.get_password_hash("pass"), role="student")
    other_student = User(username="student_other_speaking", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student, other_student])
    db_session.commit()

    create_paper = client.post(
        "/papers/speaking",
        headers=auth_header(teacher),
        json={
            "title": "Oral Task 1",
            "scenario": "You are discussing travel plans.",
            "starter_prompt": "Please tell me about your favorite city.",
            "max_turns": 10,
        },
    )
    assert create_paper.status_code == 200
    paper_id = create_paper.json()["paper_id"]

    start_res = client.post(
        f"/papers/speaking/{paper_id}/sessions",
        headers=auth_header(student),
        json={"max_context_tokens": 40},
    )
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]

    for i in range(6):
        turn_res = client.post(
            f"/papers/speaking/sessions/{session_id}/turns",
            headers=auth_header(student),
            json={
                "role": "student",
                "text": f"This is a long response number {i} with enough words to trigger compression logic quickly.",
            },
        )
        assert turn_res.status_code == 200

    get_res = client.get(f"/papers/speaking/sessions/{session_id}", headers=auth_header(student))
    assert get_res.status_code == 200
    payload = get_res.json()
    assert payload["compaction_count"] >= 1
    assert payload["summary_text"] is not None

    forbidden = client.get(f"/papers/speaking/sessions/{session_id}", headers=auth_header(other_student))
    assert forbidden.status_code == 403


def test_update_listening_and_speaking_papers(client, db_session):
    teacher = User(username="teacher_edit_ls", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    listening_create = client.post(
        "/papers/listening",
        headers=auth_header(teacher),
        json={
            "title": "L1",
            "transcript": "T1",
            "questions": [{"question_text": "Q1", "question_type": "mcq", "options": ["A", "B"], "correct_answer": "A"}],
        },
    )
    assert listening_create.status_code == 200
    listening_id = listening_create.json()["paper_id"]

    listening_update = client.put(
        f"/papers/listening/{listening_id}",
        headers=auth_header(teacher),
        json={
            "title": "L1 Updated",
            "transcript": "T1 Updated",
            "audio_url": "https://cdn.example.com/new.mp3",
            "role_script": [{"role": "A", "text": "Hello"}],
            "questions": [{"question_text": "Q2", "question_type": "short", "correct_answer": "hello"}],
        },
    )
    assert listening_update.status_code == 200

    speaking_create = client.post(
        "/papers/speaking",
        headers=auth_header(teacher),
        json={
            "title": "S1",
            "scenario": "Initial scenario",
        },
    )
    assert speaking_create.status_code == 200
    speaking_id = speaking_create.json()["paper_id"]

    speaking_update = client.put(
        f"/papers/speaking/{speaking_id}",
        headers=auth_header(teacher),
        json={
            "title": "S1 Updated",
            "scenario": "Updated scenario",
            "examiner_persona": "Strict examiner",
            "starter_prompt": "Start now",
            "max_turns": 8,
        },
    )
    assert speaking_update.status_code == 200


def test_generate_listening_script_success(client, db_session, monkeypatch):
    teacher = User(username="teacher_listen_gen", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    def fake_call_chat(provider, model, system_prompt, user_prompt, temperature, max_tokens, api_key=None, base_url=None):
        return (
            '{"transcript":"A: We discuss weekend plans. B: Great idea.",' 
            '"role_script":[{"role":"A","text":"We discuss weekend plans."},{"role":"B","text":"Great idea."}],'
            '"questions":[{"question_text":"What is the topic?","question_type":"mcq","options":["Sports","Weekend plans","Food","Travel"],"correct_answer":"B"}]}'
        )

    monkeypatch.setattr("app.routers.papers._call_chat", fake_call_chat)

    res = client.post(
        "/papers/listening/generate-script",
        headers=auth_header(teacher),
        json={"prompt": "Two students planning activities", "question_count": 3},
    )
    assert res.status_code == 200
    payload = res.json()
    assert "transcript" in payload and payload["transcript"]
    assert isinstance(payload.get("role_script"), list)
    assert isinstance(payload.get("questions"), list)


def test_delete_speaking_paper_with_sessions_and_assignment(client, db_session):
    teacher = User(username="teacher_delete_speaking", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_delete_speaking", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    create_paper = client.post(
        "/papers/speaking",
        headers=auth_header(teacher),
        json={
            "title": "Speaking Delete Case",
            "scenario": "Discuss city life.",
            "starter_prompt": "Tell me about your city.",
            "max_turns": 6,
        },
    )
    assert create_paper.status_code == 200
    paper_id = create_paper.json()["paper_id"]

    assignment = Assignment(paper_id=paper_id, student_id=student.id, max_attempts=1)
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    start_res = client.post(
        f"/papers/speaking/{paper_id}/sessions",
        headers=auth_header(student),
        json={"assignment_id": assignment.id, "max_context_tokens": 100},
    )
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]

    turn_res = client.post(
        f"/papers/speaking/sessions/{session_id}/turns",
        headers=auth_header(student),
        json={"role": "student", "text": "Sample response."},
    )
    assert turn_res.status_code == 200

    delete_res = client.delete(f"/papers/{paper_id}", headers=auth_header(teacher))
    assert delete_res.status_code == 200
    assert delete_res.json()["message"] == "Paper deleted"

    remaining_sessions = db_session.query(SpeakingSession).filter(SpeakingSession.paper_id == paper_id).all()
    assert remaining_sessions == []


def test_generate_writing_prompt_image_success(client, db_session, monkeypatch):
    teacher = User(username="teacher_image_prompt", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"data": [{"url": "https://cdn.example.com/generated/prompt.png"}]}

    def fake_post(url, headers, json, timeout):
        assert url.endswith("/images/generations")
        assert headers["Authorization"].startswith("Bearer ")
        assert json["model"] == "qwen-image"
        assert json["prompt"] == "students discussing volunteer work at beach"
        return FakeResponse()

    monkeypatch.setattr("app.routers.papers.requests.post", fake_post)

    res = client.post(
        "/papers/writing/generate-image",
        headers=auth_header(teacher),
        json={
            "prompt": "students discussing volunteer work at beach",
            "api_key": "test-qwen-key",
            "base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            "model": "qwen-image",
        },
    )
    assert res.status_code == 200
    assert res.json()["prompt_asset_url"] == "https://cdn.example.com/generated/prompt.png"


def test_complete_speaking_session_blocks_new_turn(client, db_session):
    teacher = User(username="teacher_complete_speaking", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_complete_speaking", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    create_paper = client.post(
        "/papers/speaking",
        headers=auth_header(teacher),
        json={
            "title": "Speaking Complete Case",
            "scenario": "Discuss school life.",
            "starter_prompt": "Please begin.",
            "max_turns": 6,
        },
    )
    assert create_paper.status_code == 200
    paper_id = create_paper.json()["paper_id"]

    start_res = client.post(
        f"/papers/speaking/{paper_id}/sessions",
        headers=auth_header(student),
        json={"max_context_tokens": 200},
    )
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]

    complete_res = client.post(
        f"/papers/speaking/sessions/{session_id}/complete",
        headers=auth_header(student),
    )
    assert complete_res.status_code == 200
    assert complete_res.json()["status"] == "completed"

    turn_res = client.post(
        f"/papers/speaking/sessions/{session_id}/turns",
        headers=auth_header(student),
        json={"role": "student", "text": "Can you hear me?"},
    )
    assert turn_res.status_code == 400
