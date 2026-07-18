"""Download YOLOv4-tiny model files for Photon AI Recognition.
Run: python download_model.py
"""
import urllib.request
import os
import sys

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

FILES = {
    'yolov4-tiny.weights': 'https://github.com/AlexeyAB/darknet/releases/download/darknet_yolo_v4_pre/yolov4-tiny.weights',
    'yolov4-tiny.cfg': 'https://raw.githubusercontent.com/AlexeyAB/darknet/master/cfg/yolov4-tiny.cfg',
    'coco.names': 'https://raw.githubusercontent.com/pjreddie/darknet/master/data/coco.names',
}


def download(name, url):
    path = os.path.join(MODEL_DIR, name)
    if os.path.exists(path):
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f'  [OK] {name} already exists ({size_mb:.1f} MB)')
        return True

    print(f'  Downloading {name} ...')
    try:
        urllib.request.urlretrieve(url, path)
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f'  [OK] {name} downloaded ({size_mb:.1f} MB)')
        return True
    except Exception as e:
        print(f'  [FAIL] {name}: {e}')
        return False


if __name__ == '__main__':
    print('Photon — YOLOv4-tiny Model Downloader\n')
    all_ok = True
    for name, url in FILES.items():
        if not download(name, url):
            all_ok = False

    if all_ok:
        print('\nAll model files ready!')
    else:
        print('\nSome downloads failed. Check your internet connection.')
        sys.exit(1)
