import shutil

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

from app import app
from sudoku.vision import extract_grid

client = TestClient(app)

PUZZLE = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
]


def _font():
    for name, size in (("DejaVuSans-Bold.ttf", 34), ("Arial.ttf", 34)):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_sudoku(clues):
    image = Image.new("RGB", (540, 540), "white")
    draw = ImageDraw.Draw(image)
    for i in range(10):
        width = 4 if i % 3 == 0 else 1
        draw.line([(54 * i, 0), (54 * i, 540)], fill="black", width=width)
        draw.line([(0, 54 * i), (540, 54 * i)], fill="black", width=width)
    for r in range(9):
        for c in range(9):
            if clues[r][c]:
                draw.text(
                    (c * 54 + 34, r * 54 + 33),
                    str(clues[r][c]),
                    fill="black",
                    font=_font(),
                    anchor="mm",
                )
    return image


@pytest.fixture(scope="module")
def sudoku_png():
    buffer = __import__("io").BytesIO()
    render_sudoku(PUZZLE).save(buffer, format="PNG")
    return buffer.getvalue()



@pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract binary not available")
def test_extract_grid_reads_synthetic_image(sudoku_png):
    grid, uncertain = extract_grid(
        np.asarray(Image.open(__import__("io").BytesIO(sudoku_png)))[:, :, ::-1]
    )
    correct = sum(
        grid[r][c] == PUZZLE[r][c]
        for r in range(9)
        for c in range(9)
        if PUZZLE[r][c]
    ) / sum(1 for row in PUZZLE for cell in row if cell)
    assert correct >= 0.8, f"precision OCR solo {correct:.0%}, dudosas={uncertain}"


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract binary not available")
def test_api_extract_endpoint(sudoku_png):
    response = client.post(
        "/api/extract", files={"file": ("sudoku.png", sudoku_png, "image/png")}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["grid"]) == 9
    assert all(len(row) == 9 for row in data["grid"])
    assert isinstance(data["uncertain"], list)


def test_api_extract_rejects_non_image():
    response = client.post(
        "/api/extract", files={"file": ("x.png", b"no-image", "image/png")}
    )
    assert response.status_code == 422


def test_api_solve_endpoint():
    response = client.post("/api/solve", json={"grid": PUZZLE})
    assert response.status_code == 200
    grid = response.json()["grid"]
    assert all(0 not in row for row in grid)
    expected = [row[:] for row in PUZZLE]
    for r in range(9):
        for c in range(9):
            if PUZZLE[r][c]:
                assert grid[r][c] == PUZZLE[r][c]


def test_api_solve_rejects_invalid_grid():
    grid = [[0] * 9 for _ in range(9)]
    grid[0][0] = grid[0][8] = 5
    response = client.post("/api/solve", json={"grid": grid})
    assert response.status_code == 422


def test_api_solve_rejects_unsolvable():
    grid = [[0] * 9 for _ in range(9)]
    grid[0][0], grid[0][1] = 1, 1
    response = client.post("/api/solve", json={"grid": grid})
    assert response.status_code == 422


def test_index_serves_html():
    response = client.get("/")
    assert response.status_code == 200
    assert "Sudoku Solver" in response.text
