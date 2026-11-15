# Quarto

Play Quarto in the browser against an AI that taught itself the game through self-play, the
way DeepMind's AlphaZero learned Go. It never saw human games. It started from random play
and improved by playing itself.

You play standing in a dim, decaying painter's studio inspired by Francis Bacon's atelier
at 7 Reece Mews. The room is generated from a new random seed for every game, so no two
games look alike:

- the walls are stained, cracked and dabbed with test colours
- a single bare bulb flickers, more violently while the machine is thinking
- the floor is buried in torn photographs, newsprint, rags, tubes and brushes
- the machine is a torqued portrait leaning against the wall, and it writhes while it
  searches
- a round mirror shows a smeared reflection of you

## Play

```bash
pip install torch numpy
python3 server.py
```

Then open <http://127.0.0.1:8765>.

- **The easel.** The canvas on the easel is the board. Click a cell to place the piece
  waiting on the stool.
- **The shelf.** After placing, click a piece on the shelf to hand it to the machine.
- **The wall.** The current state of play is painted there.
- **The controls** at the bottom of the room set the machine's strength (Easy 25, Normal 200
  or Strong 800 search simulations per move), who picks the opening piece, and start a new
  game.

On a portrait screen the room rearranges itself vertically. The generated scene lives in
`static/scene.js`.

Every finished game is appended to `games/log.jsonl`. Each entry records every pick and placement, the
final board, the winner, the winning line and the traits its four pieces share. The file is
not committed.

If `checkpoints/latest.pt` is missing or PyTorch isn't installed, the server falls back to
the simple rule-based player in `computer.py`.

### Rules

There are 16 pieces. Each one is tall or short, light or dark, square or round, and solid
or hollow. On your turn you place the piece your opponent handed you, then choose one of
the remaining pieces for them to place. You win by completing a row, column or diagonal of
four pieces that share at least one trait.

## How the AI works

The training loop in `alphazero/` follows AlphaZero:

1. **Self-play.** The current network plays itself. Before each move it runs PUCT Monte
   Carlo tree search, with the network guiding which moves to explore and estimating who is
   winning. Dirichlet noise at the root and random choices over the first 4 moves keep the
   games varied.
2. **Training.** The network learns to predict the moves the search chose (policy) and the
   final result (value), using a replay buffer of recent games.
3. **Repeat** with the improved network.

Details specific to Quarto:

- **One action per turn.** "Place here, then hand over that piece" is one move: 16 cells ×
  16 pieces = 256 actions. The opening pick is skipped, because under trait symmetries
  every first piece is the same.
- **Symmetry augmentation.** Each training sample gets a random symmetry: one of 32 board
  transforms (rotations, reflections, and swapping the inner and outer rows and columns)
  combined with one of 384 piece relabelings (permuting traits, or flipping a trait such as
  tall ↔ short).
- **Tactical shortcuts.** Plain AlphaZero stalled: with about 240 moves per position, the
  search rarely noticed it had just handed over a winning piece. Two additions fixed this.
  The search treats handing over a winning piece as an immediate loss. The network also
  sees which cells win for the piece in hand and which pieces are dangerous to give away.
  These are hand-made input features, like the ones the original AlphaGo used.
- **Network.** A residual network of fully connected layers (4 blocks, width 256). The
  diagonal lines cross the whole 4×4 board, so convolutions don't help much.

## Training process

The shipped model, `checkpoints/latest.pt`, came from the second of two training runs. The
first run used plain AlphaZero and stalled. The second run added the tactical shortcuts
described above.

### Setup

| Setting | Value |
|---|---|
| Hardware | 8-core laptop CPU (no GPU), 7 self-play worker processes |
| Self-play games per iteration | 256 |
| MCTS simulations per self-play move | 200 (PUCT, c = 1.5) |
| Exploration | Dirichlet noise α = 0.3 mixed in at 25% at the root; moves sampled from visit counts for the first 4 moves, then the most-visited move |
| Replay buffer | Most recent 150,000 positions |
| Optimisation per iteration | 300 AdamW steps, batch 512, lr 1e-3, weight decay 1e-4 |
| Loss | Cross-entropy against the search's visit distribution, plus mean squared error against the game result (−1, 0 or +1) |
| Evaluation | Every 5 iterations, at 100 simulations per move: 50 games vs random, 100 games vs the rule-based player, alternating who places first |

### One iteration

1. The current weights are copied to the workers. Each worker plays its share of the 256
   games in lockstep, so one network call scores a whole batch of positions.
2. Every move records the position and the search's visit counts, which become the policy
   target. When the game ends, each recorded position is labelled with the final result
   from the point of view of the player to move.
3. The new positions go into the replay buffer, and the oldest are dropped once it is full.
4. The network trains for 300 steps on random batches from the buffer. Each sample gets a
   random board and piece symmetry, so the network effectively sees about 12,000 versions
   of every position.
5. The weights are saved to `latest.pt`. Every 5th iteration it also saves a snapshot and
   runs the evaluation matches.

### Run 1: plain AlphaZero (stopped at iteration 30)

The first run used only the raw board as network input, and its search knew nothing about
Quarto beyond the rules. It learned to beat random play (48 of 50) within 10 iterations,
then stopped improving against the rule-based player:

