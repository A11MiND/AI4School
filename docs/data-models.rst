Data Models
===========

This section lists key tables and relationships.

User
----
- Table: ``users``
- Fields:
	- ``id``: Integer, PK
	- ``username``: String, unique, not null
	- ``password_hash``: String, not null
	- ``role``: String, not null (admin/teacher/student)
	- ``full_name``: String, nullable
	- ``avatar_url``: String, nullable
	- ``created_at``: DateTime, server default now
- Relationships: one-to-many with classes (teacher), submissions (student)

Class
-----
- Table: ``classes``
- Fields:
	- ``id``: Integer, PK
	- ``name``: String, not null
	- ``teacher_id``: Integer, FK -> ``users.id``
- Relationships: many-to-many with students via ``students`` join table

StudentClass (Join)
-------------------
- Table: ``students`` (association)
- Fields:
	- ``id``: Integer, PK
	- ``user_id``: Integer, FK -> ``users.id``
	- ``class_id``: Integer, FK -> ``classes.id``

Document
--------
- Table: ``documents``
- Fields:
	- ``id``: Integer, PK
	- ``title``: String, not null
	- ``content``: Text, nullable
	- ``file_path``: String, nullable
	- ``uploaded_by``: Integer, FK -> ``users.id``
	- ``created_at``: DateTime, server default now
	- ``is_deleted``: Boolean, default false
	- ``deleted_at``: DateTime, nullable
	- ``is_folder``: Boolean, default false
	- ``parent_id``: Integer, FK -> ``documents.id`` (nullable)
- Relationships: self-referential folder tree via ``parent_id``

DocumentClassVisibility
-----------------------
- Table: ``document_class_visibility``
- Fields:
	- ``id``: Integer, PK
	- ``document_id``: Integer, FK -> ``documents.id``
	- ``class_id``: Integer, FK -> ``classes.id``
	- ``visible``: Boolean, default false
	- ``updated_at``: DateTime, server default now

Paper
-----
- Table: ``papers``
- Fields:
	- ``id``: Integer, PK
	- ``title``: String, not null
	- ``article_content``: String, nullable
	- ``class_id``: Integer, FK -> ``classes.id``
	- ``created_by``: Integer, FK -> ``users.id``
	- ``created_at``: DateTime, server default now
- Relationships: has many questions; assigned via ``assignments``

Question
--------
- Table: ``questions``
- Fields:
	- ``id``: Integer, PK
	- ``paper_id``: Integer, FK -> ``papers.id``
	- ``question_text``: String, not null
	- ``question_type``: String, default "MCQ"
	- ``options``: JSON, nullable
	- ``correct_answer``: JSON, nullable
	- ``correct_answer_schema``: JSON, nullable
	- ``skill_tag``: String, nullable
	- ``difficulty``: Integer, default 1

Assignment
----------
- Table: ``assignments``
- Fields:
	- ``id``: Integer, PK
	- ``paper_id``: Integer, FK -> ``papers.id``
	- ``class_id``: Integer, FK -> ``classes.id``, nullable
	- ``student_id``: Integer, FK -> ``users.id``, nullable
	- ``assigned_at``: DateTime, server default now
	- ``deadline``: DateTime, nullable
	- ``duration_minutes``: Integer, nullable
	- ``max_attempts``: Integer, default 1

Submission
----------
- Table: ``submissions``
- Fields:
	- ``id``: Integer, PK
	- ``student_id``: Integer, FK -> ``users.id``
	- ``paper_id``: Integer, FK -> ``papers.id``
	- ``submitted_at``: DateTime, server default now
	- ``score``: Float, nullable
- Relationships: has many answers

Answer
------
- Table: ``answers``
- Fields:
	- ``id``: Integer, PK
	- ``submission_id``: Integer, FK -> ``submissions.id``
	- ``question_id``: Integer, FK -> ``questions.id``
	- ``answer``: String, nullable
	- ``is_correct``: Boolean, nullable
	- ``score``: Float, nullable

StudentNotebook
---------------
- Table: ``student_notebook``
- Fields:
	- ``id``: Integer, PK
	- ``student_id``: Integer, FK -> ``users.id``
	- ``question_id``: Integer, FK -> ``questions.id``
	- ``original_paper_id``: Integer, FK -> ``papers.id``
	- ``wrong_answer_given``: String, nullable
	- ``ai_feedback``: Text, nullable
	- ``review_status``: String, default "NEW"
	- ``created_at``: DateTime, server default now
