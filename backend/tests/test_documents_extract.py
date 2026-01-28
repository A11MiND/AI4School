import io
import pypdf
import pdfplumber
import docx
from app.routers.documents import extract_text_from_file


def test_extract_text_from_txt():
    content = b"Hello world"
    text = extract_text_from_file(content, "sample.txt")
    assert text == "Hello world"


def test_extract_text_from_unknown():
    content = b"binary"
    text = extract_text_from_file(content, "file.bin")
    assert text == ""


def test_extract_text_from_pdf_and_docx():
    pdf_writer = pypdf.PdfWriter()
    pdf_writer.add_blank_page(width=72, height=72)
    pdf_bytes = io.BytesIO()
    pdf_writer.write(pdf_bytes)

    pdf_text = extract_text_from_file(pdf_bytes.getvalue(), "sample.pdf")
    assert isinstance(pdf_text, str)

    doc = docx.Document()
    doc.add_paragraph("Docx text")
    doc_bytes = io.BytesIO()
    doc.save(doc_bytes)

    doc_text = extract_text_from_file(doc_bytes.getvalue(), "sample.docx")
    assert "Docx text" in doc_text


def test_extract_text_pdf_errors(monkeypatch):
    def fake_reader(*args, **kwargs):
        raise Exception("bad pdf")

    def fake_plumber(*args, **kwargs):
        raise Exception("bad plumber")

    monkeypatch.setattr(pypdf, "PdfReader", fake_reader)
    monkeypatch.setattr(pdfplumber, "open", fake_plumber)

    text = extract_text_from_file(b"broken", "bad.pdf")
    assert text == ""


def test_extract_text_pdfplumber_override(monkeypatch):
    class FakePage:
        def extract_text(self):
            return "plumber"

    class FakePdf:
        pages = [FakePage()]
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeReader:
        pages = []

    monkeypatch.setattr(pypdf, "PdfReader", lambda *args, **kwargs: FakeReader())
    monkeypatch.setattr(pdfplumber, "open", lambda *args, **kwargs: FakePdf())

    text = extract_text_from_file(b"data", "sample.pdf")
    assert "plumber" in text


def test_extract_text_pdfreader_with_text(monkeypatch):
    class FakePage:
        def extract_text(self):
            return "hello"

    class FakeReader:
        pages = [FakePage()]

    monkeypatch.setattr(pypdf, "PdfReader", lambda *args, **kwargs: FakeReader())

    text = extract_text_from_file(b"data", "sample.pdf")
    assert "hello" in text


def test_extract_text_docx_error(monkeypatch):
    def fake_docx(*args, **kwargs):
        raise Exception("bad docx")

    monkeypatch.setattr(docx, "Document", fake_docx)
    text = extract_text_from_file(b"broken", "bad.docx")
    assert text == ""


def test_extract_text_txt_decode_error():
    text = extract_text_from_file(b"\xff", "bad.txt")
    assert text == ""
