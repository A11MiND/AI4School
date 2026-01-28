from tests.test_analytics import seed_analytics_data, auth_header


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
