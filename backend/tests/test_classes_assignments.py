from app.auth import jwt
from app.models.user import User
from app.models.paper import Paper
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass
from app.models.assignment import Assignment


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def seed_teacher_student(db_session):
    teacher = User(username="teacher_cls", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_cls", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()
    return teacher, student


def test_classes_crud(client, db_session):
    teacher, student = seed_teacher_student(db_session)

    res_create = client.post("/classes", headers=auth_header(teacher), json={"name": "Class 1"})
    assert res_create.status_code == 200
    class_id = res_create.json()["id"]

    res_list_teacher = client.get("/classes", headers=auth_header(teacher))
    assert res_list_teacher.status_code == 200
    assert len(res_list_teacher.json()) == 1

    res_add_student = client.post(
        f"/classes/{class_id}/students",
        headers=auth_header(teacher),
        json={"username": student.username}
    )
    assert res_add_student.status_code == 200

    res_students = client.get(f"/classes/{class_id}/students", headers=auth_header(teacher))
    assert res_students.status_code == 200
    assert len(res_students.json()) == 1

    res_remove = client.delete(f"/classes/{class_id}/students/{student.id}", headers=auth_header(teacher))
    assert res_remove.status_code == 200

    res_delete = client.delete(f"/classes/{class_id}", headers=auth_header(teacher))
    assert res_delete.status_code == 200


def test_assignments_flow(client, db_session):
    teacher, student = seed_teacher_student(db_session)

    class_ = ClassModel(name="Class Assign", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    paper = Paper(title="Paper 1", article_content="Text", created_by=teacher.id, class_id=class_.id)
    db_session.add(paper)
    db_session.commit()

    res_fail = client.post("/assignments", headers=auth_header(teacher), json={"paper_id": paper.id})
    assert res_fail.status_code == 400

    res_create = client.post("/assignments", headers=auth_header(teacher), json={
        "paper_id": paper.id,
        "class_id": class_.id
    })
    assert res_create.status_code == 200

    res_list = client.get(f"/assignments/paper/{paper.id}", headers=auth_header(teacher))
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1
    assert res_list.json()[0]["type"] == "class"


def test_assignment_delete(client, db_session):
    teacher, student = seed_teacher_student(db_session)

    class_ = ClassModel(name="Class Delete", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    paper = Paper(title="Paper Delete", article_content="Text", created_by=teacher.id, class_id=class_.id)
    db_session.add(paper)
    db_session.commit()

    res_create = client.post("/assignments", headers=auth_header(teacher), json={
        "paper_id": paper.id,
        "class_id": class_.id
    })
    assert res_create.status_code == 200

    assignment = db_session.query(Assignment).filter(Assignment.paper_id == paper.id).first()
    assert assignment is not None

    res_delete = client.delete(f"/assignments/{assignment.id}", headers=auth_header(teacher))
    assert res_delete.status_code == 200
