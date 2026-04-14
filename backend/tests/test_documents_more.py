from app.auth import jwt
from app.models.user import User
from app.models.document import Document
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass
from app.models.document_visibility import DocumentClassVisibility


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


def test_student_download_visible_document_allowed(client, db_session, tmp_path):
    teacher = User(username="teacher_docs_dl", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_docs_dl", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    class_row = ClassModel(name="Class A", teacher_id=teacher.id)
    db_session.add(class_row)
    db_session.commit()

    db_session.add(StudentClass(user_id=student.id, class_id=class_row.id))
    db_session.commit()

    file_path = tmp_path / "doc.txt"
    file_path.write_text("hello", encoding="utf-8")

    doc = Document(title="Doc", is_folder=False, uploaded_by=teacher.id, file_path=str(file_path))
    db_session.add(doc)
    db_session.commit()

    db_session.add(DocumentClassVisibility(document_id=doc.id, class_id=class_row.id, visible=True))
    db_session.commit()

    res = client.get(f"/documents/{doc.id}/download", headers=auth_header(student))
    assert res.status_code == 200


def test_student_download_without_visibility_forbidden(client, db_session, tmp_path):
    teacher = User(username="teacher_docs_forbid", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_docs_forbid", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    class_row = ClassModel(name="Class B", teacher_id=teacher.id)
    db_session.add(class_row)
    db_session.commit()

    db_session.add(StudentClass(user_id=student.id, class_id=class_row.id))
    db_session.commit()

    file_path = tmp_path / "doc2.txt"
    file_path.write_text("secret", encoding="utf-8")

    doc = Document(title="Doc2", is_folder=False, uploaded_by=teacher.id, file_path=str(file_path))
    db_session.add(doc)
    db_session.commit()

    res = client.get(f"/documents/{doc.id}/download", headers=auth_header(student))
    assert res.status_code == 403


def test_rename_move_and_list_folders(client, db_session):
    teacher = User(username="teacher_docs_manage", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    folder_a = Document(title="Folder A", is_folder=True, uploaded_by=teacher.id)
    folder_b = Document(title="Folder B", is_folder=True, uploaded_by=teacher.id)
    doc = Document(title="Doc Before", is_folder=False, uploaded_by=teacher.id, parent_id=folder_a.id)
    db_session.add_all([folder_a, folder_b])
    db_session.commit()
    doc.parent_id = folder_a.id
    db_session.add(doc)
    db_session.commit()

    res_rename = client.patch(
        f"/documents/{doc.id}",
        headers=auth_header(teacher),
        json={"title": "Doc After"},
    )
    assert res_rename.status_code == 200
    assert res_rename.json()["title"] == "Doc After"

    res_move = client.post(
        f"/documents/{doc.id}/move",
        headers=auth_header(teacher),
        json={"parent_id": folder_b.id},
    )
    assert res_move.status_code == 200
    assert res_move.json()["parent_id"] == folder_b.id

    res_folders = client.get("/documents/folders", headers=auth_header(teacher))
    assert res_folders.status_code == 200
    folder_titles = {row["title"] for row in res_folders.json()}
    assert "Folder A" in folder_titles
    assert "Folder B" in folder_titles


def test_move_folder_into_descendant_blocked(client, db_session):
    teacher = User(username="teacher_docs_cycle", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    root = Document(title="Root", is_folder=True, uploaded_by=teacher.id)
    db_session.add(root)
    db_session.commit()

    child = Document(title="Child", is_folder=True, uploaded_by=teacher.id, parent_id=root.id)
    db_session.add(child)
    db_session.commit()

    res = client.post(
        f"/documents/{root.id}/move",
        headers=auth_header(teacher),
        json={"parent_id": child.id},
    )
    assert res.status_code == 400


def test_upload_with_display_name(client, db_session):
    teacher = User(username="teacher_docs_display", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    files = {"file": ("origin.txt", b"hello", "text/plain")}
    data = {"display_name": "Renamed Upload"}
    res_upload = client.post("/documents/upload", headers=auth_header(teacher), files=files, data=data)
    assert res_upload.status_code == 200

    doc_id = res_upload.json()["id"]
    doc = db_session.query(Document).filter(Document.id == doc_id).first()
    assert doc is not None
    assert doc.title == "Renamed Upload"
