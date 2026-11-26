# Sudoku Solver 🧩

App web que convierte una **captura de pantalla de un sudoku** en su matriz 9×9,
la resuelve y muestra la solución.

![Python](https://img.shields.io/badge/Python-3.12-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green)

## Cómo funciona

1. **Imagen** — Sube, arrastra o pega (Ctrl+V) una captura del sudoku.
2. **Visión** — OpenCV localiza el tablero (mayor cuadrilátero del umbral adaptativo),
   corrige la perspectiva a 450×450 px, separa las 81 celdas y hace OCR del dígito
   con Tesseract (`--psm 10`, whitelist `1-9`).
3. **Revisión** — La matriz se muestra editable; las celdas dudosas quedan marcadas
   en amarillo para corregir a mano.
4. **Solver** — Backtracking con validación de fila/columna/bloque. Devuelve la
   solución pintada en verde, o un error claro si el sudoku es inválido/sin solución.

## Ejecutar

### Con Docker (recomendado, incluye Tesseract)

```bash
docker build -t sudoku-solver .
docker run --rm -p 8000:8000 sudoku-solver
```

### Sin Docker

```bash
sudo apt install tesseract-ocr        # Debian/Ubuntu (binario requerido por pytesseract)
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Abre <http://localhost:8000>.

## API

| Método | Ruta          | Body                        | Respuesta                                        |
|--------|---------------|-----------------------------|--------------------------------------------------|
| GET    | `/`           | —                           | Interfaz web                                     |
| POST   | `/api/extract`| `multipart/form-data: file` | `{"grid": [[…]], "uncertain": [[r,c], …]}`       |
| POST   | `/api/solve`  | `{"grid": [[9x9 int]]}`     | `{"grid": [[solución]]}`                         |

Errores → `422` con `{"detail": "mensaje"}` (imagen no válida, sudoku repetido o sin solución).

## Tests

```bash
pip install -r requirements.txt pytest httpx
pytest -q
```

## Estructura

```
app.py            API FastAPI (extract / solve / estático)
sudoku/vision.py  OpenCV + Tesseract: imagen → matriz 9x9
sudoku/solver.py  Backtracking + validación de rejilla
static/index.html UI (drag & drop, paste, matriz editable)
tests/            tests de solver, API y visión (imagen sintética)
```
