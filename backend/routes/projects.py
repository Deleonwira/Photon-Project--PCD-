"""PHOTON — Project Routes"""

from flask import Blueprint, request, jsonify, session
import base64
from services.db import get_db

projects_bp = Blueprint('projects', __name__)


def require_auth():
    """Return user_id or None."""
    return session.get('user_id')


@projects_bp.route('', methods=['GET'])
def list_projects():
    user_id = require_auth()
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    db = get_db()
    cur = db.cursor()
    cur.execute(
        'SELECT id, name, width, height, background, thumbnail_b64, '
        'created_at, updated_at FROM projects WHERE user_id = %s '
        'ORDER BY updated_at DESC',
        (user_id,))
    projects = cur.fetchall()

    # Convert datetime to string for JSON
    for p in projects:
        if p.get('created_at'):
            p['created_at'] = str(p['created_at'])
        if p.get('updated_at'):
            p['updated_at'] = str(p['updated_at'])

    return jsonify({'projects': projects})


@projects_bp.route('', methods=['POST'])
def create_project():
    user_id = require_auth()
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    data = request.json
    name = data.get('name', 'Untitled')
    width = int(data.get('width', 1920))
    height = int(data.get('height', 1080))
    background = data.get('background', '#FFFFFF')

    db = get_db()
    cur = db.cursor()
    cur.execute(
        'INSERT INTO projects (user_id, name, width, height, background) '
        'VALUES (%s, %s, %s, %s, %s)',
        (user_id, name, width, height, background))

    project_id = cur.lastrowid
    return jsonify({'id': project_id, 'name': name}), 201


@projects_bp.route('/<int:project_id>', methods=['GET'])
def get_project(project_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    db = get_db()
    cur = db.cursor()
    cur.execute(
        'SELECT id, name, width, height, background, thumbnail_b64, '
        'image_data, raw_image_src, image_transform, created_at, updated_at '
        'FROM projects WHERE id = %s AND user_id = %s',
        (project_id, user_id))
    project = cur.fetchone()

    if not project:
        return jsonify({'error': 'Project not found'}), 404

    # Encode image_data blob to base64 for frontend
    if project.get('image_data'):
        project['image_b64'] = base64.b64encode(project['image_data']).decode('utf-8')
    else:
        project['image_b64'] = None
    del project['image_data']

    if project.get('created_at'):
        project['created_at'] = str(project['created_at'])
    if project.get('updated_at'):
        project['updated_at'] = str(project['updated_at'])

    return jsonify({'project': project})


@projects_bp.route('/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    data = request.json
    db = get_db()
    cur = db.cursor()

    # Build dynamic update
    fields = []
    values = []

    if 'name' in data:
        fields.append('name = %s')
        values.append(data['name'])
    if 'image_b64' in data:
        img_bytes = base64.b64decode(data['image_b64']) if data['image_b64'] else None
        fields.append('image_data = %s')
        values.append(img_bytes)
    if 'thumbnail_b64' in data:
        fields.append('thumbnail_b64 = %s')
        values.append(data['thumbnail_b64'])
    if 'width' in data:
        fields.append('width = %s')
        values.append(int(data['width']))
    if 'height' in data:
        fields.append('height = %s')
        values.append(int(data['height']))
    if 'background' in data:
        fields.append('background = %s')
        values.append(data['background'])
    if 'raw_image_src' in data:
        fields.append('raw_image_src = %s')
        values.append(data['raw_image_src'])
    if 'image_transform' in data:
        fields.append('image_transform = %s')
        values.append(data['image_transform'])

    if not fields:
        return jsonify({'error': 'No fields to update'}), 400

    values.extend([project_id, user_id])
    cur.execute(
        f'UPDATE projects SET {", ".join(fields)} '
        f'WHERE id = %s AND user_id = %s',
        values)

    return jsonify({'message': 'Project updated'})


@projects_bp.route('/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    db = get_db()
    cur = db.cursor()
    cur.execute('DELETE FROM projects WHERE id = %s AND user_id = %s',
                (project_id, user_id))

    return jsonify({'message': 'Project deleted'})
