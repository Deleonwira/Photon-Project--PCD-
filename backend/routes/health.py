"""PHOTON — Health Check Route"""

from flask import Blueprint, jsonify

health_bp = Blueprint('health', __name__)


@health_bp.route('/health', methods=['GET'])
def health():
    """Simple health check endpoint for verifying the backend is running."""
    return jsonify({
        'status': 'ok',
        'service': 'photon-backend',
        'version': '1.0.0',
    })
