"""PHOTON — Edge Routes"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
from routes.image import decode_image, encode_image

edge_bp = Blueprint('edge', __name__)


@edge_bp.route('/apply', methods=['POST'])
def apply_edge():
    data = request.json
    img = decode_image(data['image_b64'])
    op = data['operation']
    params = data.get('params', {})

    try:
        result = dispatch(img, op, params)
        return jsonify({'image_b64': encode_image(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def to_gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img


def to_bgr(gray):
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def dispatch(img, op, params):
    # ── Thresholding ─────────────────────────────────────────
    if op == 'threshold':
        gray = to_gray(img)
        method = params.get('method', 'global')
        value = int(params.get('value', 128))

        if method == 'global':
            _, result = cv2.threshold(gray, value, 255, cv2.THRESH_BINARY)
        elif method == 'otsu':
            _, result = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        elif method == 'adaptive':
            result = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2)
        else:
            _, result = cv2.threshold(gray, value, 255, cv2.THRESH_BINARY)

        return to_bgr(result)

    # ── Canny ────────────────────────────────────────────────
    if op == 'canny':
        gray = to_gray(img)
        low = int(params.get('low', 50))
        high = int(params.get('high', 150))
        edges = cv2.Canny(gray, low, high)
        return to_bgr(edges)

    # ── Sobel ────────────────────────────────────────────────
    if op == 'sobel':
        gray = to_gray(img)
        ksize = int(params.get('ksize', 3)) | 1
        sx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=ksize)
        sy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=ksize)
        mag = np.sqrt(sx ** 2 + sy ** 2)
        return to_bgr(np.uint8(np.clip(mag, 0, 255)))

    # ── Prewitt ──────────────────────────────────────────────
    if op == 'prewitt':
        gray = to_gray(img)
        kx = np.array([[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]], dtype=np.float32)
        ky = np.array([[-1, -1, -1], [0, 0, 0], [1, 1, 1]], dtype=np.float32)
        px = cv2.filter2D(gray, cv2.CV_64F, kx)
        py = cv2.filter2D(gray, cv2.CV_64F, ky)
        mag = np.sqrt(px ** 2 + py ** 2)
        return to_bgr(np.uint8(np.clip(mag, 0, 255)))

    # ── Robert ───────────────────────────────────────────────
    if op == 'robert':
        gray = to_gray(img)
        kx = np.array([[1, 0], [0, -1]], dtype=np.float32)
        ky = np.array([[0, 1], [-1, 0]], dtype=np.float32)
        rx = cv2.filter2D(gray, cv2.CV_64F, kx)
        ry = cv2.filter2D(gray, cv2.CV_64F, ky)
        mag = np.sqrt(rx ** 2 + ry ** 2)
        return to_bgr(np.uint8(np.clip(mag, 0, 255)))

    # ── Laplacian ────────────────────────────────────────────
    if op == 'laplacian':
        gray = to_gray(img)
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        return to_bgr(np.uint8(np.abs(lap)))

    # ── Laplacian of Gaussian (LoG) ──────────────────────────
    if op == 'log':
        gray = to_gray(img)
        sigma = float(params.get('sigma', 1.0))
        k = max(3, int(params.get('ksize', 5)) | 1)
        blurred = cv2.GaussianBlur(gray, (k, k), sigma)
        lap = cv2.Laplacian(blurred, cv2.CV_64F)
        return to_bgr(np.uint8(np.abs(lap)))

    # ── Morphology ───────────────────────────────────────────
    if op == 'erode' or op == 'dilate':
        k = max(3, int(params.get('kernel_size', 5)) | 1)
        shape_name = params.get('shape', 'rect')
        shapes = {
            'rect': cv2.MORPH_RECT,
            'cross': cv2.MORPH_CROSS,
            'ellipse': cv2.MORPH_ELLIPSE,
        }
        kernel = cv2.getStructuringElement(
            shapes.get(shape_name, cv2.MORPH_RECT), (k, k))

        if op == 'erode':
            return cv2.erode(img, kernel, iterations=1)
        else:
            return cv2.dilate(img, kernel, iterations=1)

    raise ValueError(f'Unknown edge operation: {op}')
