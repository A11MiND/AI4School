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


def test_student_join_class_with_invite_code_and_refresh(client, db_session):
    teacher = User(username="teacher_join", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_join", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    create_res = client.post("/classes", headers=auth_header(teacher), json={"name": "Invite Class"})
    assert create_res.status_code == 200
    class_json = create_res.json()
    assert class_json.get("invite_code")

    join_res = client.post("/classes/join", headers=auth_header(student), json={"invite_code": class_json["invite_code"]})
    assert join_res.status_code == 200
    assert join_res.json()["message"] in {"Joined class", "Already joined"}

    join_again_res = client.post("/classes/join", headers=auth_header(student), json={"invite_code": class_json["invite_code"]})
    assert join_again_res.status_code == 200
    assert join_again_res.json()["message"] == "Already joined"

    refresh_res = client.post(f"/classes/{class_json['id']}/invite-code/refresh", headers=auth_header(teacher))
    assert refresh_res.status_code == 200
    new_code = refresh_res.json()["invite_code"]
    assert new_code
    assert new_code != class_json["invite_code"]


def test_join_class_invalid_code(client, db_session):
    student = User(username="student_invalid_code", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add(student)
    db_session.commit()

    join_res = client.post("/classes/join", headers=auth_header(student), json={"invite_code": "NOTREAL"})
    assert join_res.status_code == 404


def test_invite_code_one_time_expiry_and_revoke_history(client, db_session):
    teacher = User(username="teacher_invite_policy", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student1 = User(username="student_invite_policy_1", password_hash=jwt.get_password_hash("pass"), role="student")
    student2 = User(username="student_invite_policy_2", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student1, student2])
    db_session.commit()

    class_res = client.post("/classes", headers=auth_header(teacher), json={"name": "Invite Policy Class"})
    assert class_res.status_code == 200
    class_id = class_res.json()["id"]

    one_time_res = client.post(
        f"/classes/{class_id}/invite-codes",
        headers=auth_header(teacher),
        json={"one_time": True, "expires_in_hours": 24},
    )
    assert one_time_res.status_code == 200
    one_time_code = one_time_res.json()["code"]

    join_ok = client.post("/classes/join", headers=auth_header(student1), json={"invite_code": one_time_code})
    assert join_ok.status_code == 200

    join_reused = client.post("/classes/join", headers=auth_header(student2), json={"invite_code": one_time_code})
    assert join_reused.status_code == 400
    assert "usage limit" in join_reused.json()["detail"].lower()

    expired_res = client.post(
        f"/classes/{class_id}/invite-codes",
        headers=auth_header(teacher),
        json={"expires_in_hours": -1},
    )
    assert expired_res.status_code == 200
    expired_code = expired_res.json()["code"]

    join_expired = client.post("/classes/join", headers=auth_header(student2), json={"invite_code": expired_code})
    assert join_expired.status_code == 400
    assert "expired" in join_expired.json()["detail"].lower()

    history_res = client.get(f"/classes/{class_id}/invite-codes", headers=auth_header(teacher))
    assert history_res.status_code == 200
    invite_history = history_res.json()
    assert len(invite_history) >= 3

    active_entry = next((row for row in invite_history if row["code"] == one_time_code), None)
    assert active_entry is not None
    revoke_res = client.post(f"/classes/invite-codes/{active_entry['id']}/revoke", headers=auth_header(teacher))
    assert revoke_res.status_code == 200

    history_after_revoke = client.get(f"/classes/{class_id}/invite-codes", headers=auth_header(teacher))
    assert history_after_revoke.status_code == 200
    revoked_entry = next((row for row in history_after_revoke.json() if row["id"] == active_entry["id"]), None)
    assert revoked_entry is not None
    assert revoked_entry["revoked"] is True
