"use strict";

const $ = id => document.getElementById(id);

let grid, uncertain, imageFile;
let sourceCanvas, sourceData, quad, autoLines;

window.addEventListener("error", e => {
  const status = $("status");
  if (!status) return;
  status.textContent = `Error: ${e.message}`;
  status.className = "error";
});

document.addEventListener("DOMContentLoaded", () => {
  grid = Array.from({ length: N }, () => new Array(N).fill(0));
  uncertain = new Set();

  const gridEl = $("grid");
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const input = document.createElement("input");
      input.className = "cell";
      input.type = "text";
      input.inputMode = "numeric";
      input.maxLength = 1;
      input.dataset.row = r;
      input.dataset.col = c;
      input.addEventListener("input", () => {
        const v = input.value.replace(/[^1-9]/g, "");
        input.value = v;
        grid[r][c] = v ? +v : 0;
        uncertain.delete(r + "," + c);
        paint();
      });
      gridEl.appendChild(input);
    }
  }

  const dz = $("dropzone");
  $("file").addEventListener("change", e => {
    e.target.files[0] && setImage(e.target.files[0]);
    e.target.value = "";
  });
  $("extractBtn").addEventListener("click", extract);
  $("solveBtn").addEventListener("click", solveSudoku);
  $("clearBtn").addEventListener("click", resetAll);

  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.add("drag");
  }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.remove("drag");
  }));
  dz.addEventListener("drop", e => e.dataTransfer.files[0] && setImage(e.dataTransfer.files[0]));
  window.addEventListener("paste", e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/"));
    if (item) setImage(item.getAsFile());
  });

  setupOverlay();
  setTimeout(() => getWorker().catch(() => {}), 400);
});

function resetAll() {
  grid = Array.from({ length: N }, () => new Array(N).fill(0));
  uncertain.clear();
  $("solveBtn").disabled = true;
  $("solveStatus").textContent = "";
  paint();
}

function paint() {
  const cells = $("grid").children;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const el = cells[r * N + c];
      el.value = grid[r][c] || "";
      el.classList.toggle("solved", el.dataset.solved === "1");
      el.classList.toggle("given", !!grid[r][c] && el.dataset.solved !== "1");
      el.classList.toggle("uncertain", uncertain.has(r + "," + c) && !grid[r][c]);
    }
  }
}

function setImage(file) {
  imageFile = file;
  const preview = $("preview");
  preview.onload = async () => {
    document.querySelector(".preview-wrap").classList.add("shown");
    $("hint").style.display = "block";
    $("extractBtn").disabled = true;
    try {
      await prepareSource();
    } catch (err) {
      showStatus(err.message || String(err), "error");
    }
    $("extractBtn").disabled = false;
  };
  preview.src = URL.createObjectURL(file);
}

function showStatus(text, cls) {
  const status = $("status");
  status.textContent = text;
  status.className = cls || "";
}

function setProgress(p) {
  $("progress").style.width = `${Math.round(p * 100)}%`;
}

