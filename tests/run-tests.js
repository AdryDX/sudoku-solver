"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const solverPath = path.join(__dirname, "..", "solver.js");
const pipelinePath = path.join(__dirname, "..", "pipeline.js");
const { solve, isValidGrid } = require(solverPath);
const pipeline = require(pipelinePath);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("solve resuelve un sudoku conocido", () => {
  const puzzle = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ];
  const grid = puzzle.map(r => r.slice());
  assert.strictEqual(solve(grid), true);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (puzzle[r][c]) assert.strictEqual(grid[r][c], puzzle[r][c]);
  assert.strictEqual(isValidGrid(grid).ok, true);
});

test("solve detecta rapido un conflicto inmediato", () => {
  const solution = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ];
  const grid = solution.map(r => r.slice());
  grid[0][8] = 0;
  grid[0][7] = 0;
  assert.strictEqual(solve(grid), true);
  assert.deepStrictEqual(grid, solution);
});

test("solveBoard vacio se resuelve", () => {
  const grid = Array.from({ length: 9 }, () => new Array(9).fill(0));
  assert.strictEqual(solve(grid), true);
});

test("isValidGrid rechaza duplicados en fila/columna/bloque y valores fuera de rango", () => {
  const dup = Array.from({ length: 9 }, () => new Array(9).fill(0));
  dup[0][0] = dup[0][8] = 5;
  assert.strictEqual(isValidGrid(dup).ok, false);
  const dupCol = Array.from({ length: 9 }, () => new Array(9).fill(0));
  dupCol[0][0] = dupCol[8][0] = 4;
  assert.strictEqual(isValidGrid(dupCol).ok, false);
  const dupBlock = Array.from({ length: 9 }, () => new Array(9).fill(0));
  dupBlock[0][0] = dupBlock[1][1] = 9;
  assert.strictEqual(isValidGrid(dupBlock).ok, false);
  assert.strictEqual(isValidGrid([[0]]).ok, false);
  const bad = Array.from({ length: 9 }, () => new Array(9).fill(0));
  bad[3][3] = 12;
  assert.strictEqual(isValidGrid(bad).ok, false);
  assert.strictEqual(isValidGrid(Array.from({ length: 9 }, () => new Array(9).fill(0))).ok, true);
});



function invert3(m) {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
  const det = a * A + d * B + g * C;
  return [
    A / det, B / det, C / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
}

const EASY_CLUES = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
];

