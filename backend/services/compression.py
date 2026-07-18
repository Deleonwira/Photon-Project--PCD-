"""PHOTON — Custom Compression Algorithms

From-scratch implementations of image compression methods:
  - RLE (Run-Length Encoding)
  - Huffman Coding
  - LZW (Lempel-Ziv-Welch)
  - Arithmetic Coding
  - Uniform Quantization
  - BMP RLE8 binary writer
"""

import struct
import json
import heapq
import numpy as np
from decimal import Decimal, getcontext
from PIL import Image


# ═══════════════════════════════════════════════════════════════
# ── Constants ─────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════

PHOTON_MAGIC = b'PHOTON__'

METHOD_IDS = {
    'rle':        b'RLE_',
    'huffman':    b'HUFF',
    'lzw':        b'LZW_',
    'arithmetic': b'ARIT',
}

EXT_MAP = {
    'rle':        '.rle',
    'huffman':    '.huff',
    'lzw':        '.lzw',
    'arithmetic': '.arith',
}


# ═══════════════════════════════════════════════════════════════
# ── PHOTON Custom File Header (16 bytes) ─────────────────────
# ═══════════════════════════════════════════════════════════════

def build_header(method, width, height):
    """Build a 16-byte header for PHOTON custom compressed files.

    Layout:
      [8 bytes]  PHOTON__ magic
      [4 bytes]  method identifier (RLE_, HUFF, LZW_, ARIT)
      [2 bytes]  image width  (big-endian unsigned short)
      [2 bytes]  image height (big-endian unsigned short)
    """
    header = bytearray()
    header += PHOTON_MAGIC
    header += METHOD_IDS.get(method, b'UNKN')
    header += struct.pack('>HH', width, height)
    return bytes(header)


# ═══════════════════════════════════════════════════════════════
# ── Quantization (Lossy) ─────────────────────────────────────
# ═══════════════════════════════════════════════════════════════

