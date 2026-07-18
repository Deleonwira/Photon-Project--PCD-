"""PHOTON — Color Routes"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
from routes.image import decode_image, encode_image

color_bp = Blueprint('color', __name__)


@color_bp.route('/apply', methods=['POST'])
def apply_color():
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
    # ── Grayscale ────────────────────────────────────────────
    if op == 'grayscale':
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    # ── Channel Split ────────────────────────────────────────
    if op == 'channel_split':
        channel = params.get('channel', 'r')
        b, g, r = cv2.split(img)
        zeros = np.zeros_like(b)

        if channel == 'r':
            return cv2.merge([zeros, zeros, r])
        elif channel == 'g':
            return cv2.merge([zeros, g, zeros])
        elif channel == 'b':
            return cv2.merge([b, zeros, zeros])
        return img

    # ── HSL / Color Adjustment ───────────────────────────────
    if op == 'color_adjust':
        hue_shift = float(params.get('hue_shift', 0))
        sat_factor = float(params.get('saturation_factor', 1.0))
        light_shift = float(params.get('lightness_shift', 0))

        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:, :, 0] = (hsv[:, :, 0] + hue_shift) % 180
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * sat_factor, 0, 255)
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] + light_shift, 0, 255)
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    raise ValueError(f'Unknown color operation: {op}')