async function prepareSource() {
  const img = $("preview");
  const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
  sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = Math.round(img.naturalWidth * scale);
  sourceCanvas.height = Math.round(img.naturalHeight * scale);
  sourceCanvas.getContext("2d").drawImage(img, 0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceData = sourceCanvas.getContext("2d").getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  let det = null;
  try {
    det = detectGridQuad(sourceData);
  } catch (err) {
    det = null;
  }
  if (!det) {
    try {
      const { bin } = imageToBinary(sourceData);
      const box = findGridBox(bin, sourceCanvas.width, sourceCanvas.height);
      det = { quad: [[box.x0, box.y0], [box.x1 + 1, box.y0], [box.x1 + 1, box.y1 + 1], [box.x0, box.y1 + 1]] };
    } catch (err) {
      det = null;
    }
  }
  const W = sourceCanvas.width, H = sourceCanvas.height;
  quad = det
    ? det.quad
    : [[0, 0], [W, 0], [W, H], [0, H]];
  autoLines = det && det.lines ? det.lines : null;
  renderOverlay();
  showStatus(det ? "Rejilla detectada: ajusta el # si no calza y pulsa Leer" : "Coloca las esquinas rojas sobre el sudoku y pulsa Leer", "ok");
}

function setupOverlay() {
  const svg = $("overlay");
  const g = $("gridLines");
  const NS = "http://www.w3.org/2000/svg";
  for (let i = 0; i < N; i++) {
    for (const orient of ["v", "h"]) {
      const line = document.createElementNS(NS, "line");
      line.dataset.i = i;
      line.dataset.orient = orient;
      g.appendChild(line);
    }
  }
  const EDGE_PAIRS = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const EDGE_CURSORS = ["ns-resize", "ew-resize", "ns-resize", "ew-resize"];
  const drag = { active: false, kind: null, idx: -1, startX: 0, startY: 0, orig: null };

  const toSource = e => {
    const rect = svg.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (sourceCanvas.width / rect.width),
      (e.clientY - rect.top) * (sourceCanvas.height / rect.height),
    ];
  };
  const clampPoint = p => [
    Math.max(0, Math.min(sourceCanvas.width, p[0])),
    Math.max(0, Math.min(sourceCanvas.height, p[1])),
  ];

  const makeHandle = (kind, idx) => {
    const handle = document.createElementNS(NS, "circle");
    handle.dataset.kind = kind;
    handle.dataset.idx = idx;
    handle.setAttribute("r", kind === "corner" ? 12 : 9);
    handle.classList.add("handle");
    if (kind === "edge") handle.classList.add("edge");
    handle.style.cursor = kind === "corner" ? "grab" : EDGE_CURSORS[idx];
    handle.addEventListener("pointerdown", e => {
      drag.active = true;
      drag.kind = kind;
      drag.idx = idx;
      [drag.startX, drag.startY] = toSource(e);
      drag.orig = quad.map(p => p.slice());
      autoLines = null;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", e => {
      if (!drag.active || drag.kind !== kind || drag.idx !== idx) return;
      const [x, y] = toSource(e);
      const dx = x - drag.startX, dy = y - drag.startY;
      if (kind === "corner") {
        quad[idx] = clampPoint([drag.orig[idx][0] + dx, drag.orig[idx][1] + dy]);
      } else {
        const [a, b] = EDGE_PAIRS[idx];
        quad[a] = clampPoint([drag.orig[a][0] + dx, drag.orig[a][1] + dy]);
        quad[b] = clampPoint([drag.orig[b][0] + dx, drag.orig[b][1] + dy]);
      }
      renderOverlay();
    });
    const release = e => {
      if (drag.active && drag.kind === kind && drag.idx === idx) drag.active = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
    g.appendChild(handle);
  };

  for (let i = 0; i < 4; i++) makeHandle("corner", i);
  for (let i = 0; i < 4; i++) makeHandle("edge", i);
}

function renderOverlay() {
  if (!quad || !sourceCanvas) return;
  const svg = $("overlay");
  svg.setAttribute("viewBox", `0 0 ${sourceCanvas.width} ${sourceCanvas.height}`);
  const [tl, tr, br, bl] = quad;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const lines = $("gridLines").querySelectorAll("line");
  lines.forEach(line => {
    const i = +line.dataset.i;
    const real = autoLines && autoLines[line.dataset.orient] && autoLines[line.dataset.orient][i];
    if (real) {
      line.setAttribute("x1", real[0]); line.setAttribute("y1", real[1]);
      line.setAttribute("x2", real[2]); line.setAttribute("y2", real[3]);
      return;
    }
    const t = i / (N - 1);
    if (line.dataset.orient === "v") {
      const top = lerp(tl, tr, t), bottom = lerp(bl, br, t);
      line.setAttribute("x1", top[0]); line.setAttribute("y1", top[1]);
      line.setAttribute("x2", bottom[0]); line.setAttribute("y2", bottom[1]);
    } else {
      const left = lerp(tl, bl, t), right = lerp(tr, br, t);
      line.setAttribute("x1", left[0]); line.setAttribute("y1", left[1]);
      line.setAttribute("x2", right[0]); line.setAttribute("y2", right[1]);
    }
  });
  const handles = $("gridLines").querySelectorAll("circle");
  const corners = [tl, tr, br, bl];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const mids = [mid(tl, tr), mid(tr, br), mid(br, bl), mid(bl, tl)];
  handles.forEach(h => {
    const pos = h.dataset.kind === "corner" ? corners[+h.dataset.idx] : mids[+h.dataset.idx];
    h.setAttribute("cx", pos[0]);
    h.setAttribute("cy", pos[1]);
  });
}

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", 1, {})
      .then(async w => {
        await w.setParameters({
          tessedit_char_whitelist: "123456789",
          tessedit_pageseg_mode: "7",
        });
        return w;
      });
  }
  return workerPromise;
}

