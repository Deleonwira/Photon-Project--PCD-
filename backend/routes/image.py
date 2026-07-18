"""PHOTON — Image Routes (Upload / Save / Utilities)"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
import base64
import io
from PIL import Image as PILImage
from services.compression import (
    rle_encode, huffman_encode, lzw_encode, arithmetic_encode,
    quantize_image, build_header, write_bmp_rle8, EXT_MAP,
)

image_bp = Blueprint('image', __name__)


# ── Shared Helpers (used by all future route files) ──────────
def decode_image(b64_string):
    """Decode a base64 data-URI string into an OpenCV BGR image."""
    # Strip the data:image/...;base64, prefix if present
    if ',' in b64_string:
        b64_string = b64_string.split(',', 1)[1]
    img_bytes = base64.b64decode(b64_string)
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('Failed to decode image')
    return img


def encode_image(img, fmt='png'):
    """Encode an OpenCV BGR image to a base64 data-URI string."""
    ext = f'.{fmt}'
    _, buffer = cv2.imencode(ext, img)
    b64 = base64.b64encode(buffer).decode('utf-8')
    mime = 'jpeg' if fmt in ('jpg', 'jpeg') else fmt
    return f'data:image/{mime};base64,{b64}'


# ── Upload ───────────────────────────────────────────────────
@image_bp.route('/upload', methods=['POST'])
def upload():
    """Receive an image file, decode via OpenCV, return base64 + metadata."""
    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'No image provided'}), 400

    try:
        file_bytes = file.read()
        nparr = np.frombuffer(file_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({'error': 'Invalid image file'}), 400

        h, w = img.shape[:2]

        # Encode to PNG for lossless transfer to frontend
        _, buffer = cv2.imencode('.png', img)
        b64 = base64.b64encode(buffer).decode('utf-8')

        return jsonify({
            'width': w,
            'height': h,
            'channels': img.shape[2] if len(img.shape) == 3 else 1,
            'format': file.content_type or 'image/png',
            'original_name': file.filename,
            'size': len(file_bytes),
            'image_b64': f'data:image/png;base64,{b64}',
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Save / Export ────────────────────────────────────────────
@image_bp.route('/save', methods=['POST'])
def save():
    """Re-encode an image in the requested format and quality."""
    data = request.json
    if not data or 'image_b64' not in data:
        return jsonify({'error': 'No image data provided'}), 400

    try:
        img = decode_image(data['image_b64'])
        fmt = data.get('format', 'png').lower()
        quality = int(data.get('quality', 95))

        if fmt in ('jpg', 'jpeg'):
            params = [cv2.IMWRITE_JPEG_QUALITY, quality]
            _, buffer = cv2.imencode('.jpg', img, params)
            mime = 'jpeg'
        elif fmt == 'bmp':
            _, buffer = cv2.imencode('.bmp', img)
            mime = 'bmp'
        else:
            _, buffer = cv2.imencode('.png', img)
            mime = 'png'

        b64 = base64.b64encode(buffer).decode('utf-8')

        return jsonify({
            'file_b64': f'data:image/{mime};base64,{b64}',
            'size': len(buffer),
            'format': fmt,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Custom Compression Export ────────────────────────────────
@image_bp.route('/export_custom', methods=['POST'])
def export_custom():
    """Export an image using a specific compression algorithm + format.

    Request JSON:
        image_b64 : str   — base64 data-URI of the canvas (PNG)
        method    : str   — 'quantization' | 'huffman' | 'arithmetic' | 'lzw' | 'rle'
        format    : str   — 'jpeg' | 'png' | 'bmp' | 'bmp_rle' | 'gif' |
                            'tiff_huffman' | 'tiff_lzw' | 'tiff_rle' | 'custom'
        quality   : int   — 1–100 (used by quantization + JPEG)

    Response JSON:
        file_b64      : str  — base64-encoded file content (NO data-URI prefix for custom)
        size          : int  — compressed file size in bytes
        extension     : str  — e.g. '.jpg', '.tiff', '.huff'
        mime          : str  — MIME type
        original_size : int  — raw uncompressed pixel count (W × H × 3)
    """
    data = request.json
    if not data or 'image_b64' not in data:
        return jsonify({'error': 'No image data provided'}), 400

    try:
        img = decode_image(data['image_b64'])
        method = data.get('method', 'quantization')
        fmt = data.get('format', 'png')
        quality = int(data.get('quality', 75))

        h, w = img.shape[:2]
        original_size = w * h * 3

        # ── Quantization ─────────────────────────────────────
        if method == 'quantization':
            img = quantize_image(img, quality)

            if fmt in ('jpg', 'jpeg'):
                params = [cv2.IMWRITE_JPEG_QUALITY, quality]
                _, buf = cv2.imencode('.jpg', img, params)
                return _respond(buf, '.jpg', 'image/jpeg', original_size)
            elif fmt == 'bmp':
                _, buf = cv2.imencode('.bmp', img)
                return _respond(buf, '.bmp', 'image/bmp', original_size)
            else:  # png
                _, buf = cv2.imencode('.png', img)
                return _respond(buf, '.png', 'image/png', original_size)

        # ── TIFF outputs (Huffman / LZW / RLE) ──────────────
        if fmt.startswith('tiff'):
            pil_img = PILImage.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            buf = io.BytesIO()

            compression_map = {
                'tiff_huffman': 'tiff_adobe_deflate',  # Deflate = LZ77 + Huffman
                'tiff_lzw':     'tiff_lzw',
                'tiff_rle':     'packbits',
            }
            comp = compression_map.get(fmt, 'tiff_lzw')
            pil_img.save(buf, format='TIFF', compression=comp)
            return _respond(buf.getvalue(), '.tiff', 'image/tiff', original_size)

        # ── GIF output (LZW) ────────────────────────────────
        if fmt == 'gif':
            pil_img = PILImage.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            pil_img = pil_img.convert('P', palette=PILImage.ADAPTIVE, colors=256)
            buf = io.BytesIO()
            pil_img.save(buf, format='GIF')
            return _respond(buf.getvalue(), '.gif', 'image/gif', original_size)

        # ── BMP RLE8 output ──────────────────────────────────
        if fmt == 'bmp_rle':
            bmp_bytes = write_bmp_rle8(img)
            return _respond(bmp_bytes, '.bmp', 'image/bmp', original_size)

        # ── Custom binary formats ────────────────────────────
        if fmt == 'custom':
            raw_bytes = img.tobytes()
            header = build_header(method, w, h)

            if method == 'rle':
                compressed = rle_encode(raw_bytes)
            elif method == 'huffman':
                compressed = huffman_encode(raw_bytes)
            elif method == 'lzw':
                compressed = lzw_encode(raw_bytes)
            elif method == 'arithmetic':
                compressed = arithmetic_encode(raw_bytes)
            else:
                return jsonify({'error': f'Unknown method: {method}'}), 400

            final = header + compressed
            ext = EXT_MAP.get(method, '.bin')
            return _respond(final, ext, 'application/octet-stream', original_size)

        return jsonify({'error': f'Unknown format: {fmt}'}), 400

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def _respond(data, extension, mime, original_size):
    """Build a standardized JSON response for export_custom."""
    if isinstance(data, (bytes, bytearray)):
        b64 = base64.b64encode(data).decode('utf-8')
        size = len(data)
    elif hasattr(data, 'tobytes'):
        # numpy buffer from cv2.imencode
        raw = data.tobytes()
        b64 = base64.b64encode(raw).decode('utf-8')
        size = len(raw)
    else:
        b64 = base64.b64encode(bytes(data)).decode('utf-8')
        size = len(data)

    return jsonify({
        'file_b64': b64,
        'size': size,
        'extension': extension,
        'mime': mime,
        'original_size': original_size,
    })

