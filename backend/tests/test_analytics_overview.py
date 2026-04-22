from tests.test_analytics import seed_analytics_data, auth_header
from app.models.paper import Paper
from app.models.question import Question
from app.models.submission import Submission, Answer


def test_analytics_overview(client, db_session):
    teacher, _, class_ = seed_analytics_data(db_session)

    res = client.get(f"/analytics/overview?class_id={class_.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    data = res.json()
    assert data["total_submissions"] == 1
    assert data["active_students"] == 1
    assert data["average_score"] == 64.3


def test_analytics_weak_skills(client, db_session):
    teacher, _, class_ = seed_analytics_data(db_session)

    res = client.get(f"/analytics/weak-skills?class_id={class_.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    data = res.json()
    assert any(item["skill"] == "Inference" for item in data)


def test_analytics_student_performance(client, db_session):
    teacher, student, class_ = seed_analytics_data(db_session)

    res = client.get(f"/analytics/student-performance?class_id={class_.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    data = res.json()
    assert any(item["student"] == student.username for item in data)
    target = next(item for item in data if item["student"] == student.username)
    assert target["exams_taken"] == 1
    assert target["average_score"] == 64.3


def test_analytics_export_csv(client, db_session):
    teacher, _, class_ = seed_analytics_data(db_session)

    res = client.get(f"/analytics/export.csv?class_id={class_.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment;" in res.headers.get("content-disposition", "")
    body = res.text
    assert "AI4School Analytics Export" in body
    assert "Overview" in body
    assert "Weak Skills" in body


def test_analytics_export_pdf(client, db_session):
    teacher, _, class_ = seed_analytics_data(db_session)

    res = client.get(f"/analytics/export.pdf?class_id={class_.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "attachment;" in res.headers.get("content-disposition", "")
    assert res.content.startswith(b"%PDF-")


def test_analytics_subject_breakdown_objective(client, db_session):
    teacher, _, class_ = seed_analytics_data(db_session)

    res = client.get(f"/analytics/subject-breakdown?class_id={class_.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    payload = res.json()
    assert "objective" in payload
    assert payload["objective"]["overall_accuracy"] == 50.0
    assert isinstance(payload["objective"]["by_question_type"], list)


def test_analytics_subject_breakdown_productive_metrics(client, db_session):
    teacher, student, class_ = seed_analytics_data(db_session)

    writing_paper = Paper(
        title="Writing Task",
        article_content="Write about school life.",
        created_by=teacher.id,
        class_id=class_.id,
        paper_type="writing",
    )
    db_session.add(writing_paper)
    db_session.commit()
    db_session.refresh(writing_paper)

    question = Question(
        paper_id=writing_paper.id,
        question_text="Essay",
        question_type="open_ended",
        correct_answer="",
    )
    db_session.add(question)
    db_session.commit()
    db_session.refresh(question)

    submission = Submission(student_id=student.id, paper_id=writing_paper.id, score=78.0)
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)

    answer = Answer(
        submission_id=submission.id,
        question_id=question.id,
        answer="A sample essay response.",
        is_correct=None,
        score=0.0,
        rubric_scores={"content": 5.5, "language": 5.0, "organization": 5.2, "overall": 5.3},
        writing_metrics={"LD": 0.52, "TTR": 0.48, "MSTTR": 0.5},
    )
    db_session.add(answer)
    db_session.commit()

    res = client.get(f"/analytics/subject-breakdown?class_id={class_.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    payload = res.json()
    productive = payload["productive"]
    assert "overall_average_score" in productive
    assert isinstance(productive["by_paper_type"], list)
    assert productive["rubric"]["overall"] >= 0
    metric_map = {item["key"]: item["value"] for item in productive["metrics"]}
    assert "LD" in metric_map


def test_analytics_overview_filters_by_subject(client, db_session):
    teacher, student, class_ = seed_analytics_data(db_session)

    listening_paper = Paper(
        title="Listening Task",
        article_content="Audio script",
        created_by=teacher.id,
        class_id=class_.id,
        paper_type="listening",
    )
    db_session.add(listening_paper)
    db_session.commit()
    db_session.refresh(listening_paper)

    listening_question = Question(
        paper_id=listening_paper.id,
        question_text="Q",
        question_type="mcq",
        correct_answer="A",
    )
    db_session.add(listening_question)
    db_session.commit()
    db_session.refresh(listening_question)

    listening_submission = Submission(student_id=student.id, paper_id=listening_paper.id, score=92.0)
    db_session.add(listening_submission)
    db_session.commit()

    res = client.get(
        f"/analytics/overview?class_id={class_.id}&paper_type=listening",
        headers=auth_header(teacher),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_submissions"] == 1
    assert data["average_score"] == 92.0


def test_analytics_filter_options_returns_papers_and_students(client, db_session):
    teacher, student, class_ = seed_analytics_data(db_session)

    res = client.get(f"/analytics/filter-options?class_id={class_.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    payload = res.json()
    assert payload["subjects"] == ["reading", "listening", "writing", "speaking"]
    assert any(item["id"] == student.id for item in payload["students"])
    assert any(item["paper_type"] == "reading" for item in payload["papers"])
