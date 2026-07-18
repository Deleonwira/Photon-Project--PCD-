"""PHOTON — Enhance Routes"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
from routes.image import decode_image, encode_image

enhance_bp = Blueprint('enhance', __name__)


@enhance_bp.route('/apply', methods=['POST'])
def apply_enhance():
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
    # ── Brightness ───────────────────────────────────────────
    if op == 'brightness':
        value = float(params.get('value', 0))  # -100 to +100
        return cv2.convertScaleAbs(img, alpha=1.0, beta=value)

    # ── Contrast ─────────────────────────────────────────────
    if op == 'contrast':
        factor = float(params.get('factor', 1.0))  # 0.0 to 3.0
        return cv2.convertScaleAbs(img, alpha=factor, beta=0)

    # ── Brightness + Contrast combined ───────────────────────
    if op == 'brightness_contrast':
        brightness = float(params.get('brightness', 0))
        contrast = float(params.get('contrast', 1.0))
        return cv2.convertScaleAbs(img, alpha=contrast, beta=brightness)

    # ── Histogram Equalization ───────────────────────────────
    if op == 'histogram_eq':
        if len(img.shape) == 2:
            return cv2.equalizeHist(img)
        # Color: equalize Y channel in YCrCb space
        ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        ycrcb[:, :, 0] = cv2.equalizeHist(ycrcb[:, :, 0])
        return cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)

    # ── Sharpen ──────────────────────────────────────────────
    if op == 'sharpen':
        amount = float(params.get('amount', 1.0))  # 0.5 to 3.0
        kernel_type = params.get('type', 'standard')

        if kernel_type == 'strong':
            kernel = np.array([
                [-1, -1, -1],
                [-1,  9, -1],
                [-1, -1, -1],
            ], dtype=np.float32)
        else:
            kernel = np.array([
                [0, -1, 0],
                [-1, 4 + amount, -1],
                [0, -1, 0],
            ], dtype=np.float32)

        total = kernel.sum()
        if total != 0:
            kernel = kernel / total
        return cv2.filter2D(img, -1, kernel)

    # ── Smooth / Blur ────────────────────────────────────────
    if op == 'blur':
        method = params.get('method', 'gaussian')
        k = int(params.get('kernel_size', 5))
        k = max(3, k | 1)  # Ensure odd and >= 3

        if method == 'box':
            return cv2.blur(img, (k, k))
        elif method == 'gaussian':
            return cv2.GaussianBlur(img, (k, k), 0)
        return img

    raise ValueError(f'Unknown enhance operation: {op}')
