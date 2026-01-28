Backend
=======

Technology
----------
- FastAPI
- SQLAlchemy ORM
- JWT authentication

Entry Point
-----------
The backend app is initialized in ``backend/app/main.py`` and mounts routers:
``auth``, ``papers``, ``classes``, ``assignments``, ``users``, ``analytics``, ``documents``.

Core Modules
------------
- ``backend/app/routers/auth.py``: Login and registration
- ``backend/app/routers/documents.py``: Upload, folders, visibility, delete
- ``backend/app/routers/papers.py``: Paper creation, questions, submissions
- ``backend/app/routers/classes.py``: Class management and roster
- ``backend/app/routers/assignments.py``: Assign papers to class/student
- ``backend/app/routers/analytics.py``: Teacher dashboard metrics and student report
- ``backend/app/routers/users.py``: Profile and avatar upload

Detailed Reference
------------------
See:
- ``modules`` for module-by-module descriptions
- ``endpoints`` for route reference
- ``data-models`` for table definitions

Data Models
-----------
Key models are under ``backend/app/models``:
- ``User`` / ``ClassModel`` / ``StudentClass``
- ``Document`` / ``DocumentClassVisibility``
- ``Paper`` / ``Question``
- ``Assignment``
- ``Submission`` / ``Answer``

Uploads
-------
Files are stored under ``backend/uploads`` and served from ``/uploads``.
