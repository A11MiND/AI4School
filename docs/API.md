# AI4School API (Frontend Integration)

## Base
- **Base URL**: `http://localhost:8000`
- **Auth**: Bearer token in `Authorization` header: `Bearer <token>`
- **Roles**: `student`, `teacher`, `admin`

## Auth
### POST `/auth/register`
Create user.
```json
{
  "username": "alice",
  "password": "secret",
  "role": "student"
}
```

### POST `/auth/login`
Login and get token.
```json
{
  "username": "alice",
  "password": "secret"
}
```
Response:
```json
{ "access_token": "...", "token_type": "bearer", "role": "student" }
```

### POST `/token`
OAuth2 password flow (form-encoded).
```
username=alice&password=secret
```
Response:
```json
{ "access_token": "...", "token_type": "bearer", "role": "student" }
```

## Users
### GET `/users/me`
Current user profile.

### PUT `/users/me`
Update profile (any subset).
```json
{ "username": "alice2", "full_name": "Alice", "password": "newpass" }
```

### POST `/users/me/avatar`
Upload avatar. **multipart/form-data** with `file`.
Response:
```json
{ "avatar_url": "uploads/avatars/avatar_1_abcd1234.png" }
```

## Classes
### GET `/classes`
List classes. Teacher sees own; student sees enrolled.

### POST `/classes`
Create class (teacher/admin).
```json
{ "name": "Class 1" }
```

### GET `/classes/{class_id}/students`
List students in class.

### POST `/classes/{class_id}/students`
Add student by username.
```json
{ "username": "student01" }
```

### DELETE `/classes/{class_id}`
Delete class (teacher/admin).

### DELETE `/classes/{class_id}/students/{student_id}`
Remove student.

## Documents
### POST `/documents/create_folder`
Create folder.
```json
{ "name": "Week 1", "parent_id": 12 }
```

### POST `/documents/upload`
Upload document. **multipart/form-data** with `file` and optional `parent_id`.

### GET `/documents`
List documents.
Query params:
- `parent_id` (optional)
- `uploaded_by` (optional)
- `class_id` (required for students)

### GET `/documents/{document_id}`
Get document metadata.

### DELETE `/documents/{document_id}`
Delete document. Query param `hard=true` for permanent delete.

### POST `/documents/{document_id}/visibility`
Set per-class visibility.
```json
{ "class_id": 5, "visible": true }
```

### GET `/documents/{doc_id}/download`
Download file.

## Papers
### POST `/papers/generate`
Generate questions from article (teacher/admin).
```json
{
  "article_content": "...",
  "difficulty": "medium",
  "assessment_objectives": ["Inference"],
  "question_formats": ["mc", "gap"],
  "question_format_counts": {"mc": 3, "gap": 2},
  "marking_strictness": "moderate",
  "text_type": "article",
  "register": "formal",
  "cognitive_load": "medium"
}
```

### POST `/papers`
Create paper with questions.
```json
{
  "title": "Paper 1",
  "article_content": "...",
  "class_id": 3,
  "questions": [
    {
      "question_text": "Q1",
      "question_type": "mcq",
      "options": ["A", "B"],
      "correct_answer": "A"
    }
  ]
}
```

### GET `/papers`
List papers.
- Student: returns assignments + progress
- Teacher: returns created papers

### GET `/papers/{paper_id}`
Paper detail with `questions`, `assignment`, and latest `submission` data.

### PUT `/papers/questions/{question_id}`
Update a question.
```json
{
  "question_text": "Updated",
  "question_type": "gap",
  "options": ["A"],
  "correct_answer": "answer"
}
```

### POST `/papers/{paper_id}/submit`
Submit answers.
```json
{
  "answers": [
    {"question_id": 10, "answer": "A"}
  ]
}
```
Response:
```json
{ "message": "Submitted successfully", "submission_id": 123, "score": 85 }
```

### GET `/papers/submissions/{submission_id}`
Submission details for student/teacher.

### GET `/papers/students/{student_id}/submissions`
Teacher: list submissions for a student.

### PUT `/papers/submissions/answers/{answer_id}/score`
Teacher: update answer score.
```json
{ "score": 1 }
```

### DELETE `/papers/{paper_id}`
Delete paper and related submissions.

## Assignments
### POST `/assignments`
Assign paper to class or student.
```json
{
  "paper_id": 12,
  "class_id": 3,
  "student_id": null,
  "deadline": "2026-01-31T12:00:00Z",
  "duration_minutes": 60,
  "max_attempts": 1
}
```

### GET `/assignments/paper/{paper_id}`
List assignments for a paper.

### DELETE `/assignments/{assignment_id}`
Delete assignment.

## Analytics (Teacher/Admin)
### GET `/analytics/overview`
Query params: `class_id` (optional)

### GET `/analytics/weak-skills`
Query params: `limit`, `class_id`

### GET `/analytics/student-performance`
Query params: `class_id`

### GET `/analytics/weak-areas`
Query params: `limit`, `class_id`

## Analytics (Student)
### GET `/analytics/student-report`
Student self report summary.

## Notes
- `Document.visible` is per-class; default is hidden unless set via visibility API.
- File URLs are served from `/uploads/*`.
