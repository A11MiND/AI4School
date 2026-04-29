from app.auth import jwt
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_user_preference_upsert_and_get(client, db_session):
    teacher = User(username="teacher_pref", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    put_res = client.put(
        "/users/preferences/analytics_dashboard_view",
        headers=auth_header(teacher),
        json={
            "value": {
                "showOverview": False,
                "showWeakSkills": True,
                "studentsView": "cards",
            }
        },
    )
    assert put_res.status_code == 200
    assert put_res.json()["value"]["studentsView"] == "cards"

    get_res = client.get(
        "/users/preferences/analytics_dashboard_view",
        headers=auth_header(teacher),
    )
    assert get_res.status_code == 200
    body = get_res.json()
    assert body["key"] == "analytics_dashboard_view"
    assert body["value"]["showOverview"] is False
    assert body["value"]["studentsView"] == "cards"


def test_user_preference_returns_none_when_missing(client, db_session):
    teacher = User(username="teacher_pref_empty", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    get_res = client.get(
        "/users/preferences/not_set_yet",
        headers=auth_header(teacher),
    )
    assert get_res.status_code == 200
    assert get_res.json()["value"] is None


def test_runtime_ai_preference_redacts_secrets(client, db_session):
    teacher = User(username="teacher_runtime_secret", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    payload = {
        "value": {
            "ai_provider": "deepseek",
            "api_key": "secret-runtime-key",
            "deepseek_api_key": "secret-deepseek-key",
            "base_url": "https://api.deepseek.com",
        }
    }
    put_res = client.put(
        "/users/preferences/runtime_ai",
        headers=auth_header(teacher),
        json=payload,
    )
    assert put_res.status_code == 200
    assert "secret" not in str(put_res.json())
    assert put_res.json()["value"]["api_key"] == "***configured***"

    get_res = client.get("/users/preferences/runtime_ai", headers=auth_header(teacher))
    assert get_res.status_code == 200
    assert "secret" not in str(get_res.json())
    assert get_res.json()["value"]["deepseek_api_key"] == "***configured***"
