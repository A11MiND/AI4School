import io
import os
from app.auth import jwt
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_document_flow(client, db_session):
    teacher = User(username="teacher_doc", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res_folder = client.post("/documents/create_folder", headers=auth_header(teacher), json={"name": "Folder 1"})
    assert res_folder.status_code == 200

    files = {"file": ("sample.txt", b"Hello document", "text/plain")}
    res_upload = client.post("/documents/upload", headers=auth_header(teacher), files=files)
    assert res_upload.status_code == 200
    doc_id = res_upload.json()["id"]

    res_list = client.get("/documents", headers=auth_header(teacher))
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 1

    res_doc = client.get(f"/documents/{doc_id}", headers=auth_header(teacher))
    assert res_doc.status_code == 200

    res_download = client.get(f"/documents/{doc_id}/download", headers=auth_header(teacher))
    assert res_download.status_code == 200

    res_delete = client.delete(f"/documents/{doc_id}", headers=auth_header(teacher))
    assert res_delete.status_code == 200
