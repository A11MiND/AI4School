import asyncio
import importlib
import pytest
from fastapi import HTTPException
from app.auth import jwt as jwt_module
from app.database import get_db
from app.models.user import User
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass
from app.models.paper import Paper
from app.models.question import Question
from app.models.assignment import Assignment
from app.models.submission import Submission, Answer


def auth_header(user):
    token = jwt_module.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_get_current_user_success(db_session):
    user = User(username="jwt_ok", password_hash=jwt_module.get_password_hash("pass"), role="teacher")
    db_session.add(user)
    db_session.commit()

    token = jwt_module.create_access_token({"sub": user.username})
    current = await jwt_module.get_current_user(token=token, db=db_session)
    assert current.username == user.username

    active = await jwt_module.get_current_active_user(current)
    assert active.username == user.username


def test_get_db_generator():
    gen = get_db()
    db = next(gen)
    assert db is not None
    gen.close()


def test_main_uploads_creation(monkeypatch):
    import app.main as main_module

    def fake_exists(path):
        return False

    called = {"made": False}

    def fake_makedirs(path):
        called["made"] = True

    monkeypatch.setattr(main_module.os.path, "exists", fake_exists)
    monkeypatch.setattr(main_module.os, "makedirs", fake_makedirs)

    importlib.reload(main_module)
    assert called["made"] is True


def test_analytics_no_submissions(client, db_session):
    student = User(username="student_none", password_hash=jwt_module.get_password_hash("pass"), role="student")
    db_session.add(student)
    db_session.commit()

    res = client.get("/analytics/student-report", headers=auth_header(student))
    assert res.status_code == 200
    assert res.json()["overview"]["total_submissions"] == 0


def test_assignments_auth_and_not_found(client, db_session):
    teacher = User(username="teacher_assign", password_hash=jwt_module.get_password_hash("pass"), role="teacher")
    student = User(username="student_assign", password_hash=jwt_module.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    res_forbidden = client.post("/assignments", headers=auth_header(student), json={"paper_id": 1, "class_id": 1})
    assert res_forbidden.status_code == 403

    res_list_forbidden = client.get("/assignments/paper/1", headers=auth_header(student))
    assert res_list_forbidden.status_code == 403

    res_delete_missing = client.delete("/assignments/999", headers=auth_header(teacher))
    assert res_delete_missing.status_code == 404


def test_classes_more_branches(client, db_session):
    teacher = User(username="teacher_cls_more", password_hash=jwt_module.get_password_hash("pass"), role="teacher")
    teacher2 = User(username="teacher_other", password_hash=jwt_module.get_password_hash("pass"), role="teacher")
    student = User(username="student_cls_more", password_hash=jwt_module.get_password_hash("pass"), role="student")
    admin = User(username="admin_user", password_hash=jwt_module.get_password_hash("pass"), role="admin")
    db_session.add_all([teacher, teacher2, student, admin])
    db_session.commit()

    res_forbidden = client.post("/classes", headers=auth_header(student), json={"name": "No"})
    assert res_forbidden.status_code == 403

    class_ = ClassModel(name="Owned", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    assoc = StudentClass(user_id=student.id, class_id=class_.id)
    db_session.add(assoc)
    db_session.commit()

    res_student_list = client.get("/classes", headers=auth_header(student))
    assert res_student_list.status_code == 200

    res_admin_list = client.get("/classes", headers=auth_header(admin))
    assert res_admin_list.status_code == 200

    res_add_not_owner = client.post(
        f"/classes/{class_.id}/students",
        headers=auth_header(teacher2),
        json={"username": student.username}
    )
    assert res_add_not_owner.status_code == 403

    res_remove_missing = client.delete(
        f"/classes/{class_.id}/students/999",
        headers=auth_header(teacher)
    )
    assert res_remove_missing.status_code == 404

    res_delete_not_owner = client.delete(f"/classes/{class_.id}", headers=auth_header(teacher2))
    assert res_delete_not_owner.status_code == 403


def test_documents_permission_branches(client, db_session, tmp_path):
    teacher = User(username="teacher_docs_more", password_hash=jwt_module.get_password_hash("pass"), role="teacher")
    student = User(username="student_docs_more", password_hash=jwt_module.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    files = {"file": ("sample.pdf", b"not a pdf", "application/pdf")}
    res_upload = client.post("/documents/upload", headers=auth_header(teacher), files=files)
    assert res_upload.status_code == 200
    doc_id = res_upload.json()["id"]

    res_list_student = client.get("/documents", headers=auth_header(student))
    assert res_list_student.status_code == 200

    res_download_forbidden = client.get(f"/documents/{doc_id}/download", headers=auth_header(student))
    assert res_download_forbidden.status_code == 403

    res_not_found = client.get("/documents/9999", headers=auth_header(teacher))
    assert res_not_found.status_code == 404

    res_delete_forbidden = client.delete(f"/documents/{doc_id}", headers=auth_header(student))
    assert res_delete_forbidden.status_code == 403


def test_papers_error_branches(client, db_session, monkeypatch):
    teacher = User(username="teacher_paper_more", password_hash=jwt_module.get_password_hash("pass"), role="teacher")
    student = User(username="student_paper_more", password_hash=jwt_module.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    res_gen_forbidden = client.post("/papers/generate", headers=auth_header(student), json={"article_content": "Text"})
    assert res_gen_forbidden.status_code == 403

    res_create_forbidden = client.post("/papers", headers=auth_header(student), json={"title": "X", "article_content": "Text", "questions": []})
    assert res_create_forbidden.status_code == 403

    res_get_missing = client.get("/papers/999", headers=auth_header(teacher))
    assert res_get_missing.status_code == 404

    res_delete_missing = client.delete("/papers/999", headers=auth_header(teacher))
    assert res_delete_missing.status_code == 404

    paper = Paper(title="Owned", article_content="Text", created_by=teacher.id)
    db_session.add(paper)
    db_session.commit()

    res_delete_not_owner = client.delete(f"/papers/{paper.id}", headers=auth_header(student))
    assert res_delete_not_owner.status_code == 403

    question = Question(paper_id=paper.id, question_text="Q", question_type="mcq")
    db_session.add(question)
    db_session.commit()

    res_update_forbidden = client.put(f"/papers/questions/{question.id}", headers=auth_header(student), json={"question_text": "X"})
    assert res_update_forbidden.status_code == 403

    res_update_missing = client.put(f"/papers/questions/999", headers=auth_header(teacher), json={"question_text": "X"})
    assert res_update_missing.status_code == 404

    res_list_student_none = client.get("/papers", headers=auth_header(student))
    assert res_list_student_none.status_code == 200
    assert res_list_student_none.json() == []

    res_submissions_forbidden = client.get(f"/papers/students/{student.id}/submissions", headers=auth_header(student))
    assert res_submissions_forbidden.status_code == 403

    res_submission_missing = client.get("/papers/submissions/999", headers=auth_header(teacher))
    assert res_submission_missing.status_code == 404


def test_user_update_fullname_password(client, db_session):
    user = User(username="user_full", password_hash=jwt_module.get_password_hash("pass"), role="teacher")
    db_session.add(user)
    db_session.commit()

    res = client.put(
        "/users/me",
        headers=auth_header(user),
        json={"full_name": "Full Name", "password": "newpass"}
    )
    assert res.status_code == 200
    assert res.json()["full_name"] == "Full Name"
