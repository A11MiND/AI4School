from app.auth import jwt
from app.models.user import User
from app.models.document import Document


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_list_documents_filters_and_download_missing(client, db_session):
    teacher = User(username="teacher_doc_more", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    folder = Document(title="Folder", is_folder=True, uploaded_by=teacher.id)
    db_session.add(folder)
    db_session.commit()

    child = Document(title="Child", is_folder=False, uploaded_by=teacher.id, parent_id=folder.id, file_path="missing.file")
    db_session.add(child)
    db_session.commit()

    res_root = client.get("/documents", headers=auth_header(teacher))
    assert res_root.status_code == 200

    res_child = client.get(f"/documents?parent_id={folder.id}", headers=auth_header(teacher))
    assert res_child.status_code == 200
    assert len(res_child.json()) == 1

    res_download_missing = client.get(f"/documents/{child.id}/download", headers=auth_header(teacher))
    assert res_download_missing.status_code == 404


def test_list_documents_forbidden(client, db_session):
    guest = User(username="guest_user", password_hash=jwt.get_password_hash("pass"), role="guest")
    db_session.add(guest)
    db_session.commit()

    res = client.get("/documents", headers=auth_header(guest))
    assert res.status_code == 403


def test_download_document_missing(client, db_session):
    teacher = User(username="teacher_dl_missing", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.get("/documents/9999/download", headers=auth_header(teacher))
    assert res.status_code == 404


def test_documents_auth_and_filters(client, db_session):
    teacher = User(username="teacher_docs_auth", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_docs_auth", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    res_folder_forbidden = client.post("/documents/create_folder", headers=auth_header(student), json={"name": "No"})
    assert res_folder_forbidden.status_code == 403

    files = {"file": ("sample.txt", b"", "text/plain")}
    res_upload_forbidden = client.post("/documents/upload", headers=auth_header(student), files=files)
    assert res_upload_forbidden.status_code == 403

    doc = Document(title="Doc", is_folder=False, uploaded_by=teacher.id)
    db_session.add(doc)
    db_session.commit()

    res_list_uploaded = client.get(f"/documents?uploaded_by={teacher.id}", headers=auth_header(student))
    assert res_list_uploaded.status_code == 200

    res_get_missing = client.get("/documents/9999", headers=auth_header(teacher))
    assert res_get_missing.status_code == 404

    res_delete_missing = client.delete("/documents/9999", headers=auth_header(teacher))
    assert res_delete_missing.status_code == 404


def test_upload_blank_content_none(client, db_session, monkeypatch):
    teacher = User(username="teacher_blank", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    import os
    from app.routers import documents as documents_router

    def fake_exists(path):
        return False

    def fake_makedirs(path, **kwargs):
        pass

    monkeypatch.setattr(documents_router.os.path, "exists", fake_exists)
    monkeypatch.setattr(documents_router.os, "makedirs", fake_makedirs)

    files = {"file": ("blank.txt", b"", "text/plain")}
    res_upload = client.post("/documents/upload", headers=auth_header(teacher), files=files)
    assert res_upload.status_code == 200
    doc_id = res_upload.json()["id"]

    res_doc = client.get(f"/documents/{doc_id}", headers=auth_header(teacher))
    assert res_doc.status_code == 200
    assert res_doc.json()["content"] is None
