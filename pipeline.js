"use strict";

const N = 9;

function imageToBinary(imageData) {
  const { width, height, data } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return grayscaleToBin(gray, width, height);
}

function grayscaleToBin(gray, width, height) {
  const threshold = otsuThreshold(gray);
  const bin = new Uint8Array(width * height);
  let ink = 0;
  for (let i = 0; i < bin.length; i++) {
    bin[i] = gray[i] <= threshold ? 1 : 0;
    ink += bin[i];
  }
  if (ink > bin.length * 0.5) {
    for (let i = 0; i < bin.length; i++) bin[i] ^= 1;
  }
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

const ROTATION_STEPS = [-12, -9, -6, -3, 3, 6, 9, 12];

function rotateBinary(bin, w, h, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const W2 = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin));
  const H2 = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos));
  const out = new Uint8Array(W2 * H2);
  const cx = w / 2, cy = h / 2, cx2 = W2 / 2, cy2 = H2 / 2;
  for (let y = 0; y < H2; y++) {
    for (let x = 0; x < W2; x++) {
      const dx = x - cx2, dy = y - cy2;
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx >= 0 && sy >= 0 && sx < w && sy < h && bin[sy * w + sx]) out[y * W2 + x] = 1;
    }
  }
  return {
    bin: out, w: W2, h: H2,
    map: ([x, y]) => {
      const dx = x - cx2, dy = y - cy2;
      return [cx + dx * cos + dy * sin, cy - dx * sin + dy * cos];
    },
  };
}

function horizontalLineMask(bin, w, h, minRun) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = 0;
    const row = y * w;
    for (let x = 0; x <= w; x++) {
      if (x < w && bin[row + x]) { run++; continue; }
      if (run >= minRun) for (let k = x - run; k < x; k++) mask[row + k] = 1;
      run = 0;
    }
  }
  return mask;
}

function verticalLineMask(bin, w, h, minRun) {
  const mask = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && bin[y * w + x]) { run++; continue; }
      if (run >= minRun) for (let k = y - run; k < y; k++) mask[k * w + x] = 1;
      run = 0;
    }
  }
  return mask;
}

function peakCenters(mask, w, h, axis, threshold) {
  const len = axis === "row" ? h : w;
  const ink = new Float64Array(len);
  if (axis === "row") {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = 0; x < w; x++) acc += mask[row + x];
      ink[y] = acc;
    }
  } else {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = 0; y < h; y++) acc += mask[y * w + x];
      ink[x] = acc;
    }
  }
  const centers = [];
  let start = -1, last = -1;
  for (let p = 0; p < len; p++) {
    if (ink[p] >= threshold) {
      if (start < 0) start = p;
      last = p;
    } else if (start >= 0 && p - last > 2) {
      centers.push(Math.round((start + last) / 2));
      start = -1;
    }
  }
  if (start >= 0) centers.push(Math.round((start + last) / 2));
  const ranked = centers.map(p => ({ p, ink: ink[p] })).sort((a, b) => b.ink - a.ink);
  return ranked.slice(0, 40).map(o => o.p).sort((a, b) => a - b);
}

function gridBoundariesFromLines(bin, w, h) {
  const minRun = Math.max(24, Math.round(0.08 * Math.max(w, h)));
  const hPeaks = peakCenters(horizontalLineMask(bin, w, h, minRun), w, h, "row", minRun * 1.2);
  const vPeaks = peakCenters(verticalLineMask(bin, w, h, minRun), w, h, "col", minRun * 1.2);
  if (vPeaks.length === 10 && hPeaks.length === 10) return { xs: vPeaks.slice(), ys: hPeaks.slice() };
  if (vPeaks.length < 4 || hPeaks.length < 4) return null;
  const xs = fitGridLines(vPeaks, vPeaks[0], vPeaks[vPeaks.length - 1]);
  const ys = fitGridLines(hPeaks, hPeaks[0], hPeaks[hPeaks.length - 1]);
  if (!xs || !ys || xs.length !== 10 || ys.length !== 10) return null;
  return { xs: snapToPeaks(xs, vPeaks), ys: snapToPeaks(ys, hPeaks) };
}

function snapToPeaks(positions, groups) {
  if (!groups || !groups.length || groups.length < 4) return positions;
  const snapped = positions.map(p => {
    let best = null, bestD = Infinity;
    for (const g of groups) {
      const d = Math.abs(g - p);
      if (d < bestD) { bestD = d; best = g; }
    }
    return bestD <= 6 ? best : Math.round(p);
  });
  for (let i = 1; i < snapped.length; i++) if (snapped[i] <= snapped[i - 1]) return positions;
  return snapped;
}

function lineSupport(bin, w, h, boundaries) {
  const { xs, ys } = boundaries;
  const width = xs[9] - xs[0], height = ys[9] - ys[0];
  if (width <= 0 || height <= 0) return false;
  let support = 0;
  for (const x of xs) {
    let acc = 0;
    for (let y = ys[0]; y <= ys[9]; y++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) acc += bin[y * w + xx];
    }
    if (acc >= height * 0.35) support++;
  }
  for (const y of ys) {
    let acc = 0;
    for (let x = xs[0]; x <= xs[9]; x++) {
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) acc += bin[yy * w + x];
    }
    if (acc >= width * 0.35) support++;
  }
  return support >= 15;
}

