import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from computer import AlphaZeroComputer, ComputerPlayer
from game import ALL_PIECES, COMPUTER, HUMAN, Game

ROOT = Path(__file__).parent
STATIC = ROOT / "static"
CHECKPOINT = ROOT / "checkpoints" / "latest.pt"
GAME_LOG = ROOT / "games" / "log.jsonl"
TRAITS = (("short", "tall"), ("light", "dark"), ("round", "square"), ("solid", "hollow"))
CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript"}
LEVELS = {"easy": 25, "normal": 200, "strong": 800}


def describe(piece):
    return ", ".join(names[value] for names, value in zip(TRAITS, piece.traits))


def shared_traits(pieces):
    """Trait values common to all the given pieces, e.g. ["dark", "hollow"]."""
    return [
        names[pieces[0].traits[k]] for k, names in enumerate(TRAITS)
        if len({p.traits[k] for p in pieces}) == 1
    ]


class QuartoServer(HTTPServer):
    def __init__(self, address):
        super().__init__(address, QuartoHandler)
        self.computer = self._load_computer()
        self.new_game(HUMAN, "normal")

    def _load_computer(self):
        try:
            computer = AlphaZeroComputer(CHECKPOINT)
            print(f"Using trained model {CHECKPOINT}")
            return computer
        except (ImportError, OSError) as error:
            print(f"No trained model ({error}); using heuristic computer")
            return ComputerPlayer()

    def new_game(self, first, level):
        self.game = Game(first)
        self.first = first
        self.logged = False
        self.level = level if level in LEVELS else "normal"
        self.ai_move = None
        self.computer.last_value = None
        if hasattr(self.computer, "simulations"):
            self.computer.simulations = LEVELS[self.level]
        if first == COMPUTER:
            self.computer.open(self.game)
            self.ai_move = {"cell": None, "piece": ALL_PIECES.index(self.game.selected)}

    def computer_turn(self):
        game = self.game
        self.computer.play(game)
        given = ALL_PIECES.index(game.selected) if game.selected else None
        self.ai_move = {"cell": game.last_cell, "piece": given}

    def log_finished_game(self):
        """Append a finished game to games/log.jsonl so it can be replayed later."""
        game = self.game
        if not game.over or self.logged:
            return
        self.logged = True
        line = game.board.winning_line()
        entry = {
            "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "level": self.level,
            "first": self.first,
            "winner": game.winner,
            "winning_line": list(line) if line else None,
            "shared_traits": shared_traits([game.board.cells[i] for i in line]) if line else None,
            "moves": [
                {"action": action, "player": player, "piece": ALL_PIECES.index(piece),
                 "traits": describe(piece), **({"cell": cell} if action == "place" else {})}
                for action, player, piece, cell in game.moves
            ],
            "board": [None if p is None else describe(p) for p in game.board.cells],
        }
        GAME_LOG.parent.mkdir(exist_ok=True)
        with GAME_LOG.open("a") as f:
            f.write(json.dumps(entry) + "\n")

    def state(self):
        game = self.game
        board = game.board
        winning = board.winning_line()
        # Hints for the human: cells that win now, and pieces that would hand the computer a win.
        winning_cells = [
            c for c in board.empty_cells()
            if game.selected and not game.over and board.with_piece(c, game.selected).winning_line()
        ]
        dangerous = [
            ALL_PIECES.index(p) for p in game.available
            if not game.over and any(board.with_piece(c, p).winning_line() for c in board.empty_cells())
        ]
        value = self.computer.last_value
        return {
            "board": [None if p is None else ALL_PIECES.index(p) for p in board.cells],
            "available": [ALL_PIECES.index(p) for p in game.available],
            "selected": ALL_PIECES.index(game.selected) if game.selected else None,
            "phase": "over" if game.over else ("place" if game.selected else "pick"),
            "winner": game.winner,
            "winning_line": list(winning) if winning else [],
            "last_cell": game.last_cell,
            "ai_move": self.ai_move,
            "ai_value": None if value is None else round(value, 3),
            "hints": {"winning_cells": winning_cells, "dangerous": dangerous},
            "level": self.level,
            "trained": isinstance(self.computer, AlphaZeroComputer),
        }


class QuartoHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/state":
            return self._json(self.server.state())
        name = "index.html" if self.path == "/" else self.path.lstrip("/")
        path = (STATIC / name).resolve()
        if path.parent != STATIC.resolve() or not path.is_file():
            return self.send_error(404)
        self._respond(CONTENT_TYPES.get(path.suffix, "application/octet-stream"), path.read_bytes())

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self.send_error(400)
        server = self.server
        game = server.game
        try:
            if self.path == "/api/new":
                server.new_game(COMPUTER if body.get("first") == COMPUTER else HUMAN, body.get("level"))
            elif self.path == "/api/place":
                game.place(int(body["cell"]))
                server.ai_move = None
            elif self.path == "/api/pick":
                game.pick(ALL_PIECES[int(body["piece"])])
                server.ai_move = None
                if not game.over:
                    server.computer_turn()
            else:
                return self.send_error(404)
        except (KeyError, IndexError, TypeError, ValueError):
            return self._json({"error": "invalid move", **server.state()}, status=409)
        server.log_finished_game()
        self._json(server.state())

    def _json(self, data, status=200):
        self._respond("application/json", json.dumps(data).encode(), status)

    def _respond(self, content_type, body, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = QuartoServer(("127.0.0.1", 8765))
    print("Quarto running at http://127.0.0.1:8765")
    server.serve_forever()
