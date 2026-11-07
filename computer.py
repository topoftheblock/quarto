import random

from game import ALL_PIECES


class ComputerPlayer:
    """Wins when it can, otherwise avoids handing the opponent a winning piece."""

    last_value = None  # expected outcome of the last move, from the computer's view

    def open(self, game):
        game.pick(random.choice(game.available))  # every opening piece is equivalent

    def play(self, game):
        game.place(self.choose_cell(game.board, game.selected, game.available))
        if not game.over:
            game.pick(self.choose_piece(game.board, game.available))

    def choose_cell(self, board, piece, available):
        cells = board.empty_cells()
        for cell in cells:
            if board.with_piece(cell, piece).winning_line():
                return cell
        safe = [c for c in cells if self._safe_pieces(board.with_piece(c, piece), available)]
        return random.choice(safe or cells)

    def choose_piece(self, board, available):
        return random.choice(self._safe_pieces(board, available) or available)

    def _safe_pieces(self, board, pieces):
        return [
            piece for piece in pieces
            if not any(board.with_piece(c, piece).winning_line() for c in board.empty_cells())
        ]


class AlphaZeroComputer(ComputerPlayer):
    """Plays with the trained policy/value net plus MCTS; see alphazero/train.py."""

    def __init__(self, checkpoint, simulations=400):
        from alphazero import net

        self.net, _ = net.load(checkpoint)
        self.simulations = simulations

    def play(self, game):
        from alphazero.env import State
        from alphazero.mcts import search

        pieces = [ALL_PIECES.index(p) for p in game.available]
        if not pieces:  # final placement is forced
            return super().play(game)
        board = [-1 if p is None else ALL_PIECES.index(p) for p in game.board.cells]
        state = State(board, ALL_PIECES.index(game.selected), sum(1 << p for p in pieces))
        counts, values = search([state], self.net, self.simulations, with_values=True)
        self.last_value = float(values[0])
        cell, give = divmod(int(counts.argmax()), 16)
        game.place(cell)
        if not game.over:
            game.pick(ALL_PIECES[give])
