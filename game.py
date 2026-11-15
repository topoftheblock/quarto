from dataclasses import dataclass
from itertools import product

HUMAN = "human"
COMPUTER = "computer"
DRAW = "draw"


@dataclass(frozen=True)
class Piece:
    tall: bool
    dark: bool
    square: bool
    hollow: bool

    @property
    def traits(self):
        return (self.tall, self.dark, self.square, self.hollow)


ALL_PIECES = [Piece(*traits) for traits in product((False, True), repeat=4)]

LINES = (
    [tuple(range(row * 4, row * 4 + 4)) for row in range(4)]
    + [tuple(range(col, 16, 4)) for col in range(4)]
    + [(0, 5, 10, 15), (3, 6, 9, 12)]
)


class Board:
    def __init__(self, cells=(None,) * 16):
        self.cells = tuple(cells)

    def empty_cells(self):
        return [i for i, piece in enumerate(self.cells) if piece is None]

    def is_full(self):
        return None not in self.cells

    def with_piece(self, cell, piece):
        cells = list(self.cells)
        cells[cell] = piece
        return Board(cells)

    def winning_line(self):
        for line in LINES:
            pieces = [self.cells[i] for i in line]
            if None in pieces:
                continue
            if any(len({p.traits[k] for p in pieces}) == 1 for k in range(4)):
                return line
        return None


class Game:
    """Players alternate: place the piece you were given, then pick one for the opponent."""

    def __init__(self, first=HUMAN):
        self.board = Board()
        self.available = list(ALL_PIECES)
        self.selected = None
        self.turn = first  # whoever picks the opening piece
        self.winner = None
        self.last_cell = None
        self.moves = []  # ("pick" | "place", player, piece, cell or None), in order

    @property
    def over(self):
        return self.winner is not None

    def place(self, cell):
        if self.over or self.selected is None or cell not in self.board.empty_cells():
            raise ValueError("invalid placement")
        self.board = self.board.with_piece(cell, self.selected)
        self.selected = None
        self.last_cell = cell
        self.moves.append(("place", self.turn, self.board.cells[cell], cell))
        if self.board.winning_line():
            self.winner = self.turn
        elif self.board.is_full():
            self.winner = DRAW

    def pick(self, piece):
        if self.over or self.selected is not None or piece not in self.available:
            raise ValueError("invalid pick")
        self.available.remove(piece)
        self.selected = piece
        self.moves.append(("pick", self.turn, piece, None))
        self.turn = COMPUTER if self.turn == HUMAN else HUMAN