| Iteration | vs rule-based (W / D / L of 100) | Value loss |
|---|---|---|
| 5 | 19 / 21 / 60 | 0.74 |
| 10 | 28 / 22 / 50 | 0.72 |
| 15 | 38 / 18 / 44 | 0.72 |
| 20 | 24 / 25 / 51 | 0.72 |
| 25 | 32 / 26 / 42 | 0.72 |
| 30 | 26 / 22 / 52 | 0.71 |

The value loss had flattened at about 0.72, so the network had stopped getting better at
predicting results. The cause was the search budget. With about 240 legal moves early in
the game, 200 simulations barely visit each move once. To notice that a move hands the
opponent a winning piece, the search must visit that move and then also try the
opponent's single winning reply. That almost never happened, so the AI kept giving away
games that the rule-based player, which checks this exhaustively, never would.

### The fix

- **Search:** a move that hands over a piece with a winning cell is scored as a loss as
  soon as it is generated (`alphazero/mcts.py`).
- **Network inputs:** 32 extra inputs. Sixteen mark the cells where the piece in hand wins
  now, and sixteen mark the available pieces that would give the opponent an immediate win
  (`alphazero/env.py`).

Changing the inputs meant run 2 had to start from scratch.

### Run 2: with tactical shortcuts (150 iterations, shipped)

| Iteration | Positions in buffer | Policy loss | Value loss | vs rule-based (W / D / L of 100) |
|---|---|---|---|---|
| 1 | 3,575 | 4.96 | 0.50 | — |
| 5 | 17,514 | 4.05 | 0.50 | 48 / 37 / 15 |
| 10 | 34,749 | 3.99 | 0.49 | 58 / 36 / 6 |
| 25 | 86,696 | 3.84 | 0.49 | 63 / 29 / 8 |
| 50 | 150,000 | 3.68 | 0.48 | 64 / 25 / 11 |
| 75 | 150,000 | 3.55 | 0.49 | 63 / 27 / 10 |
| 100 | 150,000 | 3.50 | 0.49 | 63 / 27 / 10 |
| 125 | 150,000 | 3.47 | 0.48 | 59 / 28 / 13 |
| 150 | 150,000 | 3.44 | 0.46 | 66 / 28 / 6 |

It beat random play in every evaluation, and by iteration 5 it was already well ahead of
where run 1 had stalled. Most of the gain came in the first 10 to 25 iterations. After
that the policy loss kept falling steadily: the network's move predictions grew sharper
and closer to what the search chose. The 100-game evaluations, however, mostly moved
within their noise of about ±10 wins.

Run 2 had 150 iterations and 38,400 games in total. That came to about 1 h 43 min of
self-play and 39 min of training, roughly 2.4 hours overall. Iterations took about 6 s
early on but slowed to around 50 s later, and some training phases also slowed.
Other processes were using the CPU during the run (load average around 11 on 8 cores),
which explains at least part of the slowdown.

### Final evaluation

The final checkpoint was evaluated in larger matches against the same rule-based player:

| AI search per move | vs rule-based (W / D / L) | vs random |
|---|---|---|
| 50 simulations | 127 / 46 / 27 of 200 | — |
| 400 simulations | 145 / 45 / 10 of 200 | 100 / 0 / 0 of 100 |

More search at play time helps a lot. Losses fall from 13.5% to 5% between 50 and 400
simulations. The web app's Strong level uses 800. Quarto is a draw with perfect play, so a
fair number of draws is expected even against a weaker opponent.

### Where to go next

- Train longer or with more simulations per self-play move. The policy loss had not
  levelled off by iteration 150.
- Measure progress against earlier snapshots (`iter_*.pt`) as well. Beating the
  rule-based player tells you less once the model clearly outplays it.
- Reuse the search tree between moves, and give more search to the opening, where there
  are the most moves to choose from.

## Train your own

```bash
python3 -m alphazero.train --iterations 150             # fresh run
python3 -m alphazero.train --resume --iterations 100    # keep improving latest.pt
```

Useful flags: `--games` (self-play games per iteration, default 256), `--simulations`
(search per self-play move, default 200), `--workers` (default: CPU count − 1), `--steps`,
`--batch` and `--lr`.

Each iteration overwrites `checkpoints/latest.pt`. Every 5 iterations it also saves a
snapshot (`iter_NNNN.pt`) and evaluates against the random and rule-based players. Metrics
are appended to `checkpoints/log.jsonl`. The web server loads `latest.pt` at startup, so
restart it after training.

## Layout

| Path | Purpose |
|---|---|
| `game.py` | Game rules used by the web app |
| `computer.py` | Rule-based player and `AlphaZeroComputer` (trained net + MCTS) |
| `server.py` | HTTP server: static UI plus a JSON API (`/api/state`, `/api/new`, `/api/place`, `/api/pick`) |
| `static/` | Front end: `scene.js` generates the studio, `app.js` runs the game, plus `index.html` and `style.css` |
| `alphazero/env.py` | Fast rules, network input encoding, symmetries |
| `alphazero/mcts.py` | Batched PUCT tree search |
| `alphazero/net.py` | Policy/value network, saving and loading |
| `alphazero/players.py` | Random, rule-based and AlphaZero players, evaluation matches |
| `alphazero/train.py` | Self-play and training loop |