def quantize_image(img_bgr, quality):
    """Uniform quantization — reduces the number of distinct color levels.

    Args:
        img_bgr: NumPy BGR image array (H×W×3, uint8).
        quality: 1–100. Higher = more levels preserved.
                 100 → 256 levels (no change).
                 1   → 2 levels (extreme posterization).

    Returns:
        Quantized NumPy BGR image array (same shape, uint8).
    """
    levels = max(2, min(256, quality * 256 // 100))
    step = max(1, 256 // levels)
    quantized = (img_bgr // step) * step + step // 2
    return np.clip(quantized, 0, 255).astype(np.uint8)


# ═══════════════════════════════════════════════════════════════
# ── RLE (Run-Length Encoding) ────────────────────────────────
# ═══════════════════════════════════════════════════════════════

def rle_encode(data):
    """Run-Length Encoding on a flat byte sequence.

    Encodes consecutive identical bytes as (count, value) pairs.
    Runs longer than 255 are split into multiple pairs.

    Args:
        data: bytes or bytearray.

    Returns:
        bytes — encoded data as [count, value, count, value, ...].
    """
    if not data:
        return b''

    result = bytearray()
    i = 0
    n = len(data)

    while i < n:
        val = data[i]
        count = 1
        while i + count < n and data[i + count] == val and count < 255:
            count += 1
        result.append(count)
        result.append(val)
        i += count

    return bytes(result)


# ═══════════════════════════════════════════════════════════════
# ── Huffman Coding ───────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════

class _HuffmanNode:
    """Internal node for building the Huffman binary tree."""
    __slots__ = ('byte_val', 'freq', 'left', 'right')

    def __init__(self, byte_val=None, freq=0, left=None, right=None):
        self.byte_val = byte_val
        self.freq = freq
        self.left = left
        self.right = right

    def __lt__(self, other):
        return self.freq < other.freq


def huffman_encode(data):
    """Huffman coding on a flat byte sequence.

    Output binary format:
      [4 bytes]  original data length (big-endian uint32)
      [4 bytes]  code-table JSON length (big-endian uint32)
      [1 byte]   padding bits added to last byte of bitstream
      [N bytes]  code-table JSON  { "byte_val": "bit_code", ... }
      [M bytes]  encoded bitstream

    Args:
        data: bytes or bytearray.

    Returns:
        bytes — the encoded Huffman payload.
    """
    if not data:
        return b''

    # ── Build frequency table ────────────────────────────────
    freq = {}
    for b in data:
        freq[b] = freq.get(b, 0) + 1

    # ── Edge case: single unique value ───────────────────────
    if len(freq) == 1:
        byte_val = list(freq.keys())[0]
        code_table = {byte_val: '0'}
    else:
        # Build min-heap
        heap = [_HuffmanNode(byte_val=k, freq=v) for k, v in freq.items()]
        heapq.heapify(heap)

        while len(heap) > 1:
            left = heapq.heappop(heap)
            right = heapq.heappop(heap)
            merged = _HuffmanNode(
                freq=left.freq + right.freq,
                left=left,
                right=right,
            )
            heapq.heappush(heap, merged)

        # Walk tree to generate prefix codes
        code_table = {}

        def _walk(node, code=''):
            if node.byte_val is not None:
                code_table[node.byte_val] = code or '0'
                return
            if node.left:
                _walk(node.left, code + '0')
            if node.right:
                _walk(node.right, code + '1')

        _walk(heap[0])

    # ── Encode data to bitstream ─────────────────────────────
    bits = ''.join(code_table[b] for b in data)

    # Pad to byte boundary
    pad_len = (8 - len(bits) % 8) % 8
    bits += '0' * pad_len

    # Convert bitstring to byte array
    bitstream = bytearray()
    for i in range(0, len(bits), 8):
        bitstream.append(int(bits[i:i + 8], 2))

    # ── Serialize code table ─────────────────────────────────
    table_json = json.dumps(
        {str(k): v for k, v in code_table.items()},
        separators=(',', ':'),
    ).encode('utf-8')

    # ── Pack result ──────────────────────────────────────────
    result = bytearray()
    result += struct.pack('>I', len(data))          # original length
    result += struct.pack('>I', len(table_json))    # table length
    result += struct.pack('B', pad_len)             # padding bits
    result += table_json
    result += bitstream

    return bytes(result)


# ═══════════════════════════════════════════════════════════════
# ── LZW (Lempel-Ziv-Welch) ──────────────────────────────────
# ═══════════════════════════════════════════════════════════════

def lzw_encode(data):
    """LZW compression on a flat byte sequence.

    Uses 12-bit codes (max dictionary 4096 entries).
    Emits a CLEAR code (256) at start and when dictionary fills.
    Emits an EOI code (257) at end.

    Output binary format:
      [4 bytes]  original data length (big-endian uint32)
      [N bytes]  packed 12-bit code stream (little-endian byte packing)

    Args:
        data: bytes or bytearray.

    Returns:
        bytes — the encoded LZW payload.
    """
    if not data:
        return b''

    CLEAR_CODE = 256
    EOI_CODE = 257
    MAX_DICT = 4096  # 12-bit

    # Initialize dictionary with single-byte entries
    dictionary = {bytes([i]): i for i in range(256)}
    dict_size = 258  # 0-255 + CLEAR + EOI

    codes = [CLEAR_CODE]
    w = bytes()

    for byte_val in data:
        wc = w + bytes([byte_val])
        if wc in dictionary:
            w = wc
        else:
            codes.append(dictionary[w])
            if dict_size < MAX_DICT:
                dictionary[wc] = dict_size
                dict_size += 1
            else:
                # Dictionary full → reset
                codes.append(CLEAR_CODE)
                dictionary = {bytes([i]): i for i in range(256)}
                dict_size = 258
            w = bytes([byte_val])

    # Flush remaining
    if w:
        codes.append(dictionary[w])
    codes.append(EOI_CODE)

    # ── Pack codes as 12-bit values (little-endian) ──────────
    packed = bytearray()
    buffer = 0
    bits_in_buffer = 0

    for code in codes:
        buffer |= (code << bits_in_buffer)
        bits_in_buffer += 12
        while bits_in_buffer >= 8:
            packed.append(buffer & 0xFF)
            buffer >>= 8
            bits_in_buffer -= 8

    if bits_in_buffer > 0:
        packed.append(buffer & 0xFF)

    # ── Pack result ──────────────────────────────────────────
    return struct.pack('>I', len(data)) + bytes(packed)


# ═══════════════════════════════════════════════════════════════
# ── Arithmetic Coding ────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════

def arithmetic_encode(data):
    """Arithmetic coding on a flat byte sequence.

    Processes data in fixed-size chunks to avoid precision overflow.
    Each chunk is encoded as a high-precision decimal fraction.

    Output binary format:
      [4 bytes]  original data length
      [4 bytes]  frequency-table JSON length
      [N bytes]  frequency-table JSON  { "byte_val": count, ... }
      [4 bytes]  number of chunks
      [4 bytes]  chunk size used
      Per chunk:
        [4 bytes]  chunk original byte length
        [4 bytes]  encoded-string byte length
        [M bytes]  encoded decimal fraction as UTF-8 string

    Args:
        data: bytes or bytearray.

    Returns:
        bytes — the encoded Arithmetic payload.
    """
    if not data:
        return b''

    getcontext().prec = 50

    CHUNK_SIZE = 4096

    # ── Build global frequency table ─────────────────────────
    freq = {}
    for b in data:
        freq[b] = freq.get(b, 0) + 1
    total = len(data)

    # ── Build cumulative probability intervals ───────────────
    sorted_symbols = sorted(freq.keys())
    cum_freq = {}
    cumulative = Decimal(0)
    for sym in sorted_symbols:
        low = cumulative
        high = cumulative + Decimal(freq[sym]) / Decimal(total)
        cum_freq[sym] = (low, high)
        cumulative = high

    # ── Encode each chunk independently ──────────────────────
    chunks = [data[i:i + CHUNK_SIZE] for i in range(0, len(data), CHUNK_SIZE)]
    encoded_chunks = []

    for chunk in chunks:
        low = Decimal(0)
        high = Decimal(1)

        for byte_val in chunk:
            rng = high - low
            sym_low, sym_high = cum_freq[byte_val]
            new_high = low + rng * sym_high
            new_low = low + rng * sym_low
            high = new_high
            low = new_low

        # Take midpoint and convert to string
        midpoint = (low + high) / 2
        encoded_chunks.append(str(midpoint).encode('utf-8'))

    # ── Serialize frequency table ────────────────────────────
    freq_json = json.dumps(
        {str(k): v for k, v in freq.items()},
        separators=(',', ':'),
    ).encode('utf-8')

    # ── Pack result ──────────────────────────────────────────
    result = bytearray()
    result += struct.pack('>I', len(data))
    result += struct.pack('>I', len(freq_json))
    result += freq_json
    result += struct.pack('>I', len(encoded_chunks))
    result += struct.pack('>I', CHUNK_SIZE)

    for i, enc in enumerate(encoded_chunks):
        chunk_len = len(chunks[i])
        result += struct.pack('>I', chunk_len)
        result += struct.pack('>I', len(enc))
        result += enc

    return bytes(result)


# ═══════════════════════════════════════════════════════════════
# ── BMP RLE8 Binary Writer ───────────────────────────────────
# ═══════════════════════════════════════════════════════════════

def write_bmp_rle8(img_bgr):
    """Write a valid BMP file with RLE8 compression.

    Since Pillow cannot *write* RLE-compressed BMPs, this function
    manually constructs the BMP binary:
      - 14-byte BITMAPFILEHEADER
      - 40-byte BITMAPINFOHEADER (biCompression = BI_RLE8 = 1)
      - 1024-byte color palette (256 × BGRA)
      - RLE8-encoded pixel data

    The image is palette-quantized to 256 colors using Pillow,
    then each row is RLE-encoded bottom-to-top (BMP convention).

    Args:
        img_bgr: NumPy BGR image array (H×W×3, uint8).

    Returns:
        bytes — a complete, valid BMP file.
    """
    # ── Convert BGR → RGB → PIL palette image ────────────────
    img_rgb = img_bgr[:, :, ::-1].copy()
    pil_img = Image.fromarray(img_rgb, 'RGB')
    pil_img = pil_img.convert('P', palette=Image.ADAPTIVE, colors=256)

    width, height = pil_img.size
    palette_raw = pil_img.getpalette()  # flat list: [R,G,B, R,G,B, ...]
    pixels = list(pil_img.getdata())    # flat list of palette indices

    # ── Build rows bottom-to-top (BMP convention) ────────────
    rows = []
    for y in range(height - 1, -1, -1):
        row_start = y * width
        rows.append(pixels[row_start:row_start + width])

    # ── RLE8 encode each row ─────────────────────────────────
    rle_data = bytearray()
    for row in rows:
        i = 0
        while i < len(row):
            val = row[i]
            count = 1
            while i + count < len(row) and row[i + count] == val and count < 255:
                count += 1
            rle_data.append(count)
            rle_data.append(val)
            i += count
        # End-of-line marker
        rle_data.append(0)
        rle_data.append(0)

    # End-of-bitmap marker
    rle_data.append(0)
    rle_data.append(1)

    # ── Build BGRA palette (256 entries × 4 bytes) ───────────
    bmp_palette = bytearray()
    for i in range(256):
        idx = i * 3
        if idx + 2 < len(palette_raw):
            r, g, b = palette_raw[idx], palette_raw[idx + 1], palette_raw[idx + 2]
        else:
            r, g, b = 0, 0, 0
        bmp_palette += bytes([b, g, r, 0])  # BMP stores as BGRA

    # ── BITMAPFILEHEADER (14 bytes) ──────────────────────────
    palette_size = 256 * 4  # 1024
    data_offset = 14 + 40 + palette_size
    file_size = data_offset + len(rle_data)

    file_header = bytearray()
    file_header += b'BM'                            # Signature
    file_header += struct.pack('<I', file_size)      # Total file size
    file_header += struct.pack('<HH', 0, 0)          # Reserved
    file_header += struct.pack('<I', data_offset)    # Offset to pixel data

    # ── BITMAPINFOHEADER (40 bytes) ──────────────────────────
    info_header = bytearray()
    info_header += struct.pack('<I', 40)             # Header size
    info_header += struct.pack('<i', width)           # Width
    info_header += struct.pack('<i', height)          # Height (positive = bottom-up)
    info_header += struct.pack('<HH', 1, 8)           # Planes=1, BitsPerPixel=8
    info_header += struct.pack('<I', 1)              # Compression = BI_RLE8
    info_header += struct.pack('<I', len(rle_data))  # Image data size
    info_header += struct.pack('<ii', 2835, 2835)    # 72 DPI (pixels/meter)
    info_header += struct.pack('<II', 256, 0)         # Colors used, important

    return bytes(file_header + info_header + bmp_palette + rle_data)
