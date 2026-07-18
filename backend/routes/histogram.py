"""PHOTON — Histogram Routes"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
import base64
import io

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from routes.image import decode_image

histogram_bp = Blueprint('histogram', __name__)


@histogram_bp.route('/compute', methods=['POST'])
def compute_histogram():
    data = request.json
    img = decode_image(data['image_b64'])

    if len(img.shape) == 3:
        b, g, r = cv2.split(img)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
        b = g = r = gray

    hist_r = cv2.calcHist([r], [0], None, [256], [0, 256]).flatten().tolist()
    hist_g = cv2.calcHist([g], [0], None, [256], [0, 256]).flatten().tolist()
    hist_b = cv2.calcHist([b], [0], None, [256], [0, 256]).flatten().tolist()
    hist_gray = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten().tolist()

    def ch_stats(ch):
        return {
            'mean': round(float(np.mean(ch)), 1),
            'std': round(float(np.std(ch)), 1),
            'min': int(np.min(ch)),
            'max': int(np.max(ch)),
        }

    return jsonify({
        'histograms': {'r': hist_r, 'g': hist_g, 'b': hist_b, 'gray': hist_gray},
        'stats': {
            'r': ch_stats(r), 'g': ch_stats(g),
            'b': ch_stats(b), 'gray': ch_stats(gray),
        },
    })


@histogram_bp.route('/render', methods=['POST'])
def render_histogram():
    data = request.json
    img = decode_image(data['image_b64'])
    channels = data.get('channels', ['r', 'g', 'b'])

    if len(img.shape) == 3:
        b, g, r = cv2.split(img)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
        b = g = r = gray

    fig, ax = plt.subplots(figsize=(4, 2.5), dpi=100)
    fig.patch.set_facecolor('#1a1a1e')
    ax.set_facecolor('#1a1a1e')

    channel_map = {
        'r': (r, '#ff4444'),
        'g': (g, '#44ff44'),
        'b': (b, '#4488ff'),
        'gray': (gray, '#cccccc'),
    }

    for ch_name in channels:
        if ch_name in channel_map:
            ch_data, color = channel_map[ch_name]
            hist = cv2.calcHist([ch_data], [0], None, [256], [0, 256])
            ax.plot(hist, color=color, linewidth=0.8, alpha=0.8)

    ax.set_xlim([0, 256])
    ax.tick_params(colors='#666666', labelsize=7)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color('#333333')
    ax.spines['left'].set_color('#333333')

    plt.tight_layout(pad=0.5)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    b64_png = base64.b64encode(buf.read()).decode('utf-8')

    return jsonify({'histogram_png': f'data:image/png;base64,{b64_png}'})
