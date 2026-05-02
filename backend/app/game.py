from __future__ import annotations

import json
import random
from collections import deque
from dataclasses import dataclass


Position = tuple[int, int]


@dataclass(frozen=True)
class Puzzle:
    size: int
    regions: list[list[int]]
    solution: list[Position]
    seed: str


def queens_touch(a: Position, b: Position) -> bool:
    return abs(a[0] - b[0]) <= 1 and abs(a[1] - b[1]) <= 1


def validate_solution(size: int, regions: list[list[int]], queens: list[Position]) -> tuple[bool, str]:
    if len(queens) != size:
        return False, f"Potrzeba dokładnie {size} hetmanek."

    seen_rows: set[int] = set()
    seen_cols: set[int] = set()
    seen_regions: set[int] = set()
    normalized: list[Position] = []

    for row, col in queens:
        if row < 0 or col < 0 or row >= size or col >= size:
            return False, "Jedna z hetmanek jest poza planszą."
        region = regions[row][col]
        if row in seen_rows:
            return False, "Dwie hetmanki są w tym samym wierszu."
        if col in seen_cols:
            return False, "Dwie hetmanki są w tej samej kolumnie."
        if region in seen_regions:
            return False, "Dwie hetmanki są w tym samym regionie."
        seen_rows.add(row)
        seen_cols.add(col)
        seen_regions.add(region)
        normalized.append((row, col))

    for index, first in enumerate(normalized):
        for second in normalized[index + 1 :]:
            if queens_touch(first, second):
                return False, "Hetmanki nie mogą się stykać, także po skosie."

    return True, "OK"


def solve_count(size: int, regions: list[list[int]], limit: int = 2) -> int:
    return len(solve_solutions(size, regions, limit))


def solve_solutions(size: int, regions: list[list[int]], limit: int = 2) -> list[list[Position]]:
    by_row = [
        sorted(range(size), key=lambda col: _region_cell_count(regions, row, col))
        for row in range(size)
    ]
    solutions: list[list[Position]] = []
    used_cols: set[int] = set()
    used_regions: set[int] = set()
    placed: list[Position] = []

    def backtrack(row: int) -> None:
        if len(solutions) >= limit:
            return
        if row == size:
            solutions.append(placed.copy())
            return
        for col in by_row[row]:
            region = regions[row][col]
            if col in used_cols or region in used_regions:
                continue
            current = (row, col)
            if any(queens_touch(current, queen) for queen in placed):
                continue
            used_cols.add(col)
            used_regions.add(region)
            placed.append(current)
            backtrack(row + 1)
            placed.pop()
            used_regions.remove(region)
            used_cols.remove(col)

    backtrack(0)
    return solutions


def generate_puzzle(seed: str, size: int = 7, require_unique: bool = True) -> Puzzle:
    rng = random.Random(seed)
    for attempt in range(1, 750):
        regions = _build_random_regions(size, rng)
        if not _all_regions_present(size, regions):
            continue
        solutions = solve_solutions(size, regions, 2 if require_unique else 1)
        if require_unique and len(solutions) != 1:
            continue
        if not solutions:
            continue
        return Puzzle(size=size, regions=regions, solution=solutions[0], seed=f"{seed}-{attempt}")
    raise RuntimeError("Nie udało się wygenerować jednoznacznej planszy Queens.")


def puzzle_to_json(puzzle: Puzzle) -> tuple[str, str]:
    return json.dumps(puzzle.regions), json.dumps(puzzle.solution)


def puzzle_from_rows(row: dict) -> Puzzle:
    return Puzzle(
        size=int(row["size"]),
        regions=json.loads(row["regions_json"]),
        solution=[tuple(item) for item in json.loads(row["solution_json"])],
        seed=str(row["seed"]),
    )


def public_puzzle(row: dict) -> dict:
    puzzle = puzzle_from_rows(row)
    return {
        "id": int(row["id"]),
        "size": puzzle.size,
        "regions": puzzle.regions,
        "seed": puzzle.seed,
    }


def _build_random_regions(size: int, rng: random.Random) -> list[list[int]]:
    regions = [[-1 for _ in range(size)] for _ in range(size)]
    cells = [(row, col) for row in range(size) for col in range(size)]
    rng.shuffle(cells)
    queue: deque[Position] = deque(cells[:size])
    for region_id, (row, col) in enumerate(queue):
        regions[row][col] = region_id

    while queue:
        row, col = queue.popleft()
        neighbors = [(row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)]
        rng.shuffle(neighbors)
        for n_row, n_col in neighbors:
            if 0 <= n_row < size and 0 <= n_col < size and regions[n_row][n_col] == -1:
                regions[n_row][n_col] = regions[row][col]
                queue.append((n_row, n_col))
    return regions


def _all_regions_present(size: int, regions: list[list[int]]) -> bool:
    return set(cell for row in regions for cell in row) == set(range(size))


def _region_cell_count(regions: list[list[int]], row: int, col: int) -> int:
    region = regions[row][col]
    return sum(1 for line in regions for cell in line if cell == region)
