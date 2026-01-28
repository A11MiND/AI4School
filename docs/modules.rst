Modules
=======

Backend Modules
---------------

App entry
~~~~~~~~~
- ``backend/app/main.py``: Initializes FastAPI, mounts routers, configures CORS, and serves uploads.

Auth
~~~~
- ``backend/app/routers/auth.py``: User registration and login. Issues JWT tokens.
- ``backend/app/auth/jwt.py``: JWT encode/decode, password hashing utilities.

Documents
~~~~~~~~~
- ``backend/app/routers/documents.py``: Uploads, folder CRUD, per-class visibility, and delete (soft/hard).
- ``backend/app/models/document.py``: Document model with hierarchy and soft-delete columns.
- ``backend/app/models/document_visibility.py``: Per-class visibility mapping.

Papers
~~~~~~
- ``backend/app/routers/papers.py``: Paper CRUD, question editing, submission handling.
- ``backend/app/services/ai_generator.py``: DeepSeek question generation and open-answer grading.

Classes & Students
~~~~~~~~~~~~~~~~~~
- ``backend/app/routers/classes.py``: Class management and student roster.
- ``backend/app/models/class_model.py``: Class entity.
- ``backend/app/models/student_association.py``: Student-Class join table.

Assignments
~~~~~~~~~~~
- ``backend/app/routers/assignments.py``: Assign paper to class/student.
- ``backend/app/models/assignment.py``: Assignment entity.

Analytics
~~~~~~~~~
- ``backend/app/routers/analytics.py``: Teacher analytics + student report.

Users
~~~~~
- ``backend/app/routers/users.py``: Profile and avatar upload.

Frontend Modules
----------------

Core
~~~~
- ``frontend/components/Layout.tsx``: Global layout, optional sidebar.
- ``frontend/components/Sidebar.tsx``: Role-aware navigation.
- ``frontend/utils/api.ts``: Axios setup with token injection.

Student UI
~~~~~~~~~~
- ``frontend/pages/student/home.tsx``: Dashboard and assignments.
- ``frontend/pages/student/classroom.tsx``: Documents with folders.
- ``frontend/pages/student/paper/[id].tsx``: Exam UI, timers, per-type inputs.
- ``frontend/pages/student/submission/[id].tsx``: Review results.
- ``frontend/pages/student/report.tsx``: Progress report.

Teacher UI
~~~~~~~~~~
- ``frontend/pages/teacher/documents.tsx``: Document upload + visibility toggles.
- ``frontend/pages/teacher/create-paper.tsx``: AI generate + edit questions.
- ``frontend/pages/teacher/papers.tsx``: Paper list + assignments.
- ``frontend/pages/teacher/classes.tsx``: Class roster.
- ``frontend/pages/teacher/analytics.tsx``: Metrics dashboards.
