"""Solver de Sudoku con backtracking y comprobación de validez."""

ROWS = 9
COLS = 9


def is_valid_grid(grid):
    """Devuelve (es_valida, mensaje). Una rejilla vacía es válida."""
    if len(grid) != ROWS or any(len(row) != COLS for row in grid):
        return False, "La rejilla debe ser de 9x9"
    for r in range(ROWS):
        for c in range(COLS):
            value = grid[r][c]
            if value == 0:
                continue
            if not isinstance(value, int) or not 1 <= value <= 9:
                return False, f"Valor invalido en fila {r + 1}, columna {c + 1}: {value}"
            grid[r][c] = 0
            ok = _is_placement_valid(grid, r, c, value)
            grid[r][c] = value
            if not ok:
                return False, (
                    f"El {value} de la fila {r + 1}, columna {c + 1} esta repetido "
                    "en su fila, columna o bloque"
                )
    return True, ""


def solve(grid):
    """Resuelve in-place. Devuelve True si tiene solucion."""
    return _backtrack(grid, _first_empty(grid))


def _first_empty(grid):
    for r in range(ROWS):
        for c in range(COLS):
            if grid[r][c] == 0:
                return r, c
    return None


def _is_placement_valid(grid, row, col, value):
    for c in range(COLS):
        if grid[row][c] == value:
            return False
    for r in range(ROWS):
        if grid[r][col] == value:
            return False
    br, bc = (row // 3) * 3, (col // 3) * 3
    for r in range(br, br + 3):
        for c in range(bc, bc + 3):
            if grid[r][c] == value:
                return False
    return True


def _backtrack(grid, cell):
    if cell is None:
        return True
    r, c = cell
    for value in range(1, 10):
        if _is_placement_valid(grid, r, c, value):
            grid[r][c] = value
            if _backtrack(grid, _first_empty(grid)):
                return True
            grid[r][c] = 0
    return False
