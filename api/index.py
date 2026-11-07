"""Vercel entry point: serves the backend under /api."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi import FastAPI

import main as backend
import seed

seed.bootstrap()  # create tables, the admin account and demo data (a mounted app does not run its own startup)

app = FastAPI()
app.mount("/api", backend.app)
