Endpoints
=========

Auth
----
- ``POST /auth/register``: Create user (teacher/student).
- Request JSON: ``username`` (string, required), ``password`` (string, required), ``role`` ("student"|"teacher", optional)
- Response JSON: ``message`` (string)
- ``POST /auth/login``: Login, returns JWT.
- Request JSON: ``username`` (string, required), ``password`` (string, required)
- Response JSON: ``access_token`` (string), ``token_type`` ("bearer"), ``role`` (string)
- ``POST /token``: OAuth2 password login.
- Form fields: ``username`` (string), ``password`` (string)
- Response JSON: ``access_token`` (string), ``token_type`` ("bearer"), ``role`` (string)

Users
-----
- ``GET /users/me``: Current user profile.
- Response JSON: ``id`` (int), ``username`` (string), ``role`` (string), ``full_name`` (string|null), ``avatar_url`` (string|null)
- ``PUT /users/me``: Update profile (username/full_name/password).
- Request JSON: any of ``username`` (string), ``full_name`` (string), ``password`` (string)
- Response JSON: ``message`` (string), ``username`` (string), ``full_name`` (string|null)
- ``POST /users/me/avatar``: Upload avatar.
- Request: ``multipart/form-data`` with ``file``
- Response JSON: ``avatar_url`` (string, relative path)

Classes
-------
- ``GET /classes``: List classes.
- Response JSON array of class objects: ``id`` (int), ``name`` (string), ``teacher_id`` (int)
- ``POST /classes``: Create class.
- Request JSON: ``name`` (string)
- Response JSON: created class object
- ``GET /classes/{class_id}/students``: List students in class.
- Response JSON array: ``id`` (int), ``username`` (string), ``role`` (string)
- ``POST /classes/{class_id}/students``: Add student by username.
- Request JSON: ``username`` (string)
- Response JSON: ``message`` (string)
- ``DELETE /classes/{class_id}``: Delete class.
- Response JSON: ``message`` (string)
- ``DELETE /classes/{class_id}/students/{student_id}``: Remove student.
- Response JSON: ``message`` (string)

Documents
---------
- ``POST /documents/create_folder``: Create folder.
- Request JSON: ``name`` (string), ``parent_id`` (int|null)
- Response JSON: folder document object
- ``POST /documents/upload``: Upload document (multipart).
- Request: ``multipart/form-data`` with ``file`` and optional ``parent_id``
- Response JSON: ``message`` (string), ``id`` (int)
- ``GET /documents``: List documents (supports ``parent_id``, ``class_id``).
- Response JSON array: ``id`` (int), ``title`` (string), ``file_path`` (string|null), ``is_folder`` (bool), ``parent_id`` (int|null), ``uploaded_by`` (int), ``created_at`` (datetime), ``visible`` (bool|null)
- ``GET /documents/{document_id}``: Get document metadata.
- ``DELETE /documents/{document_id}``: Delete (soft by default, ``hard=true`` for permanent).
- Response JSON: ``message`` (string)
- ``POST /documents/{document_id}/visibility``: Set per-class visibility.
- Request JSON: ``class_id`` (int), ``visible`` (bool)
- Response JSON: ``message`` (string)
- ``GET /documents/{doc_id}/download``: Download file.

Papers
------
- ``POST /papers/generate``: Generate questions from article.
- Request JSON: ``article_content`` (string) plus optional settings: ``difficulty``, ``assessment_objectives`` (array), ``question_formats`` (array), ``question_format_counts`` (object), ``marking_strictness``, ``text_type``, ``register``, ``cognitive_load``
- Response JSON array of questions
- ``POST /papers``: Create paper with questions.
- Request JSON: ``title`` (string), ``article_content`` (string), ``class_id`` (int|null), ``questions`` (array)
- ``questions[]`` fields: ``question_text`` (string), ``question_type`` (string), ``options`` (array|null), ``correct_answer`` (string|null)
- Response JSON: ``message`` (string), ``paper_id`` (int)
- ``GET /papers``: List papers (student returns assignments + status).
- Student response fields: ``id``, ``title``, ``assignment_id``, ``deadline``, ``duration_minutes``, ``max_attempts``, ``submitted_count``, ``latest_score``, ``latest_submission_id``, ``status``
- Teacher response: array of paper objects
- ``GET /papers/{paper_id}``: Paper detail with questions and assignment info.
- Response JSON: ``id``, ``title``, ``article_content``, ``questions`` (array), ``assignment`` (object|null), ``submission`` (object|null)
- ``PUT /papers/questions/{question_id}``: Update a question.
- Request JSON: any of ``question_text``, ``question_type``, ``options``, ``correct_answer``
- Response JSON: updated question object
- ``POST /papers/{paper_id}/submit``: Submit answers.
- Request JSON: ``answers`` array of ``{question_id, answer}``
- Response JSON: ``message``, ``submission_id``, ``score``
- ``GET /papers/submissions/{submission_id}``: Submission detail.
- Response JSON: ``id``, ``student_name``, ``paper_title``, ``score``, ``answers`` array
- ``GET /papers/students/{student_id}/submissions``: Teacher submission list.
- Response JSON array: ``id``, ``paper_title``, ``submitted_at``, ``score``
- ``PUT /papers/submissions/answers/{answer_id}/score``: Update answer score.
- Request JSON: ``score`` (float)
- Response JSON: ``message``, ``total_score``
- ``DELETE /papers/{paper_id}``: Delete paper and related records.
- Response JSON: ``message`` (string)

Assignments
-----------
- ``POST /assignments``: Assign paper to class/student.
- Request JSON: ``paper_id`` (int), ``class_id`` (int|null), ``student_id`` (int|null), ``deadline`` (ISO string|null), ``duration_minutes`` (int|null), ``max_attempts`` (int)
- Response JSON: ``message`` (string)
- ``GET /assignments/paper/{paper_id}``: List assignments for paper.
- Response JSON array: ``id``, ``assigned_at``, ``deadline``, ``duration_minutes``, ``max_attempts``, ``target_name``, ``type``
- ``DELETE /assignments/{assignment_id}``: Delete assignment.
- Response JSON: ``message`` (string)

Analytics
---------
- ``GET /analytics/overview``: Summary metrics.
- Response JSON: ``total_submissions`` (int), ``average_score`` (float), ``active_students`` (int)
- ``GET /analytics/weak-skills``: Skill error counts.
- Response JSON array: ``skill`` (string), ``errors`` (int)
- ``GET /analytics/student-performance``: Student averages.
- Response JSON array: ``student`` (string), ``average_score`` (float), ``exams_taken`` (int)
- ``GET /analytics/weak-areas``: Weak areas summary.
- Response JSON: ``skills``, ``question_types``, ``papers``, ``students`` arrays
- ``GET /analytics/student-report``: Student report.
- Response JSON: ``overview``, ``trend``, ``weak_skills``, ``skill_accuracy``, ``type_accuracy``, ``recent``, ``summary``

Examples
--------
Login:

.. code-block:: json

	 { "username": "alice", "password": "secret" }

Create paper:

.. code-block:: json

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
