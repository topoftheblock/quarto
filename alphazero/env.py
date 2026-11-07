"""Fast Quarto rules for self-play.

Pieces are ints 0-15 whose four bits are the traits (same order as game.ALL_PIECES).
A turn is one combined action: place the piece you were handed, then hand over a piece.
Action id = cell * 16 + piece_to_give.

The opening "pick a piece for your opponent" is skipped: every first pick is equivalent
under trait symmetries, so a state always starts with a piece already selected.
"""
import random

import numpy as np

from game import LINES

NUM_ACTIONS = 256
FULL = 0xFFFF
CELL_LINES = [[line for line in LINES if cell in line] for cell in range(16)]


class State:
    __slots__ = ("board", "selected", "available")

    def __init__(self, board, selected, available):
        self.board = board          # list of 16 ints, -1 = empty
        self.selected = selected    # piece the player to move must place
        self.available = available  # bitmask of pieces not yet on the board or in hand

    @staticmethod
    def initial(rng=random):
        selected = rng.randrange(16)
        return State([-1] * 16, selected, FULL & ~(1 << selected))

    def empty_cells(self):
        return [i for i, p in enumerate(self.board) if p < 0]

    def available_pieces(self):
        return [p for p in range(16) if self.available >> p & 1]

    def legal_actions(self):
        pieces = self.available_pieces()
        return [c * 16 + p for c in self.empty_cells() for p in pieces]


def wins(board, cell):
    """True if the piece just placed at `cell` completes a line sharing a trait."""
    for line in CELL_LINES[cell]:
        same_set = 15
        same_clear = 15
        for i in line:
            p = board[i]
            if p < 0:
                break
            same_set &= p
            same_clear &= ~p
        else:
            if same_set or same_clear & 15:
                return True
    return False


def step(state, action):
    """Apply an action. Returns (next_state, result).

    result is None while the game continues, otherwise the outcome for the player who
    just moved: 1 win, 0 draw, -1 loss. The final placement is forced, so it is
    resolved here instead of being a separate decision.
    """
    cell, give = divmod(action, 16)
    board = state.board.copy()
    board[cell] = state.selected
    if wins(board, cell):
        return None, 1
    available = state.available & ~(1 << give)
    if available == 0:
        last = board.index(-1)
        board[last] = give
        return None, -1 if wins(board, last) else 0
    return State(board, give, available), None


def winning_cells(state, piece=None):
    piece = state.selected if piece is None else piece
    cells = []
    for c in state.empty_cells():
        state.board[c] = piece
        if wins(state.board, c):
            cells.append(c)
        state.board[c] = -1
    return cells


# --- Neural-net input encoding -------------------------------------------------

BITS = np.arange(4)
LINE_ARR = np.array(LINES)
INPUT_SIZE = 16 * 9 + 8 + 16 + 16 + 32


def threat_map(boards):
    """(B,16) boards -> (B,16,16) bool: [b, piece, cell] is True if placing piece at cell wins."""
    lines = boards[:, LINE_ARR]
    filled = lines >= 0
    same_set = np.bitwise_and.reduce(np.where(filled, lines, 15), axis=-1)
    same_clear = np.bitwise_and.reduce(np.where(filled, ~lines & 15, 15), axis=-1)
    open_cell = LINE_ARR[np.arange(len(LINES)), np.argmin(filled, axis=-1)]  # (B,10)
    pieces = np.arange(16)
    wins_with = ((same_set[..., None] & pieces) | (same_clear[..., None] & ~pieces & 15)) != 0
    wins_with &= (filled.sum(-1) == 3)[..., None]  # (B,10,16)
    result = np.zeros((boards.shape[0], 16, 16), dtype=bool)
    rows = np.arange(boards.shape[0])
    for l in range(len(LINES)):
        result[rows, :, open_cell[:, l]] |= wins_with[:, l, :]
    return result


