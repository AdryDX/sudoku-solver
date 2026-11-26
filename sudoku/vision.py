"""Extraccion de la rejilla de sudoku desde una imagen (captura o foto).

Pipeline: localizar el tablero -> corregir perspectiva -> separar 81 celdas
-> detectar la celda vacia vs. con digito -> OCR del digito.
"""

import cv2
import numpy as np
import pytesseract

BOARD_SIZE = 450
CELL_SIZE = BOARD_SIZE // 9
DIGIT_CONFIG = "--psm 10 --oem 3 -c tessedit_char_whitelist=123456789"
MIN_INK_RATIO = 0.006


class VisionError(Exception):
    """No se pudo leer un tablero de sudoku en la imagen."""


def extract_grid(image):
    """Devuelve (grid 9x9 con 0 en vacias, celdas dudosas como (fila, col))."""
    warp = _locate_and_warp(image)
    grid = [[0] * 9 for _ in range(9)]
    uncertain = []
    for row in range(9):
        for col in range(9):
            cy, cx = row * CELL_SIZE, col * CELL_SIZE
            cell = warp[cy:cy + CELL_SIZE, cx:cx + CELL_SIZE]
            digit_img = _digit_from_cell(cell)
            if digit_img is None:
                continue
            digit = _read_digit(digit_img)
            if digit is None:
                uncertain.append((row, col))
            else:
                grid[row][col] = digit
    return grid, uncertain


def _locate_and_warp(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 15
    )
    contours, _ = cv2.findContours(
        binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if contours:
        largest = max(contours, key=cv2.contourArea)
        if cv2.contourArea(largest) > 0.15 * image.shape[0] * image.shape[1]:
            quad = _largest_quad(largest)
            if quad is not None:
                return cv2.warpPerspective(
                    image, _perspective_matrix(quad), (BOARD_SIZE, BOARD_SIZE)
                )
    resized = cv2.resize(image, (BOARD_SIZE, BOARD_SIZE))
    return resized


def _largest_quad(contour):
    for eps in (0.02, 0.05, 0.08):
        approx = cv2.approxPolyDP(contour, eps * cv2.arcLength(contour, True), True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            return approx.reshape(4, 2).astype(np.float32)
    return None


def _perspective_matrix(quad):
    ordered = _order_points(quad)
    target = np.float32(
        [[0, 0], [BOARD_SIZE, 0], [BOARD_SIZE, BOARD_SIZE], [0, BOARD_SIZE]]
    )
    return cv2.getPerspectiveTransform(ordered, target)


def _order_points(points):
    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1).flatten()
    return np.float32(
        [
            points[np.argmin(sums)],
            points[np.argmin(diffs)],
            points[np.argmax(sums)],
            points[np.argmax(diffs)],
        ]
    )


def _digit_from_cell(cell):
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )
    binary = cv2.medianBlur(binary, 3)
    ink = np.count_nonzero(binary) / binary.size
    if ink < MIN_INK_RATIO:
        return None
    ys, xs = np.nonzero(binary)
    top, bottom = ys.min(), ys.max()
    left, right = xs.min(), xs.max()
    crop = binary[top:bottom + 1, left:right + 1]
    size = max(crop.shape)
    square = np.zeros((size, size), dtype=np.uint8)
    dy, dx = (size - crop.shape[0]) // 2, (size - crop.shape[1]) // 2
    square[dy:dy + crop.shape[0], dx:dx + crop.shape[1]] = crop
    return cv2.resize(square, (60, 60), interpolation=cv2.INTER_AREA)


def _read_digit(digit_img):
    text = pytesseract.image_to_string(
        digit_img, config=DIGIT_CONFIG, output_type=pytesseract.Output.STRING
    ).strip()
    if len(text) == 1 and text in "123456789":
        return int(text)
    return None
