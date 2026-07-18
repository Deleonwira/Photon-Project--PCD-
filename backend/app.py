"""PHOTON — App"""

import os
from flask import Flask
from flask_cors import CORS
from config import Config
from services.db import init_db


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # ── CORS (with credentials for session cookies) ──────────
    CORS(app, origins=app.config['CORS_ORIGINS'], supports_credentials=True)

    # ── Ensure uploads directory exists ──────────────────────
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    # ── Register Blueprints ──────────────────────────────────
    from routes.health import health_bp
    from routes.image import image_bp
    from routes.transform import transform_bp
    from routes.enhance import enhance_bp
    from routes.color import color_bp
    from routes.filter import filter_bp
    from routes.edge import edge_bp
    from routes.segment import segment_bp
    from routes.histogram import histogram_bp
    from routes.ai import ai_bp
    from routes.auth import auth_bp
    from routes.projects import projects_bp

    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(image_bp, url_prefix='/api/image')
    app.register_blueprint(transform_bp, url_prefix='/api/transform')
    app.register_blueprint(enhance_bp, url_prefix='/api/enhance')
    app.register_blueprint(color_bp, url_prefix='/api/color')
    app.register_blueprint(filter_bp, url_prefix='/api/filter')
    app.register_blueprint(edge_bp, url_prefix='/api/edge')
    app.register_blueprint(segment_bp, url_prefix='/api/segment')
    app.register_blueprint(histogram_bp, url_prefix='/api/histogram')
    app.register_blueprint(ai_bp, url_prefix='/api/ai')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(projects_bp, url_prefix='/api/projects')

    # ── Database teardown ────────────────────────────────────
    init_db(app)

    return app


# ── Run ──────────────────────────────────────────────────────
if __name__ == '__main__':
    app = create_app()
    print('\n  [*] Photon Backend running on http://localhost:5000')
    print('  [*] Health check: http://localhost:5000/api/health\n')
    app.run(debug=True, host='0.0.0.0', port=5000)
