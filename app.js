"use strict";

const N = 9;
const $ = id => document.getElementById(id);

let grid, uncertain, imageFile;

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
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  preview.onload = () => { $("extractBtn").disabled = false; };
}

function setProgress(p) {
  $("progress").style.width = `${Math.round(p * 100)}%`;
}

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", 1, {
      logger: m => { if (m.status === "recognizing text") setProgress(0.25 + 0.7 * m.progress); }
    }).then(async w => {
      await w.setParameters({
        tessedit_char_whitelist: "123456789",
        tessedit_pageseg_mode: "10",
      });
      return w;
    });
  }
  return workerPromise;
}

async function extract() {
  $("extractBtn").disabled = true;
  const status = $("status");
  status.textContent = "Analizando imagen...";
  status.className = "ok";
  try {
    const bitmap = await createImageBitmap(imageFile);
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { bin, w, h } = imageToBinary(
      canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
    );
    const box = findGridBox(bin, w, h);
    const boundaries = findBandBoundaries(bin, w, h, box);
    const cells = extractCells(bin, w, h, boundaries);
    const worker = await getWorker();
    for (let i = 0; i < cells.length; i++) {
      const r = i / N | 0, c = i % N;
      const patch = cells[i];
      if (patch.empty || !patch.width || !patch.height) {
        setProgress(0.1 + 0.8 * (i / cells.length));
        continue;
      }
      setProgress(0.1 + 0.8 * (i / cells.length));
      const digitCanvas = renderDigitCanvas(patch, 64);
      const { data } = await worker.recognize(digitCanvas);
      const text = (data.text || "").replace(/\D/g, "");
      if (text.length === 1 && text >= "1" && text <= "9") {
        grid[r][c] = +text;
        if ((data.confidence ?? 100) < 55) uncertain.add(r + "," + c);
      } else {
        uncertain.add(r + "," + c);
      }
    }
    paint();
    $("solveBtn").disabled = false;
    const count = grid.flat().filter(v => v).length;
    const warn = uncertain.size ? ` — ${uncertain.size} dudosas marcadas, revisa antes de resolver` : "";
    status.textContent = `Detectadas ${count} pistas${warn}`;
    status.className = "ok";
  } catch (err) {
    status.textContent = err.message || String(err);
    status.className = "error";
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