def encode_batch(boards, selected, available):
    """boards (B,16) int, selected (B,) int, available (B,16) bool -> (B, INPUT_SIZE) float32."""
    boards = np.asarray(boards)
    B = boards.shape[0]
    occupied = boards >= 0
    bits = (boards.clip(0)[..., None] >> BITS) & 1
    cell_feats = np.concatenate(
        [occupied[..., None], bits * occupied[..., None], (1 - bits) * occupied[..., None]], axis=-1
    ).reshape(B, -1)
    sel_bits = (np.asarray(selected)[:, None] >> BITS) & 1
    sel_onehot = np.eye(16, dtype=np.float32)[selected]
    # Tactical hints: where the piece in hand wins, and which pieces would hand over a win.
    threats = threat_map(boards)
    winning_cells_now = threats[np.arange(B), selected]
    dangerous_pieces = threats.any(-1) & np.asarray(available, dtype=bool)
    return np.concatenate(
        [cell_feats, sel_bits, 1 - sel_bits, sel_onehot, np.asarray(available),
         winning_cells_now, dangerous_pieces], axis=1
    ).astype(np.float32)


def encode_states(states):
    boards = np.array([s.board for s in states], dtype=np.int64)
    selected = np.array([s.selected for s in states], dtype=np.int64)
    available = np.array([[s.available >> p & 1 for p in range(16)] for s in states], dtype=bool)
    return encode_batch(boards, selected, available)


# --- Symmetries -----------------------------------------------------------------
# Board: 32 cell permutations that map every line onto a line (dihedral group plus the
# "swap inner/outer rows+cols" maps). Pieces: 24 trait permutations x 16 trait flips.

def _cell_symmetries():
    def compose(a, b):
        return tuple(a[b[i]] for i in range(16))

    def from_rc(f):
        return tuple(f(i // 4, i % 4)[0] * 4 + f(i // 4, i % 4)[1] for i in range(16))

    gens = [
        from_rc(lambda r, c: (c, 3 - r)),                      # rotate
        from_rc(lambda r, c: (r, 3 - c)),                      # mirror
        from_rc(lambda r, c: ((1, 0, 3, 2)[r], (1, 0, 3, 2)[c])),
        from_rc(lambda r, c: ((0, 2, 1, 3)[r], (0, 2, 1, 3)[c])),
    ]
    group = {tuple(range(16))}
    frontier = list(group)
    while frontier:
        g = frontier.pop()
        for h in gens:
            n = compose(h, g)
            if n not in group:
                group.add(n)
                frontier.append(n)
    line_set = {frozenset(l) for l in LINES}
    assert all({frozenset(g[i] for i in l) for l in LINES} == line_set for g in group)
    return np.array(sorted(group), dtype=np.int64)


def _piece_symmetries():
    from itertools import permutations

    maps = []
    for perm in permutations(range(4)):
        for flip in range(16):
            maps.append([
                sum(((p >> perm[k]) & 1) << k for k in range(4)) ^ flip for p in range(16)
            ])
    return np.array(maps, dtype=np.int64)


CELL_SYMS = _cell_symmetries()
PIECE_SYMS = _piece_symmetries()
assert len(CELL_SYMS) == 32 and len(PIECE_SYMS) == 384


def augment(boards, selected, available, policies, rng):
    """Apply an independent random symmetry to every sample in a batch."""
    B = boards.shape[0]
    rows = np.arange(B)[:, None]
    cperm = CELL_SYMS[rng.integers(len(CELL_SYMS), size=B)]
    pmap = PIECE_SYMS[rng.integers(len(PIECE_SYMS), size=B)]

    mapped = np.where(boards >= 0, np.take_along_axis(pmap, boards.clip(0), 1), -1)
    new_boards = np.empty_like(boards)
    new_boards[rows, cperm] = mapped
    new_selected = pmap[np.arange(B), selected]
    new_available = np.empty_like(available)
    new_available[rows, pmap] = available
    action_map = (cperm[:, :, None] * 16 + pmap[:, None, :]).reshape(B, NUM_ACTIONS)
    new_policies = np.empty_like(policies)
    new_policies[rows, action_map] = policies
    return new_boards, new_selected, new_available, new_policies
