from app.auth import jwt
from app.models.user import User
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_add_student_errors(client, db_session):
    teacher = User(username="teacher_err", password_hash=jwt.get_password_hash("pass"), role="teacher")
    non_student = User(username="teacher2", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add_all([teacher, non_student])
    db_session.commit()

    res_missing_class = client.post(
        "/classes/999/students",
        headers=auth_header(teacher),
        json={"username": "any"}
    )
    assert res_missing_class.status_code == 404

    class_ = ClassModel(name="Err Class", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    res_missing = client.post(
        f"/classes/{class_.id}/students",
        headers=auth_header(teacher),
        json={"username": "unknown"}
    )
    assert res_missing.status_code == 404

    res_not_student = client.post(
        f"/classes/{class_.id}/students",
        headers=auth_header(teacher),
        json={"username": non_student.username}
    )
    assert res_not_student.status_code == 400


def test_get_class_students_not_found(client, db_session):
    teacher = User(username="teacher_missing_class", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.get("/classes/999/students", headers=auth_header(teacher))
    assert res.status_code == 404


def test_add_student_already_in_class(client, db_session):
    teacher = User(username="teacher_dup", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_dup", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    class_ = ClassModel(name="Dup Class", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    assoc = StudentClass(user_id=student.id, class_id=class_.id)
    db_session.add(assoc)
    db_session.commit()

    res = client.post(
        f"/classes/{class_.id}/students",
        headers=auth_header(teacher),
        json={"username": student.username}
    )
    assert res.status_code == 200
    assert res.json()["message"] == "Student already in class"


def test_delete_class_not_found(client, db_session):
    teacher = User(username="teacher_delete", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.delete("/classes/9999", headers=auth_header(teacher))
    assert res.status_code == 404


def test_delete_class_commit_failure(client, db_session, monkeypatch):
    teacher = User(username="teacher_commit", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    class_ = ClassModel(name="Fail Class", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    def fail_commit():
        raise Exception("fail")

    from sqlalchemy.orm import Session

    monkeypatch.setattr(Session, "commit", fail_commit)

    res = client.delete(f"/classes/{class_.id}", headers=auth_header(teacher))
    assert res.status_code == 400


def test_delete_class_forbidden(client, db_session):
    student = User(username="student_forbidden", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add(student)
    db_session.commit()

    res = client.delete("/classes/1", headers=auth_header(student))
    assert res.status_code == 403


def test_remove_student_class_not_found(client, db_session):
    teacher = User(username="teacher_remove_missing", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.delete("/classes/999/students/1", headers=auth_header(teacher))
    assert res.status_code == 404


def test_remove_student_not_owner(client, db_session):
    teacher = User(username="teacher_owner", password_hash=jwt.get_password_hash("pass"), role="teacher")
    teacher2 = User(username="teacher_non_owner", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add_all([teacher, teacher2])
    db_session.commit()

    class_ = ClassModel(name="Owned2", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    res = client.delete(f"/classes/{class_.id}/students/1", headers=auth_header(teacher2))
    assert res.status_code == 403


def test_add_and_remove_student_success(client, db_session):
    teacher = User(username="teacher_ok", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_ok", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    class_ = ClassModel(name="Class OK", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    res_add = client.post(
        f"/classes/{class_.id}/students",
        headers=auth_header(teacher),
        json={"username": student.username}
    )
    assert res_add.status_code == 200
    assert res_add.json()["message"] == "Student added"

    res_remove = client.delete(
        f"/classes/{class_.id}/students/{student.id}",
        headers=auth_header(teacher)
    )
    assert res_remove.status_code == 200
    assert res_remove.json()["message"] == "Student removed from class"
