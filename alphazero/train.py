"""AlphaZero training loop: self-play with MCTS -> train the net on the results -> repeat.

    python -m alphazero.train --iterations 100
"""
import argparse
import json
import multiprocessing as mp
import os
import random
import time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from . import mcts, net as netlib
from .env import State, augment, encode_batch, step
from .players import AlphaZeroPlayer, HeuristicPlayer, RandomPlayer, evaluate

CHECKPOINTS = Path(__file__).resolve().parent.parent / "checkpoints"


def self_play(state_dict, config, games, simulations, temp_moves, seed):
    """Worker: play `games` self-play games, return training samples."""
    torch.set_num_threads(1)
    random.seed(seed)
    rng = np.random.default_rng(seed)
    net = netlib.QuartoNet(**config)
    net.load_state_dict(state_dict)
    net.eval()

    states = [State.initial() for _ in range(games)]
    histories = [[] for _ in range(games)]
    samples = []
    move = 0
    live = list(range(games))
    while live:
        counts = mcts.search([states[i] for i in live], net, simulations, noise=(0.3, 0.25), rng=rng)
        still_live = []
        for i, c in zip(live, counts):
            s = states[i]
            policy = c / c.sum()
            histories[i].append((s.board, s.selected, s.available, policy))
            action = int(rng.choice(256, p=policy)) if move < temp_moves else int(np.argmax(c))
            states[i], result = step(s, action)
            if result is None:
                still_live.append(i)
                continue
            # result is for the last mover; earlier moves alternate perspective.
            for k, (board, selected, available, pi) in enumerate(reversed(histories[i])):
                z = result if k % 2 == 0 else -result
                samples.append((board, selected, [available >> p & 1 for p in range(16)], pi, z))
        live = still_live
        move += 1
    return samples


def train_steps(net, optimizer, buffer, steps, batch_size, rng):
    net.train()
    boards = np.array([b[0] for b in buffer], dtype=np.int64)
    selected = np.array([b[1] for b in buffer], dtype=np.int64)
    available = np.array([b[2] for b in buffer], dtype=bool)
    policies = np.array([b[3] for b in buffer], dtype=np.float32)
    values = np.array([b[4] for b in buffer], dtype=np.float32)
    totals = np.zeros(2)
    for _ in range(steps):
        idx = rng.integers(len(buffer), size=batch_size)
        bb, ss, aa, pp = augment(boards[idx], selected[idx], available[idx], policies[idx], rng)
        x = torch.from_numpy(encode_batch(bb, ss, aa))
        logits, v = net(x)
        policy_loss = -(torch.from_numpy(pp) * F.log_softmax(logits, dim=1)).sum(1).mean()
        value_loss = F.mse_loss(v, torch.from_numpy(values[idx]))
        loss = policy_loss + value_loss
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        totals += (policy_loss.item(), value_loss.item())
    net.eval()
    return totals / steps


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=100)
    parser.add_argument("--games", type=int, default=256, help="self-play games per iteration")
    parser.add_argument("--simulations", type=int, default=200)
    parser.add_argument("--temp-moves", type=int, default=4)
    parser.add_argument("--buffer", type=int, default=150_000, help="max samples kept")
    parser.add_argument("--steps", type=int, default=300, help="gradient steps per iteration")
    parser.add_argument("--batch", type=int, default=512)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--eval-every", type=int, default=5)
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    CHECKPOINTS.mkdir(exist_ok=True)
    latest = CHECKPOINTS / "latest.pt"
    start = 0
    if args.resume and latest.exists():
        net, checkpoint = netlib.load(latest)
        start = checkpoint.get("iteration", 0)
    else:
        net = netlib.QuartoNet()
    optimizer = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=1e-4)
    rng = np.random.default_rng()
    buffer = deque(maxlen=args.buffer)
    log = open(CHECKPOINTS / "log.jsonl", "a")

    with mp.get_context("spawn").Pool(args.workers) as pool:
        for it in range(start + 1, start + args.iterations + 1):
            t0 = time.time()
            state_dict = {k: v.cpu() for k, v in net.state_dict().items()}
            per_worker = [args.games // args.workers + (w < args.games % args.workers) for w in range(args.workers)]
            jobs = [
                (state_dict, net.config, n, args.simulations, args.temp_moves, int(rng.integers(2**31)))
                for n in per_worker if n
            ]
            for samples in pool.starmap(self_play, jobs):
                buffer.extend(samples)
            t1 = time.time()
            policy_loss, value_loss = train_steps(net, optimizer, buffer, args.steps, args.batch, rng)
            netlib.save(net, latest, iteration=it)
            entry = {
                "iteration": it, "buffer": len(buffer), "policy_loss": round(policy_loss, 4),
                "value_loss": round(value_loss, 4), "selfplay_s": round(t1 - t0, 1),
                "train_s": round(time.time() - t1, 1),
            }
            if it % args.eval_every == 0:
                torch.set_num_threads(1)
                player = AlphaZeroPlayer(net, simulations=100)
                entry["vs_random"] = evaluate(player, RandomPlayer(), 50)
                entry["vs_heuristic"] = evaluate(player, HeuristicPlayer(), 100)
                torch.set_num_threads(os.cpu_count() or 1)
                netlib.save(net, CHECKPOINTS / f"iter_{it:04d}.pt", iteration=it)
            print(json.dumps(entry), flush=True)
            log.write(json.dumps(entry) + "\n")
            log.flush()


if __name__ == "__main__":
    main()
