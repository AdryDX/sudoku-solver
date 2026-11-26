import pytest

from sudoku.solver import is_valid_grid, solve


EASY = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
]


def test_is_valid_grid_accepts_empty_and_known():
    assert is_valid_grid([[0] * 9 for _ in range(9)]) == (True, "")
    assert is_valid_grid([row[:] for row in EASY]) == (True, "")


def test_is_valid_grid_rejects_duplicate_row():
    grid = [[0] * 9 for _ in range(9)]
    grid[0][0] = grid[0][5] = 7
    ok, message = is_valid_grid(grid)
    assert not ok
    assert "repetido" in message


def test_is_valid_grid_rejects_duplicate_column():
    grid = [[0] * 9 for _ in range(9)]
    grid[0][0] = grid[8][0] = 4
    assert not is_valid_grid(grid)[0]


def test_is_valid_grid_rejects_duplicate_block():
    grid = [[0] * 9 for _ in range(9)]
    grid[0][0] = grid[1][1] = 9
    assert not is_valid_grid(grid)[0]


def test_solve_returns_complete_valid_solution():
    grid = [row[:] for row in EASY]
    assert solve(grid)
    assert all(0 not in row for row in grid)
    assert is_valid_grid(grid) == (True, "")


def test_solve_unsolvable_returns_false():
    grid = [row[:] for row in EASY]
    grid[0][2] = grid[1][2] = 3
    grid[1][3] = 1
    grid[0][3] = 2
    assert not solve(grid)


def test_solve_handles_empty_grid():
    grid = [[0] * 9 for _ in range(9)]
    assert solve(grid)
    assert is_valid_grid(grid) == (True, "")


@pytest.mark.parametrize("value", [0, 10, -1])
def test_is_valid_grid_rejects_out_of_range(value):
    grid = [[0] * 9 for _ in range(9)]
    grid[4][4] = value
    if value == 0:
        assert is_valid_grid(grid) == (True, "")
    else:
        assert not is_valid_grid(grid)[0]