const PATTERNS = {
  1: [[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  2: [[1,1,1],[0,0,1],[1,1,1],[1,0,0],[1,1,1]],
  3: [[1,1,1],[0,0,1],[1,1,1],[0,0,1],[1,1,1]],
  4: [[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
  5: [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  6: [[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
  7: [[1,1,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1]],
  8: [[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
  9: [[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
};

const BASE_BOARD = buildSyntheticBoard(EASY_CLUES, 540);
const boardBin = BASE_BOARD.bin;

function buildSyntheticBoard(puzzle, size) {
  const bin = new Uint8Array(size * size);
  const cell = size / 9;
  const line = (x0, y0, x1, y1, thickness) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (let dy = 0; dy < thickness; dy++)
          for (let dx = 0; dx < thickness; dx++)
            if (y + dy < size && x + dx < size) bin[(y + dy) * size + (x + dx)] = 1;
  };
  for (let i = 0; i <= 9; i++) {
    const t = i % 3 === 0 ? 4 : 2;
    const p = Math.min(i * cell, size - t);
    line(p, 0, p, size - 1, t);
    line(0, p, size - 1, p, t);
  }
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = puzzle[r][c];
      if (!value) continue;
      const pattern = PATTERNS[value];
      const digitH = pattern.length, digitW = pattern[0].length;
      const scale = Math.floor(cell * 0.5 / Math.max(digitH, digitW)) || 1;
      const offX = c * cell + (cell - digitW * scale) / 2;
      const offY = r * cell + (cell - digitH * scale) / 2;
      for (let i = 0; i < digitH; i++)
        for (let j = 0; j < digitW; j++)
          if (pattern[i][j])
            line(Math.round(offX + j * scale), Math.round(offY + i * scale), Math.round(offX + j * scale), Math.round(offY + (i + 1) * scale - 1), scale);
    }
  }
  return { bin, size };
}

test("pipeline: localiza rejilla, celdas y pistas en una imagen sintetica", () => {
  const puzzle = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ];
  const size = 540;
  const { bin } = buildSyntheticBoard(puzzle, size);
  const w = size, h = size;
  const box = pipeline.findGridBox(bin, w, h);
  const width = box.x1 - box.x0, height = box.y1 - box.y0;
  assert.ok(width >= 0.9 * (size - 5) && width <= size, `anchura rejilla ${width}`);
  assert.ok(height >= 0.9 * (size - 5) && height <= size, `altura rejilla ${height}`);

  const boundaries = pipeline.findBandBoundaries(bin, w, h, box);
  assert.strictEqual(boundaries.xs.length, 10);
  assert.strictEqual(boundaries.ys.length, 10);
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(boundaries.xs[i] - i * 60) <= 6, `linea vertical ${i}: ${boundaries.xs[i]}`);
    assert.ok(Math.abs(boundaries.ys[i] - i * 60) <= 6, `linea horizontal ${i}: ${boundaries.ys[i]}`);
  }

  const cells = pipeline.extractCells(bin, w, h, boundaries);
  assert.strictEqual(cells.length, 81);
  let filled = 0;
  for (let i = 0; i < 81; i++) {
    const r = i / 9 | 0, c = i % 9;
    if (puzzle[r][c]) { filled++; assert.ok(!cells[i].empty, `celda (${r},${c}) deberia tener digito`); }
    else assert.ok(cells[i].empty, `celda (${r},${c}) deberia estar vacia`);
  }
  assert.strictEqual(filled, 30);
});

test("pipeline: detecta rejilla descentrada", () => {
  const puzzle = Array.from({ length: 9 }, () => new Array(9).fill(0));
  puzzle[0][0] = 1;
  const size = 540, offset = 60;
  const { bin } = buildSyntheticBoard(puzzle, size - offset);
  const w = size - offset, h = size - offset;
  const padded = new Uint8Array(size * size);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      padded[(y + offset / 2) * size + (x + offset / 2)] = bin[y * w + x];
  const box = pipeline.findGridBox(padded, size, size);
  assert.ok(Math.abs(((box.x0 + box.x1) / 2) - size / 2) < size * 0.06, "rejilla centrada horizontal");
  assert.ok(Math.abs(((box.y0 + box.y1) / 2) - size / 2) < size * 0.06, "rejilla centrada vertical");
});


test("pipeline: lineas espurias por columna densa no deforman las fronteras", () => {
  const size = 540, cell = size / 9;
  const bin = new Uint8Array(size * size);
  const line = (x0, y0, x1, y1) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        bin[y * size + x] = 1;
  };
  for (let i = 0; i <= 9; i++) {
    const p = Math.min(i * cell, size - 2);
    line(p, 0, p, size - 1);
    line(0, p, size - 1, p);
  }
  for (let r = 0; r < 9; r++) {
    const x0 = 4 * cell + 22, x1 = 4 * cell + 38;
    const y0 = r * cell + 18, y1 = r * cell + 44;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        bin[y * size + x] = 1;
  }
  const pipeline = require(pipelinePath);
  const box = pipeline.findGridBox(bin, size, size);
  const b = pipeline.findBandBoundaries(bin, size, size, box);
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(b.xs[i] - i * 60) <= 6, `xs[${i}] = ${b.xs[i]}, esperado ~${i * 60}`);
    assert.ok(Math.abs(b.ys[i] - i * 60) <= 6, `ys[${i}] = ${b.ys[i]}, esperado ~${i * 60}`);
  }
});


test("pipeline: RANSAC ignora grupos espurios y ancla a las lineas reales", () => {
  const size = 540, cell = size / 9;
  const bin = new Uint8Array(size * size);
  const line = (x0, y0, x1, y1) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        bin[y * size + x] = 1;
  };
  for (let i = 0; i <= 9; i++) {
    const p = Math.min(i * cell, size - 2);
    line(p, 0, p, size - 1);
    line(0, p, size - 1, p);
  }
  for (let r = 0; r < 9; r++) {
    const x0 = 4 * cell + 22, x1 = 4 * cell + 38;
    const y0 = r * cell + 18, y1 = r * cell + 44;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        bin[y * size + x] = 1;
  }
  const pipeline = require(pipelinePath);
  const box = pipeline.findGridBox(bin, size, size);
  const b = pipeline.findBandBoundaries(bin, size, size, box);
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(b.xs[i] - i * 60) <= 6, `xs[${i}] = ${b.xs[i]}`);
    assert.ok(Math.abs(b.ys[i] - i * 60) <= 6, `ys[${i}] = ${b.ys[i]}`);
  }
});

