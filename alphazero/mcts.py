"""Batched PUCT Monte Carlo tree search, as in AlphaZero.

Many games are searched in lockstep so every network call evaluates one leaf per game.
"""
import math

import numpy as np
import torch

from .env import NUM_ACTIONS, encode_states, step, winning_cells


class Node:
    __slots__ = ("state", "actions", "prior", "visits", "value_sum", "children")

    def __init__(self, state):
        self.state = state
        self.actions = np.array(state.legal_actions(), dtype=np.int64)
        self.prior = None
        self.visits = np.zeros(len(self.actions), dtype=np.float32)
        self.value_sum = np.zeros(len(self.actions), dtype=np.float32)
        self.children = {}

    def select(self, c_puct):
        q = np.divide(self.value_sum, self.visits, out=np.zeros_like(self.value_sum), where=self.visits > 0)
        u = c_puct * self.prior * math.sqrt(self.visits.sum() + 1) / (1 + self.visits)
        return int(np.argmax(q + u))


class Terminal:
    """Leaf for a finished game; `result` is for the player who made the final move."""
    __slots__ = ("result",)

    def __init__(self, result):
        self.result = result


@torch.no_grad()
def evaluate(net, states):
    logits, values = net(torch.from_numpy(encode_states(states)))
    return logits.numpy(), values.numpy()


def _expand(nodes, net):
    logits, values = evaluate(net, [n.state for n in nodes])
    for node, row in zip(nodes, logits):
        legal = row[node.actions]
        p = np.exp(legal - legal.max())
        node.prior = p / p.sum()
    return values


def search(states, net, simulations=200, c_puct=1.5, noise=None, rng=None, with_values=False):
    """Run MCTS from each state; returns visit counts as (len(states), 256) arrays.

    With `with_values`, also returns each root's searched value for the player to move.
    """
    roots = [Node(s) for s in states]
    _expand(roots, net)
    if noise is not None:
        alpha, frac = noise
        for root in roots:
            eta = rng.dirichlet([alpha] * len(root.actions))
            root.prior = (1 - frac) * root.prior + frac * eta

    for _ in range(simulations):
        paths, leaves, leaf_paths = [], [], []
        for root in roots:
            node, path = root, []
            while True:
                idx = node.select(c_puct)
                path.append((node, idx))
                child = node.children.get(idx)
                if child is None:
                    next_state, result = step(node.state, int(node.actions[idx]))
                    if result is None and winning_cells(next_state):
                        result = -1  # handed over a piece the opponent can win with
                    child = Terminal(result) if result is not None else Node(next_state)
                    node.children[idx] = child
                    if isinstance(child, Node):
                        leaves.append(child)
                        leaf_paths.append(path)
                        break
                if isinstance(child, Terminal):
                    paths.append((path, child.result))
                    break
                node = child

        if leaves:
            values = _expand(leaves, net)
            # The leaf's value is for its player to move; flip to the parent's view.
            paths.extend((path, -float(v)) for path, v in zip(leaf_paths, values))

        for path, value in paths:
            for node, idx in reversed(path):
                node.visits[idx] += 1
                node.value_sum[idx] += value
                value = -value

    counts = np.zeros((len(roots), NUM_ACTIONS), dtype=np.float32)
    for i, root in enumerate(roots):
        counts[i, root.actions] = root.visits
    if with_values:
        return counts, np.array([r.value_sum.sum() / max(r.visits.sum(), 1) for r in roots])
    return counts
