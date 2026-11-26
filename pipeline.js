"use strict";

const N = 9;

function imageToBinary(imageData) {
  const { width, height, data } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  const threshold = otsuThreshold(gray);
  const bin = new Uint8Array(width * height);
  for (let i = 0; i < bin.length; i++) bin[i] = gray[i] < threshold ? 1 : 0;
  return { bin, w: width, h: height };
}

function otsuThreshold(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

function findGridBox(bin, w, h) {
  const rowInk = new Float64Array(h), colInk = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = 0; x < w; x++) acc += bin[y * w + x];
    rowInk[y] = acc;
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y < h; y++) acc += bin[y * w + x];
    colInk[x] = acc;
  }
  const yBand = longestDenseBand(rowInk, denseMin(w));
  const xBand = longestDenseBand(colInk, denseMin(h));
  if (!yBand || !xBand) {
    throw new Error("No se localiza la rejilla del sudoku en la imagen");
  }
  return { x0: xBand[0], y0: yBand[0], x1: xBand[1], y1: yBand[1] };
}

function denseMin(axisLength) {
  return Math.max(3, Math.round(0.008 * axisLength));
}

function longestDenseBand(values, minimum) {
  let best = null, start = -1;
  const len = values.length;
  for (let i = 0; i <= len; i++) {
    const dense = i < len && values[i] >= minimum;
    if (dense && start < 0) start = i;
    if (!dense && start >= 0) {
      const end = i - 1;
      if (!best || end - start > best[1] - best[0]) best = [start, end];
      start = -1;
    }
  }
  return best;
}

function interpolate10(lines, lo, hi) {
  return resolveBoundaries(lines, lo, hi);
}

function groupLinesFor(values, lo, hi, crossLen) {
  const min = 0.45 * crossLen;
  const groups = [];
  let start = -1;
  for (let p = lo; p <= hi; p++) {
    const on = values[p] >= min;
    if (on && start < 0) start = p;
    if (!on && start >= 0) {
      groups.push(Math.round((start + p - 1) / 2));
      start = -1;
    }
  }
  if (start >= 0) groups.push(Math.round((start + hi) / 2));
  return groups;
}

function interpolate10(lines, lo, hi) {
  if (lines && lines.length === 10) return lines;
  if (lines && lines.length >= 2 && lines.length < 10) {
    const a = lines[0], b = lines[lines.length - 1];
    const step = (b - a) / 9;
    return Array.from({ length: 10 }, (_, i) => Math.round(a + step * i));
  }
  const span = hi - lo;
  return Array.from({ length: 10 }, (_, i) => Math.round(lo + (span * i) / 9));
}

function findBandBoundaries(bin, w, h, box) {
  const rowSums = new Float64Array(h), colSums = new Float64Array(w);
  for (let y = box.y0; y <= box.y1; y++) {
    let acc = 0;
    for (let x = box.x0; x <= box.x1; x++) acc += bin[y * w + x];
    rowSums[y] = acc;
  }
  for (let x = box.x0; x <= box.x1; x++) {
    let acc = 0;
    for (let y = box.y0; y <= box.y1; y++) acc += bin[y * w + x];
    colSums[x] = acc;
  }
  const vLines = groupLinesFor(colSums, box.x0, box.x1, box.y1 - box.y0 + 1);
  const hLines = groupLinesFor(rowSums, box.y0, box.y1, box.x1 - box.x0 + 1);
  return {
    xs: resolveBoundaries(vLines, box.x0, box.x1),
    ys: resolveBoundaries(hLines, box.y0, box.y1),
  };
}

function isUniform(lines) {
  if (lines.length < 3) return false;
  const diffs = [];
  for (let i = 1; i < lines.length; i++) diffs.push(lines[i] - lines[i - 1]);
  const sorted = diffs.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return false;
  return diffs.every(d => Math.abs(d - median) <= 0.35 * median);
}

function resolveBoundaries(lines, lo, hi) {
  if (lines && lines.length === 10 && isUniform(lines)) return lines;
  const span = hi - lo;
  return Array.from({ length: 10 }, (_, i) => Math.round(lo + (span * i) / 9));
}

const MIN_INK_RATIO = 0.02;

function cellRect(boundaries, r, c) {
  const padX = (boundaries.xs[c + 1] - boundaries.xs[c]) * 0.14;
  const padY = (boundaries.ys[r + 1] - boundaries.ys[r]) * 0.14;
  return {
    x0: boundaries.xs[c] + Math.round(padX),
    x1: boundaries.xs[c + 1] - Math.round(padX),
    y0: boundaries.ys[r] + Math.round(padY),
    y1: boundaries.ys[r + 1] - Math.round(padY),
  };
}

function extractCells(bin, w, h, boundaries) {
  const cells = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const rect = cellRect(boundaries, r, c);
      cells.push(cropRoi(bin, w, rect.x0, rect.y0, rect.x1, rect.y1));
    }
  }
  return cells;
}

function cropRoi(bin, w, x0, y0, x1, y1) {
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
  let ink = 0, minI = gh, maxI = -1, minJ = gw, maxJ = -1;
  for (let j = x0; j <= x1; j++) {
    for (let i = y0; i <= y1; i++) {
      if (!bin[i * w + j]) continue;
      ink++;
      const di = i - y0, dj = j - x0;
      if (di < minI) minI = di;
      if (di > maxI) maxI = di;
      if (dj < minJ) minJ = dj;
      if (dj > maxJ) maxJ = dj;
    }
  }
  const ratio = ink / (gw * gh);
  if (ratio < MIN_INK_RATIO || maxI < 0) return { empty: true, ratio };
  return {
    empty: false,
    ratio,
    x0: x0 + minJ,
    y0: y0 + minI,
    width: maxJ - minJ + 1,
    height: maxI - minI + 1,
    bin,
    srcW: w,
  };
}

function renderDigitCanvas(patch, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "black";
  const scale = Math.min((size * 0.7) / patch.width, (size * 0.7) / patch.height);
  const dw = patch.width * scale, dh = patch.height * scale;
  const offX = (size - dw) / 2, offY = (size - dh) / 2;
  for (let j = 0; j < patch.width; j++) {
    for (let i = 0; i < patch.height; i++) {
      if (!patch.bin[(patch.y0 + i) * patch.srcW + (patch.x0 + j)]) continue;
      ctx.fillRect(offX + j * scale, offY + i * scale, scale + 1, scale + 1);
    }
  }
  return canvas;
}

if (typeof module !== "undefined") {
  module.exports = {
    imageToBinary, otsuThreshold, findGridBox, findBandBoundaries,
    groupLinesFor, interpolate10, extractCells, cellRect, cropRoi,
    renderDigitCanvas, N,
  };
}
