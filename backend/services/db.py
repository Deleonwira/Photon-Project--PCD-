"""PHOTON — DB Service"""

import pymysql
from flask import current_app, g


def get_db():
    """Get a database connection for the current request.
    Connections are cached in Flask's `g` object and reused
    within the same request context."""
    if 'db' not in g:
        g.db = pymysql.connect(
            host=current_app.config['MYSQL_HOST'],
            user=current_app.config['MYSQL_USER'],
            password=current_app.config['MYSQL_PASSWORD'],
            database=current_app.config['MYSQL_DB'],
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
        )
    return g.db


def close_db(e=None):
    """Close database connection at end of request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db(app):
    """Register the teardown handler and auto-initialize the database."""
    app.teardown_appcontext(close_db)

    # ── Database & Table Auto-Creation (Self-Healing) ──────────
    try:
        # First connect without specifying database to create it if missing
        conn = pymysql.connect(
            host=app.config['MYSQL_HOST'],
            user=app.config['MYSQL_USER'],
            password=app.config['MYSQL_PASSWORD'],
            autocommit=True,
        )
        cursor = conn.cursor()

        # Create database
        db_name = app.config['MYSQL_DB']
        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS {db_name} "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        cursor.execute(f"USE {db_name}")

        # Create users table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          username      VARCHAR(64)  NOT NULL UNIQUE,
          password_hash VARCHAR(128) NOT NULL,
          created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
        """)

        # Create projects table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
          id             INT AUTO_INCREMENT PRIMARY KEY,
          user_id        INT          NOT NULL,
          name           VARCHAR(128) NOT NULL,
          width          INT          DEFAULT 1920,
          height         INT          DEFAULT 1080,
          background     VARCHAR(32)  DEFAULT '#FFFFFF',
          thumbnail_b64  LONGTEXT,
          image_data     LONGBLOB,
          created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
          updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
        """)

        # Check for missing columns (migration support)
        cursor.execute("SHOW COLUMNS FROM projects LIKE 'raw_image_src'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE projects ADD COLUMN raw_image_src LONGTEXT")
            print("  [+] Database Migration: Added raw_image_src column to projects table.")

        cursor.execute("SHOW COLUMNS FROM projects LIKE 'image_transform'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE projects ADD COLUMN image_transform LONGTEXT")
            print("  [+] Database Migration: Added image_transform column to projects table.")

        cursor.close()
        conn.close()
        print(f"  [*] Photon Database '{db_name}' initialized and verified successfully.")
    except Exception as e:
        print(f"\n  [!] Database initialization warning: {e}")
        print("  [!] Please ensure MySQL server is running (e.g., via XAMPP) and the credentials in .env are correct.\n")
