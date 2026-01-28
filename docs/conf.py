import os
import sys

project = "AI4School"
author = "A11MiND"

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.napoleon",
    "sphinx.ext.viewcode",
]

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

html_theme = "alabaster"
html_static_path = ["_static"]

# Optional: add backend app to path for autodoc
backend_app_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "app"))
if os.path.isdir(backend_app_path):
    sys.path.insert(0, backend_app_path)
