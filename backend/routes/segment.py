"""PHOTON — Segment Routes"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
from routes.image import decode_image, encode_image

segment_bp = Blueprint('segment', __name__)


@segment_bp.route('/apply', methods=['POST'])
def apply_segment():
    data = request.json
    img = decode_image(data['image_b64'])
    op = data['operation']
    params = data.get('params', {})

    try:
        result = dispatch(img, op, params)
        return jsonify({'image_b64': encode_image(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def dispatch(img, op, params):
    # ── Threshold-Based Segmentation ─────────────────────────
    if op == 'seg_threshold':
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        value = int(params.get('threshold', 128))
        _, binary = cv2.threshold(gray, value, 255, cv2.THRESH_BINARY)

        num_labels, labels = cv2.connectedComponents(binary)
        colors = np.random.randint(50, 255, size=(num_labels, 3), dtype=np.uint8)
        colors[0] = [0, 0, 0]  # Background = black
        return colors[labels].astype(np.uint8)

    # ── Edge-Based Segmentation ──────────────────────────────
    if op == 'seg_edge':
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        low = int(params.get('low', 50))
        high = int(params.get('high', 150))
        edges = cv2.Canny(gray, low, high)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        result = np.zeros_like(img)
        for contour in contours:
            color = np.random.randint(50, 255, 3).tolist()
            cv2.drawContours(result, [contour], -1, color, cv2.FILLED)
        return result

    # ── Region-Based (K-Means Clustering) ────────────────────
    if op == 'seg_region':
        k = int(params.get('k', 4))
        k = max(2, min(k, 12))

        pixel_values = img.reshape((-1, 3)).astype(np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
        _, labels, centers = cv2.kmeans(
            pixel_values, k, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)

        centers = np.uint8(centers)
        segmented = centers[labels.flatten()]
        return segmented.reshape(img.shape)

    raise ValueError(f'Unknown segment operation: {op}')