function detectBoundaries(bin, w, h) {
  const mask = gridBoundariesFromLines(bin, w, h);
  if (mask) return mask;
  return findBandBoundaries(bin, w, h, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 });
}

function plausibleGrid(bin, w, h, boundaries) {
  try {
    const cells = extractCells(bin, w, h, boundaries);
    let filled = 0;
    for (const cell of cells) if (!cell.empty) filled++;
    return filled >= 1 && filled <= 80;
  } catch (err) {
    return false;
  }
}

function detectGridQuad(imageData) {
  const { bin, w, h } = imageToBinary(imageData);
  const frames = [{ bin, w, h, map: p => p.slice() }];
  for (const deg of ROTATION_STEPS) frames.push(rotateBinary(bin, w, h, deg));
  for (const rot of frames) {
    const boundaries = gridBoundariesFromLines(rot.bin, rot.w, rot.h);
    if (!boundaries || !lineSupport(rot.bin, rot.w, rot.h, boundaries)) continue;
    if (!plausibleGrid(rot.bin, rot.w, rot.h, boundaries)) continue;
    const clamp = (v, hiV) => Math.min(hiV - 1, Math.max(0, Math.round(v)));
    const quad = [
      [boundaries.xs[0], boundaries.ys[0]],
      [boundaries.xs[9], boundaries.ys[0]],
      [boundaries.xs[9], boundaries.ys[9]],
      [boundaries.xs[0], boundaries.ys[9]],
    ].map(rot.map).map(([x, y]) => [clamp(x, w), clamp(y, h)]);
    const lines = {
      v: boundaries.xs.map(x => {
        const a = rot.map([x, boundaries.ys[0]]), b = rot.map([x, boundaries.ys[9]]);
        return [a[0], a[1], b[0], b[1]];
      }),
      h: boundaries.ys.map(y => {
        const a = rot.map([boundaries.xs[0], y]), b = rot.map([boundaries.xs[9], y]);
        return [a[0], a[1], b[0], b[1]];
      }),
    };
    return { quad, lines };
  }
  return null;
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
  if (lines && lines.length === 10) return lines.slice();
  const fit = fitGridLines(lines || [], lo, hi);
  if (fit) return fit;
  const span = hi - lo;
  return Array.from({ length: 10 }, (_, i) => Math.round(lo + (span * i) / 9));
}

function fitGridLines(groups, lo, hi) {
  if (groups.length < 4) return null;
  const span = hi - lo;
  let best = null;
  for (let i = 0; i < groups.length; i++) {
    for (let j = groups.length - 1; j > i; j--) {
      const wide = groups[j] - groups[i];
      if (wide < span * 0.5) break;
      for (let k = 4; k <= 12; k++) {
        const pitch = wide / k;
        if (pitch < span / 16 || pitch > span / 5) continue;
        let hits = 0;
        for (const g of groups) {
          const n = (g - groups[i]) / pitch;
          if (Math.abs(n - Math.round(n)) <= 3 / pitch) hits++;
        }
        if (!best || hits > best.hits || (hits === best.hits && pitch > best.pitch)) {
          best = { hits, origin: groups[i], pitch };
        }
      }
    }
  }
  if (!best || best.hits < 6) return null;
  const positions = [];
  for (let m = Math.floor((lo - best.origin) / best.pitch) - 1; ; m++) {
    const pos = best.origin + m * best.pitch;
    if (pos > hi + best.pitch * 0.3) break;
    if (pos >= lo - best.pitch * 0.3) positions.push(Math.round(pos));
    if (m > 40) break;
  }
  if (positions.length < 10) return null;
  let bestWindow = null, bestScore = -1;
  for (let s = 0; s + 9 < positions.length; s++) {
    const first = positions[s], last = positions[s + 9];
    const inside = Math.min(last, hi) - Math.max(first, lo);
    if (inside > bestScore) { bestScore = inside; bestWindow = positions.slice(s, s + 10); }
  }
  return bestWindow;
}

const MIN_INK_RATIO = 0.015;

function evenBoundaries(size) {
  const step = size / N;
  const xs = Array.from({ length: N + 1 }, (_, i) => Math.round(i * step));
  return { xs, ys: xs.slice() };
}

function quadToH(quad, S) {
  const corners = [[0, 0], [S, 0], [S, S], [0, S]];
  const A = [], bvec = [];
  for (let i = 0; i < 4; i++) {
    const [wx, wy] = corners[i];
    const [sx, sy] = quad[i];
    A.push([wx, wy, 1, 0, 0, 0, -wx * sx, -wy * sx]); bvec.push(sx);
    A.push([0, 0, 0, wx, wy, 1, -wx * sy, -wy * sy]); bvec.push(sy);
  }
  const h = solveLinear8(A, bvec);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solveLinear8(A, b) {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-12;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

function warpQuad(imageData, quad, S = 450) {
  const H = quadToH(quad, S);
  const { width, height, data } = imageData;
  const gray = new Uint8Array(S * S).fill(255);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const w = H[6] * x + H[7] * y + 1;
      const sx = Math.round((H[0] * x + H[1] * y + H[2]) / w);
      const sy = Math.round((H[3] * x + H[4] * y + H[5]) / w);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const p = (sy * width + sx) * 4;
      gray[y * S + x] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    }
  }
  return grayscaleToBin(gray, S, S);
}

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
    renderDigitCanvas, N, grayscaleToBin, evenBoundaries, quadToH, warpQuad,
    detectGridQuad, rotateBinary, detectBoundaries,
  };
}
