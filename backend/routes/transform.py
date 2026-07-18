"""PHOTON — Transform Routes"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
from routes.image import decode_image, encode_image

transform_bp = Blueprint('transform', __name__)


@transform_bp.route('/apply', methods=['POST'])
def apply_transform():
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
    """Route to the correct transform function."""
    h, w = img.shape[:2]

    # ── Flip ─────────────────────────────────────────────────
    if op == 'flip_h':
        return cv2.flip(img, 1)
    if op == 'flip_v':
        return cv2.flip(img, 0)

    # ── Rotate 90 / 180 ─────────────────────────────────────
    if op == 'rotate_90cw':
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if op == 'rotate_90ccw':
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    if op == 'rotate_180':
        return cv2.rotate(img, cv2.ROTATE_180)

    # ── Free Rotation (Affine Matrix — spec required) ────────
    if op == 'rotate_free':
        angle = float(params.get('angle', 0))
        center = (w // 2, h // 2)

        # Build 2x3 affine rotation matrix
        M = cv2.getRotationMatrix2D(center, angle, 1.0)

        # Expand canvas to fit rotated image
        cos = np.abs(M[0, 0])
        sin = np.abs(M[0, 1])
        new_w = int(h * sin + w * cos)
        new_h = int(h * cos + w * sin)
        M[0, 2] += (new_w / 2) - center[0]
        M[1, 2] += (new_h / 2) - center[1]

        interp = get_interpolation(params)
        bg = params.get('bg_color', [255, 255, 255])

        return cv2.warpAffine(
            img, M, (new_w, new_h),
            flags=interp,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=bg,
        )

    # ── Resize ───────────────────────────────────────────────
    if op == 'resize':
        new_w = int(params.get('width', w))
        new_h = int(params.get('height', h))
        interp = get_interpolation(params)
        return cv2.resize(img, (new_w, new_h), interpolation=interp)

    # ── Crop ─────────────────────────────────────────────────
    if op == 'crop':
        cx = max(0, int(params['x']))
        cy = max(0, int(params['y']))
        cw = int(params['width'])
        ch = int(params['height'])
        # Clamp to image bounds
        cx2 = min(cx + cw, w)
        cy2 = min(cy + ch, h)
        return img[cy:cy2, cx:cx2].copy()

    # ── Translation / Shift (Affine) ─────────────────────────
    if op == 'translate':
        tx = float(params.get('tx', 0))
        ty = float(params.get('ty', 0))
        M = np.float32([[1, 0, tx], [0, 1, ty]])
        bg = params.get('bg_color', [255, 255, 255])
        return cv2.warpAffine(
            img, M, (w, h),
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=bg,
        )

    raise ValueError(f'Unknown transform: {op}')


def get_interpolation(params):
    """Map interpolation name to OpenCV flag."""
    name = params.get('interpolation', 'bilinear')
    if name == 'nearest':
        return cv2.INTER_NEAREST
    return cv2.INTER_LINEAR  # bilinear default
