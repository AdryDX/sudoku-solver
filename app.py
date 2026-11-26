"""API web: extrae el sudoku de una imagen, lo resuelve y sirve la interfaz."""

from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator

from sudoku.solver import is_valid_grid, solve
from sudoku.vision import VisionError, extract_grid

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Sudoku Solver", version="1.0.0")


class GridRequest(BaseModel):
    grid: list[list[int]]

    @field_validator("grid")
    @classmethod
    def check_grid(cls, value):
        if len(value) != 9 or any(len(row) != 9 for row in value):
            raise ValueError("La rejilla debe ser de 9x9")
        if any(not isinstance(cell, int) for row in value for cell in row):
            raise ValueError("Todas las celdas deben ser enteros")
        return value


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/extract")
async def api_extract(file: UploadFile = File(...)):
    image = _decode_image(await file.read())
    try:
        grid, uncertain = extract_grid(image)
    except VisionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"grid": grid, "uncertain": [list(cell) for cell in uncertain]}


@app.post("/api/solve")
def api_solve(request: GridRequest):
    valid, message = is_valid_grid(request.grid)
    if not valid:
        raise HTTPException(status_code=422, detail=message)
    grid = [row[:] for row in request.grid]
    if not solve(grid):
        raise HTTPException(
            status_code=422,
            detail="El sudoku no tiene solucion: revisa los digitos detectados",
        )
    return {"grid": grid}


def _decode_image(payload):
    array = np.frombuffer(payload, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=422, detail="No es una imagen valida")
    return image
