import sys
import os

# Add backend path to sys.path so app.py imports work smoothly on Vercel
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))

from app import create_app

app = create_app()