test("pipeline: tema oscuro (tinte invertido) se autocorrige", () => {
  const size = 540;
  const base = buildSyntheticBoard(EASY_CLUES, size);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = base.bin[i] ? 0 : 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const pipeline = require(pipelinePath);
  const { bin, w: tw, h: th } = pipeline.imageToBinary({ width: size, height: size, data });
  const box = pipeline.findGridBox(bin, tw, th);
  const b = pipeline.findBandBoundaries(bin, tw, th, box);
  assert.ok(Math.abs(b.xs[5] - 5 * 60) <= 8, `xs[5] = ${b.xs[5]}`);
  assert.ok(Math.abs(b.ys[5] - 5 * 60) <= 8, `ys[5] = ${b.ys[5]}`);
});


test("pipeline: warp por homografia endereza un quad inclinado", () => {
  const S = 450;
  const pipeline = require(pipelinePath);
  const quad = [[12, 8], [437, 34], [405, 452], [30, 428]];
  const H = pipeline.quadToH(quad, S);
  const Hinv = invert3(H);
  const W = 500, HGT = 500;
  const data = new Uint8ClampedArray(W * HGT * 4);
  for (let y = 0; y < HGT; y++) {
    for (let x = 0; x < W; x++) {
      const w = Hinv[6] * x + Hinv[7] * y + Hinv[8];
      const bx = Math.floor((Hinv[0] * x + Hinv[1] * y + Hinv[2]) / w * (540 / S));
      const by = Math.floor((Hinv[3] * x + Hinv[4] * y + Hinv[5]) / w * (540 / S));
      const p = (y * W + x) * 4;
      const g = (bx >= 0 && by >= 0 && bx < 540 && by < 540 && boardBin[by * 540 + bx]) ? 0 : 255;
      data[p] = data[p + 1] = data[p + 2] = g;
      data[p + 3] = 255;
    }
  }
  const warped = pipeline.warpQuad({ width: W, height: HGT, data }, quad);
  assert.strictEqual(warped.w, S);
  const boundaries = pipeline.evenBoundaries(S);
  const cells = pipeline.extractCells(warped.bin, warped.w, warped.h, boundaries);
  for (let i = 0; i < 81; i++) {
    const r = i / 9 | 0, c = i % 9;
    const filled = !cells[i].empty;
    const expected = !!EASY_CLUES[r][c];
    assert.strictEqual(filled, expected, `celda (${r},${c}): ${filled} != ${expected}`);
  }
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failures++;
      console.error(`FAIL  ${name}\n      ${err.message}`);
    }
  }
  console.log(`\n${tests.length - failures}/${tests.length} tests OK`);
  if (failures) process.exit(1);
}

run();
