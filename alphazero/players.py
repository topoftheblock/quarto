"""Batched players for evaluation: each maps a list of states to a list of actions."""
import random

import numpy as np

from . import mcts
from .env import State, step, winning_cells


class RandomPlayer:
    name = "random"

    def choose(self, states):
        return [random.choice(s.legal_actions()) for s in states]


class HeuristicPlayer:
    """Same strategy as computer.ComputerPlayer: win if possible, never hand over a winner."""
    name = "heuristic"

    def choose(self, states):
        return [self._choose(s) for s in states]

    def _choose(self, state):
        pieces = state.available_pieces()
        wins_now = winning_cells(state)
        if wins_now:
            return wins_now[0] * 16 + pieces[0]
        options = []
        for cell in state.empty_cells():
            board = state.board.copy()
            board[cell] = state.selected
            after = State(board, -1, state.available)
            options += [cell * 16 + p for p in pieces if not winning_cells(after, p)]
        return random.choice(options or state.legal_actions())


class AlphaZeroPlayer:
    name = "alphazero"

    def __init__(self, net, simulations=200):
        self.net = net
        self.simulations = simulations

    def choose(self, states):
        counts = mcts.search(states, self.net, self.simulations)
        return [int(np.argmax(c)) for c in counts]


def play_match(first, second, games):
    """Play `games` games in lockstep; returns outcomes for `first` (1 win, 0 draw, -1 loss)."""
    states = [State.initial() for _ in range(games)]
    outcomes = [None] * games
    players = (first, second)
    turn = 0
    while any(o is None for o in outcomes):
        live = [i for i, o in enumerate(outcomes) if o is None]
        actions = players[turn % 2].choose([states[i] for i in live])
        for i, action in zip(live, actions):
            states[i], result = step(states[i], action)
            if result is not None:
                outcomes[i] = result if turn % 2 == 0 else -result
        turn += 1
    return outcomes


def evaluate(player, opponent, games=100):
    """Win/draw/loss counts for `player`, alternating who places first."""
    half = games // 2
    results = play_match(player, opponent, half) + [-o for o in play_match(opponent, player, games - half)]
    return {"win": results.count(1), "draw": results.count(0), "loss": results.count(-1)}
