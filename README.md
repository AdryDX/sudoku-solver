# Sudoku Solver 🧩

App web que convierte una **captura de pantalla de un sudoku** en su matriz 9×9,
la resuelve y muestra la solución. Funciona **100% en el navegador** (sin backend),
lista para desplegarse en GitHub Pages.

## Cómo funciona

1. **Imagen** — Sube, arrastra o pega (Ctrl+V) una captura del sudoku.
2. **Visión (JS puro, `pipeline.js`)** — Escala la imagen, umbraliza con Otsu,
   localiza la rejilla por proyecciones de tinta, detecta las líneas de la
   cuadrícula y separa las 81 celdas (con margen anti-líneas).
3. **OCR (`tesseract.js`)** — Cada dígito se normaliza a un lienzo 64×64 y se lee
   con whitelist `1-9` (psm 10). Celdas con confianza baja quedan marcadas en amarillo.
4. **Matriz editable** — Puedes corregir cualquier celda a mano antes de resolver.
5. **Solver (`solver.js`)** — Backtracking con validación de fila/columna/bloque.
   Los datos que faltaban se pintan en verde.

## Uso online

Al publicarse en GitHub Pages estará en:
`https://adrydx.github.io/sudoku-solver/`

## Ejecutar en local

Cualquier servidor de archivos estáticos:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Modo servidor opcional (`server/`)

Variante FastAPI + OpenCV + Tesseract (Python) con los mismos pasos, útil si
quieres la extracción del lado servidor:

```bash
cd server
sudo apt install tesseract-ocr
pip install -r requirements.txt
uvicorn app:app --port 8000      # API en /api/extract y /api/solve
docker build -t sudoku-solver . && docker run -p 8000:8000 sudoku-solver
```

## Estructura

```
index.html / styles.css / app.js   Interfaz (drag & drop, paste, matriz editable)
pipeline.js                        Visión: Otsu, rejilla, líneas, celdas
solver.js                          Backtracking + validación
.github/workflows/pages.yml        Despliegue automático a GitHub Pages
server/                            Variante opcional FastAPI + OpenCV + Tesseract
```

## Tests (motor sin navegador)

```bash
node tests/run-tests.js
```
