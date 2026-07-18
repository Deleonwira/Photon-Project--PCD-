"""PHOTON — Auth Routes"""

from flask import Blueprint, request, jsonify, session
import hashlib
from services.db import get_db

auth_bp = Blueprint('auth', __name__)


def hash_password(pw):
    return hashlib.sha256(pw.encode('utf-8')).hexdigest()


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters'}), 400

    db = get_db()
    cur = db.cursor()

    # Check duplicate
    cur.execute('SELECT id FROM users WHERE username = %s', (username,))
    if cur.fetchone():
        return jsonify({'error': 'Username already taken'}), 409

    pw_hash = hash_password(password)
    cur.execute('INSERT INTO users (username, password_hash) VALUES (%s, %s)',
                (username, pw_hash))

    cur.execute('SELECT id, username, created_at FROM users WHERE username = %s', (username,))
    user = cur.fetchone()

    session['user_id'] = user['id']
    return jsonify({'user': user}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')

    db = get_db()
    cur = db.cursor()
    cur.execute('SELECT id, username, password_hash, created_at FROM users WHERE username = %s',
                (username,))
    user = cur.fetchone()

    if not user or user['password_hash'] != hash_password(password):
        return jsonify({'error': 'Invalid username or password'}), 401

    session['user_id'] = user['id']
    del user['password_hash']
    return jsonify({'user': user})


@auth_bp.route('/me', methods=['GET'])
def me():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    db = get_db()
    cur = db.cursor()
    cur.execute('SELECT id, username, created_at FROM users WHERE id = %s', (user_id,))
    user = cur.fetchone()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({'user': user})


@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'message': 'Logged out'})
