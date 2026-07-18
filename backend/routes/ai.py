"""PHOTON — AI Routes"""

from flask import Blueprint, request, jsonify
import cv2
import numpy as np
import os
from routes.image import decode_image, encode_image

ai_bp = Blueprint('ai', __name__)

# ── Model paths ──────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
WEIGHTS = os.path.join(MODEL_DIR, 'yolov4-tiny.weights')
CFG = os.path.join(MODEL_DIR, 'yolov4-tiny.cfg')
NAMES = os.path.join(MODEL_DIR, 'coco.names')

# ── Lazy-loaded model ────────────────────────────────────────
_net = None
_classes = None
_output_layers = None

# ── Target category mapping (COCO 80 classes grouped) ────────
TARGET_MAP = {
    'all':          None,  # All 80 classes
    'people':       ['person'],
    'vehicles':     ['bicycle', 'car', 'motorbike', 'aeroplane', 'bus', 'train', 'truck', 'boat'],
    'animals':      ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
                     'elephant', 'bear', 'zebra', 'giraffe'],
    'food':         ['banana', 'apple', 'sandwich', 'orange', 'broccoli',
                     'carrot', 'hot dog', 'pizza', 'donut', 'cake'],
    'furniture':    ['chair', 'sofa', 'bed', 'diningtable', 'pottedplant'],
    'electronics':  ['tvmonitor', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone'],
    'kitchen':      ['bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon',
                     'bowl', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator'],
    'accessories':  ['backpack', 'umbrella', 'handbag', 'tie', 'suitcase'],
    # Legacy aliases (BOE-205: old frontend may still send these)
    'general':      None,
    'human':        ['person'],
    'animal':       ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
                     'elephant', 'bear', 'zebra', 'giraffe'],
}

# ── Per-class colors (generated from HSV for visual variety) ──
def _generate_colors(n):
    """Generate N visually distinct colors using HSV."""
    colors = []
    for i in range(n):
        hue = int(i * 180 / n)
        color = cv2.cvtColor(np.uint8([[[hue, 200, 255]]]), cv2.COLOR_HSV2BGR)[0][0]
        colors.append(tuple(int(c) for c in color))
    return colors

_CLASS_COLORS = None


def get_model():
    global _net, _classes, _output_layers, _CLASS_COLORS
    if _net is None:
        if not os.path.exists(WEIGHTS):
            raise FileNotFoundError(
                f'YOLOv4-tiny weights not found at {WEIGHTS}. '
                'Run: python backend/models/download_model.py')
        if not os.path.exists(CFG):
            raise FileNotFoundError(
                f'YOLOv4-tiny config not found at {CFG}. '
                'Run: python backend/models/download_model.py')
        _classes = open(NAMES).read().strip().split('\n')
        _net = cv2.dnn.readNet(WEIGHTS, CFG)
        layer_names = _net.getLayerNames()
        _output_layers = [layer_names[i - 1] for i in _net.getUnconnectedOutLayers()]
        _CLASS_COLORS = _generate_colors(len(_classes))
    return _net, _classes, _output_layers


@ai_bp.route('/recognize', methods=['POST'])
def recognize():
    data = request.json
    img = decode_image(data['image_b64'])
    target = data.get('target', 'all')
    conf_threshold = float(data.get('confidence', 0.4))

    try:
        detections = run_detection(img, target, conf_threshold)
        return jsonify({'detections': detections})
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_bp.route('/annotate', methods=['POST'])
def annotate():
    data = request.json
    img = decode_image(data['image_b64'])
    target = data.get('target', 'all')
    conf_threshold = float(data.get('confidence', 0.4))

    try:
        detections = run_detection(img, target, conf_threshold)
        annotated = draw_boxes(img.copy(), detections)
        return jsonify({
            'image_b64': encode_image(annotated),
            'detections': detections,
        })
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def run_detection(img, target, conf_threshold):
    net, classes, output_layers = get_model()
    h, w = img.shape[:2]

    # Prepare blob (416×416 standard YOLO input)
    blob = cv2.dnn.blobFromImage(img, 1 / 255.0, (416, 416), swapRB=True, crop=False)
    net.setInput(blob)
    outs = net.forward(output_layers)

    # Parse detections
    boxes, confidences, class_ids = [], [], []
    target_classes = TARGET_MAP.get(target)

    for out in outs:
        for detection in out:
            scores = detection[5:]
            class_id = int(np.argmax(scores))
            confidence = float(scores[class_id])

            if confidence < conf_threshold:
                continue

            label = classes[class_id]
            if target_classes and label not in target_classes:
                continue

            cx = int(detection[0] * w)
            cy = int(detection[1] * h)
            bw = int(detection[2] * w)
            bh = int(detection[3] * h)
            x = int(cx - bw / 2)
            y = int(cy - bh / 2)

            boxes.append([x, y, bw, bh])
            confidences.append(confidence)
            class_ids.append(class_id)

    # Non-max suppression (0.4 NMS threshold)
    indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_threshold, 0.4)

    results = []
    if len(indices) > 0:
        for i in indices.flatten():
            results.append({
                'label': classes[class_ids[i]],
                'confidence': round(confidences[i] * 100, 1),
                'class_id': class_ids[i],
                'bbox': {
                    'x': boxes[i][0], 'y': boxes[i][1],
                    'w': boxes[i][2], 'h': boxes[i][3],
                },
            })

    return results


def draw_boxes(img, detections):
    """Draw bounding boxes + labels on image with per-class colors."""
    h, w = img.shape[:2]
    # Dynamic line thickness based on image size (BOE-213)
    thickness = max(2, min(4, int(max(h, w) / 500)))
    font_scale = max(0.4, min(0.8, max(h, w) / 1500))
    font = cv2.FONT_HERSHEY_SIMPLEX

    for det in detections:
        b = det['bbox']
        label = det['label']
        conf = det['confidence']
        cid = det.get('class_id', 0)
        color = _CLASS_COLORS[cid % len(_CLASS_COLORS)] if _CLASS_COLORS else (0, 255, 0)

        # Draw bounding box
        x1, y1 = max(0, b['x']), max(0, b['y'])
        x2, y2 = min(w, b['x'] + b['w']), min(h, b['y'] + b['h'])
        cv2.rectangle(img, (x1, y1), (x2, y2), color, thickness)

        # Label text
        text = f"{label} {conf}%"
        (tw, th_text), baseline = cv2.getTextSize(text, font, font_scale, 1)
        pad = 4

        # Label position — above box, clamped to image bounds (BOE-212)
        label_y = max(th_text + pad * 2, y1)
        label_x = max(0, x1)

        # Background rectangle for label
        cv2.rectangle(img,
                      (label_x, label_y - th_text - pad * 2),
                      (label_x + tw + pad * 2, label_y),
                      color, -1)

        # Label text (black on colored background)
        cv2.putText(img, text,
                    (label_x + pad, label_y - pad),
                    font, font_scale, (0, 0, 0), max(1, thickness // 2))

    return img