const TILE = 64, GAP = 28, PITCH = TILE + GAP;

function buildRowStrip(patches, row) {
  const canvas = document.createElement("canvas");
  canvas.width = 9 * TILE + 10 * GAP;
  canvas.height = TILE + 20;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let c = 0; c < N; c++) {
    const patch = patches[row * N + c];
    if (patch.empty || !patch.width || !patch.height) continue;
    ctx.drawImage(renderDigitCanvas(patch, TILE), GAP + c * PITCH, 10);
  }
  return canvas;
}

function collectWords(data) {
  const out = [];
  (data.blocks || []).forEach(b =>
    (b.paragraphs || []).forEach(p =>
      (p.lines || []).forEach(l => (l.words || []).forEach(w => out.push(w)))));
  return out;
}

function placeWords(words, row) {
  for (const wd of words) {
    const text = (wd.text || "").replace(/\D/g, "");
    if (!text || !wd.bbox) continue;
    const conf = wd.confidence ?? 0;
    for (let i = 0; i < text.length; i++) {
      const cx = wd.bbox.x0 + (wd.bbox.x1 - wd.bbox.x0) * (i + 0.5) / text.length;
      const c = Math.max(0, Math.min(N - 1, Math.floor(cx / PITCH)));
      grid[row][c] = +text[i];
      if (conf < 55) uncertain.add(row + "," + c);
    }
  }
}

async function ocrRow(worker, cells, row) {
  await worker.setParameters({ tessedit_pageseg_mode: "7" });
  const { data } = await worker.recognize(buildRowStrip(cells, row), {}, { blocks: true });
  placeWords(collectWords(data), row);
  await worker.setParameters({ tessedit_pageseg_mode: "10" });
  for (let c = 0; c < N; c++) {
    if (grid[row][c]) continue;
    const patch = cells[row * N + c];
    if (patch.empty || !patch.width || !patch.height) continue;
    const { data: single } = await worker.recognize(renderDigitCanvas(patch, TILE));
    const text = (single.text || "").replace(/\D/g, "");
    if (text) {
      grid[row][c] = +text[text.length - 1];
      if ((single.confidence ?? 0) < 55) uncertain.add(row + "," + c);
    } else {
      uncertain.add(row + "," + c);
    }
  }
  await worker.setParameters({ tessedit_pageseg_mode: "7" });
}

async function extract() {
  if (!sourceData || !quad) return;
  $("extractBtn").disabled = true;
  showStatus("Analizando imagen...", "ok");
  for (let r = 0; r < N; r++) grid[r].fill(0);
  uncertain.clear();
  const cellsEls = $("grid").children;
  for (let i = 0; i < cellsEls.length; i++) cellsEls[i].dataset.solved = "";
  paint();
  try {
    const warped = warpQuad(sourceData, quad);
    let boundaries = null;
    try { boundaries = detectBoundaries(warped.bin, warped.w, warped.h); } catch (err) { boundaries = null; }
    if (!boundaries) boundaries = evenBoundaries(warped.w);
    const cells = extractCells(warped.bin, warped.w, warped.h, boundaries);
    const worker = await getWorker();
    for (let r = 0; r < N; r++) {
      setProgress(0.1 + 0.82 * (r / N));
      await ocrRow(worker, cells, r);
    }
    paint();
    $("solveBtn").disabled = false;
    const count = grid.flat().filter(v => v).length;
    const warn = uncertain.size ? ` — ${uncertain.size} dudosas marcadas, revisa antes de resolver` : "";
    showStatus(`Detectadas ${count} pistas${warn}. Puedes corregir celdas o reajustar el #.`, "ok");
  } catch (err) {
    showStatus(err.message || String(err), "error");
  } finally {
    setProgress(0);
    $("extractBtn").disabled = false;
  }
}

function solveSudoku() {
  const { ok, message } = isValidGrid(grid);
  if (!ok) return showSolve(message, "error");
  const copy = grid.map(row => row.slice());
  if (!solve(copy)) {
    return showSolve("El sudoku no tiene solucion: revisa los digitos detectados", "error");
  }
  const cells = $("grid").children;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!grid[r][c]) cells[r * N + c].dataset.solved = "1";
    }
  }
  for (let r = 0; r < N; r++) grid[r] = copy[r];
  paint();
  showSolve("Resuelto ✔", "ok");
}

function showSolve(text, cls) {
  $("solveStatus").textContent = text;
  $("solveStatus").className = cls;
}
