

import os
from dotenv import load_dotenv

# Load env variables from .env file
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))


class Config:
    # mysql
    MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
    MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
    MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')  # XAMPP default
    MYSQL_DB = os.environ.get('MYSQL_DB', 'photon_db')

    # flask
    SECRET_KEY = os.environ.get('SECRET_KEY', 'photon-dev-secret-key')
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
    MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32 MB max upload

    # cors
    CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000',
                     'http://localhost:3001', 'http://127.0.0.1:3001']
