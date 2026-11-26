"use strict";

function canPlace(grid, row, col, value) {
  for (let c = 0; c < 9; c++) if (grid[row][c] === value) return false;
  for (let r = 0; r < 9; r++) if (grid[r][col] === value) return false;
  const br = (row / 3 | 0) * 3, bc = (col / 3 | 0) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++)
      if (grid[r][c] === value) return false;
  return true;
}

function isValidGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== 9 ||
      grid.some(row => !Array.isArray(row) || row.length !== 9)) {
    return { ok: false, message: "La rejilla debe ser de 9x9" };
  }
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = grid[r][c];
      if (v === 0) continue;
      if (!Number.isInteger(v) || v < 1 || v > 9) {
        return { ok: false, message: `Valor invalido en fila ${r + 1}, columna ${c + 1}: ${v}` };
      }
      grid[r][c] = 0;
      const valid = canPlace(grid, r, c, v);
      grid[r][c] = v;
      if (!valid) {
        return { ok: false, message: `El ${v} de la fila ${r + 1}, columna ${c + 1} esta repetido en su fila, columna o bloque` };
      }
    }
  }
  return { ok: true, message: "" };
}

function solve(grid) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== 0) continue;
      for (let v = 1; v <= 9; v++) {
        if (!canPlace(grid, r, c, v)) continue;
        grid[r][c] = v;
        if (solve(grid)) return true;
        grid[r][c] = 0;
      }
      return false;
    }
  }
  return true;
}

if (typeof module !== "undefined") module.exports = { solve, isValidGrid, canPlace };
