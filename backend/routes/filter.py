"""PHOTON — Filter Routes"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
from routes.image import decode_image, encode_image

filter_bp = Blueprint('filter', __name__)


@filter_bp.route('/apply', methods=['POST'])
def apply_filter():
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
    # ── Gaussian Blur ────────────────────────────────────────
    if op in ('gaussian_blur', 'gaussian'):
        k = max(3, int(params.get('kernel_size', 5)) | 1)
        sigma = float(params.get('sigma', 0))
        return cv2.GaussianBlur(img, (k, k), sigma)

    # ── Box Blur (Mean filter) ────────────────────────────────
    if op == 'box':
        k = max(3, int(params.get('kernel_size', 5)) | 1)
        return cv2.blur(img, (k, k))

    # ── Median Filter ────────────────────────────────────────
    if op == 'median':
        k = max(3, int(params.get('kernel_size', 5)) | 1)
        return cv2.medianBlur(img, k)

    # ── Bilateral Filter (edge-preserving) ───────────────────
    if op == 'bilateral':
        d = int(params.get('d', 9))
        sc = float(params.get('sigma_color', 75))
        ss = float(params.get('sigma_space', 75))
        return cv2.bilateralFilter(img, d, sc, ss)

    # ── Add Salt & Pepper Noise (demo) ───────────────────────
    if op == 'noise_sp':
        amount = float(params.get('amount', 0.05))
        noisy = img.copy()
        h, w = img.shape[:2]
        num = int(amount * h * w)

        # Salt (white)
        ys = np.random.randint(0, h, num)
        xs = np.random.randint(0, w, num)
        noisy[ys, xs] = 255

        # Pepper (black)
        yp = np.random.randint(0, h, num)
        xp = np.random.randint(0, w, num)
        noisy[yp, xp] = 0

        return noisy

    # ── Add Gaussian Noise (demo) ────────────────────────────
    if op == 'noise_gaussian':
        mean = float(params.get('mean', 0))
        sigma = float(params.get('sigma', 25))
        noise = np.random.normal(mean, sigma, img.shape).astype(np.float32)
        noisy = np.clip(img.astype(np.float32) + noise, 0, 255)
        return noisy.astype(np.uint8)

    raise ValueError(f'Unknown filter operation: {op}')
