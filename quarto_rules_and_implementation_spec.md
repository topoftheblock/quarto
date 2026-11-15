# Quarto --- Rules and Implementation Specification

## 1. Purpose

This document specifies the **classic version of Quarto** for
implementation as a digital two-player game. It is written for a coding
agent: it defines the game components, legal actions, turn sequence, win
conditions, state transitions, and acceptance tests.

Unless explicitly stated otherwise, do **not** implement the beginner or
advanced variants.

## 2. Game overview

-   **Players:** 2
-   **Board:** 4 rows × 4 columns (16 spaces)
-   **Pieces:** 16 unique pieces
-   **Objective:** Be the first player to create a horizontal, vertical,
    or diagonal line of four pieces that share at least one attribute.
-   **Central mechanic:** A player does not choose the piece they place.
    Their opponent chooses it for them.

A player wins by placing the piece they were given so that it completes
a qualifying line. It does not matter who placed the other three pieces
in that line.

## 3. Components and piece model

Every piece has exactly four binary attributes:

  Attribute   Value 0          Value 1
  ----------- ---------------- ---------
  Height      Short            Tall
  Color       Light            Dark
  Shape       Round            Square
  Interior    Solid (filled)   Hollow

There is exactly one piece for every possible combination of these four
attributes:

\[ 2\^4 = 16 `\text{ unique pieces}`{=tex} \]

A convenient implementation is a four-bit integer ID from `0` to `15`.
Each bit represents one attribute. For example, choose and document a
consistent mapping such as:

-   bit 0: tall
-   bit 1: dark
-   bit 2: square
-   bit 3: hollow

With this mapping, piece `0` is short, light, round, solid; piece `15`
is tall, dark, square, hollow. The particular numeric mapping is an
implementation choice; consistency is what matters.

**Important:** Pieces are not owned by either player. All 16 pieces
belong to the shared pool. Players take turns choosing which piece the
opponent must place.

## 4. Setup

1.  Create an empty 4×4 board.
2.  Make all 16 pieces available in a shared, visible pool.
3.  Randomly determine which player takes the first turn, or provide a
    fair first-player selection mechanism.
4.  The first player chooses one available piece and gives it to the
    other player.
5.  The receiving player must place that piece on the board.

The first player does **not** place a piece on the opening action. They
select the piece that the second player must place.

## 5. Turn sequence

After setup, a normal turn consists of these actions:

1.  **Place:** The current player places the piece currently assigned to
    them on any empty board space.
2.  **Check for a win:** Check whether that placement has created a
    qualifying line. See Section 6.
3.  **If the game has not ended, choose:** The player who just placed a
    piece selects one piece from the remaining available pool.
4.  **Pass the piece:** The selected piece becomes the piece the
    opponent must place on their next turn.
5.  **Change current player:** The opponent becomes the current player
    and places the piece they were given.

The player who places a piece is the player who can win from that
placement. The player who selected that piece does not win merely
because they selected it.

### First turn versus later turns

-   At the start of the game, Player 1 selects a piece for Player 2.
-   Player 2 places it, then selects a piece for Player 1.
-   Player 1 places it, then selects a piece for Player 2.
-   Continue alternating in this way.

### Legal actions

A placement is legal only if: - The player has a piece assigned to
them. - The chosen board cell is empty. - The piece has not already been
placed.

A piece selection is legal only if: - The game is still active. - The
player has just completed a legal placement that did not end the game. -
The selected piece is still available and has not been placed or
selected previously.

A player may place their piece in **any** empty cell. There are no
adjacency, ownership, or movement restrictions.

## 6. Winning condition: "Quarto!"

A player wins when their placement creates a straight line of four
pieces in which **all four pieces share at least one common attribute**.

A qualifying line can be:

-   Any of the 4 horizontal rows.
-   Any of the 4 vertical columns.
-   Either of the 2 main diagonals.

There are therefore exactly **10 possible winning lines** on a 4×4
board.

### Shared attribute rule

For a line to win, at least one of the four binary attributes must have
the same value on all four pieces.

Examples of winning lines: - All four pieces are dark. - All four pieces
are short. - All four pieces are round. - All four pieces are hollow.

The four pieces do **not** need to share every attribute. Different
shared attributes can also coexist in the same line.

A line does not win merely because its pieces share an attribute in
pairs. The same attribute must be present with the same value on **all
four** pieces.

### Algorithm for checking a line

Represent each piece as four binary attributes. For a line containing
pieces `p1`, `p2`, `p3`, and `p4`, the line is winning if there exists
an attribute index `i` such that:

``` text
p1[i] == p2[i] == p3[i] == p4[i]
```

Equivalent bitwise implementation, if pieces are encoded as four-bit
integers:

``` text
common_ones = p1 AND p2 AND p3 AND p4
common_zeros = NOT(p1) AND NOT(p2) AND NOT(p3) AND NOT(p4)

line_is_winning = (common_ones != 0) OR (common_zeros != 0)
```

Mask `NOT` to the four attribute bits (for example, with `0b1111`) in
languages where bitwise negation produces an unbounded or signed result.

A straightforward implementation may instead enumerate the 10 winning
lines and inspect their four cells after every placement. This is simple
and fast enough for this game.

### When to check

Check for a win immediately after a piece is placed and before asking
the player to select the next piece. Only lines containing the newly
placed piece can have changed, so an optimized implementation may check
only those lines. Checking all 10 lines is also perfectly acceptable.

## 7. End of game

The game ends in one of two ways:

### Win

The player who places the piece that completes a qualifying line wins.

The game should stop immediately after the winning placement. No further
piece selection or placement is allowed.

### Draw

If all 16 pieces have been placed and no winning line has been declared,
the game is a draw.

In a conventional digital implementation, the win check should happen
after every placement, so a full board with no winner is a draw.

## 8. Important rule clarifications

-   **No player owns pieces.** The pieces are a shared set; players only
    determine which piece the opponent must place.
-   **The chooser and placer are different players.** The player who
    places a piece is the one who can win by completing a line.
-   **The other three pieces can have been placed by either player.** A
    player does not need to have placed the entire winning line.
-   **Only straight rows, columns, and the two long diagonals count.**
    Other diagonal-looking arrangements do not count.
-   **A line needs only one shared attribute.** It does not need to
    match in all four attributes.
-   **A piece can participate in multiple winning lines.** One completed
    line is sufficient to win.
-   **A move is not legal after the game has ended.**

### Physical-game announcement nuance

The traditional tabletop rules require the player to announce "Quarto!"
when they notice the winning alignment. They also describe a missed
alignment being claimable by the opponent immediately after the next
piece is passed; if neither player notices it during that move, it loses
its winning effect and play continues.

For a digital game, use the simpler and less ambiguous default: **detect
a winning line automatically immediately after placement and end the
game at once.** This is the recommended implementation behavior. A
strict tabletop-announcement mode would need additional timing and claim
state and should be treated as an optional variant, not part of the core
implementation.

## 9. Recommended game state

A minimal game state can contain:

``` text
board: 4x4 array
availablePieces: set/list of piece IDs
currentPlayer: player ID
pieceToPlace: piece ID or null
status: "selecting" | "placing" | "won" | "draw"
winner: player ID or null
winningLine: list of four board coordinates or null
```

You may use a different internal structure, provided it represents the
same information and enforces the same rules.

### State meanings

-   `selecting`: The player who just placed a piece must choose an
    available piece for the opponent. At the very beginning, Player 1 is
    in this state.
-   `placing`: The current player has a piece assigned and must place
    it.
-   `won`: A player has completed a winning line. Store the winner and
    the coordinates of at least one winning line.
-   `draw`: All 16 board cells are occupied and no winning line was
    created.

An implementation may model the opening selection separately if that
makes the state machine clearer.

## 10. Recommended state transitions

### Start

-   Board is empty.
-   All 16 pieces are available.
-   Player 1 is asked to select a piece for Player 2.
-   Transition to `placing` for Player 2 once the piece is selected.

### Select a piece

Given a player in `selecting` state:

1.  Validate that the selected piece is available.
2.  Remove it from `availablePieces`.
3.  Set it as `pieceToPlace`.
4.  Set the opponent as `currentPlayer`.
5.  Transition to `placing`.

### Place a piece

Given a player in `placing` state:

1.  Validate that `pieceToPlace` is not null.
2.  Validate that the target cell is empty.
3.  Put `pieceToPlace` in that cell.
4.  Mark `pieceToPlace` as no longer pending (set it to null).
5.  Check all possible winning lines.
6.  If a winning line exists:
    -   Set `status` to `won`.
    -   Set `winner` to the player who just placed the piece.
    -   Store the winning line.
    -   Stop processing the turn.
7.  Otherwise, if the board is full:
    -   Set `status` to `draw`.
    -   Stop processing the turn.
8.  Otherwise:
    -   Set `currentPlayer` to the player who just placed the piece.
    -   Set `status` to `selecting`.
    -   Ask that player to select a piece for the opponent.

**Piece-pool convention:** A selected piece should be removed from the
available pool as soon as it is assigned for placement, not when it is
placed. This prevents the same piece from being selected twice. The
pending piece is tracked separately in `pieceToPlace`.

## 11. User interface expectations

These are presentation recommendations, not additional game rules:

-   Show the 4×4 board.
-   Show all pieces that are still available to be selected.
-   Visually distinguish the piece currently assigned to the player who
    must place it.
-   Indicate whose turn it is and whether the player must **place** or
    **choose a piece for the opponent**.
-   Allow placement only on empty cells.
-   Allow selection only from available pieces.
-   After a winning placement, highlight the winning line and display
    the winner.
-   Display a draw state when the board is full without a winner.
-   Provide a restart/new-game action.
-   Ensure piece attributes can be distinguished without relying on
    color alone; use labels, shapes, or accessible descriptions as well.

## 12. Acceptance tests

Use these cases to verify the implementation.

1.  **Initial setup:** The board is empty and all 16 unique pieces are
    available.
2.  **Opening action:** Player 1 selects a piece; Player 2, not Player
    1, must place it.
3.  **No duplicate pieces:** Once selected, a piece cannot be selected
    again.
4.  **No occupied-cell placement:** A player cannot place a piece in a
    cell that is already occupied.
5.  **Horizontal win:** Four pieces in one row sharing one attribute
    produce a win for the player who placed the fourth piece.
6.  **Vertical win:** Four pieces in one column sharing one attribute
    produce a win.
7.  **Diagonal win:** Four pieces along either main diagonal sharing one
    attribute produce a win.
8.  **Any attribute can win:** Each of the eight attribute values
    (short/tall, light/dark, round/square, solid/hollow) can
    independently qualify a line.
9.  **Only one common attribute required:** Four pieces that share one
    attribute but differ in other attributes still win.
10. **No pairwise-only match:** A line where no single attribute is
    shared by all four pieces is not a win.
11. **Either player can have placed the other pieces:** A player wins if
    their placement completes the line, regardless of who placed the
    other three pieces.
12. **Immediate end:** After a winning placement, no piece selection or
    further placement is permitted.
13. **Draw:** A full board with no winning line is a draw.
14. **Ten winning lines:** The implementation checks exactly four rows,
    four columns, and two main diagonals---not arbitrary groups of four.
15. **Pending piece accounting:** A selected piece is unavailable to
    select again even before it is placed.

## 13. Out of scope: variants

Do not include these in the classic game unless explicitly requested:

-   **Beginner variant:** Players may agree to use only one, two, or
    three attributes as winning criteria.
-   **Advanced variant:** A 2×2 square of four pieces sharing an
    attribute can also win. This adds nine possible 2×2 square patterns
    to the classic line-based objective.
-   **Strict announcement timing:** Requiring a player to call "Quarto!"
    and allowing missed wins to expire, as described in Section 8.

## 14. Reference sources

The specification above follows the classic rules published by Gigamic:

-   [Gigamic --- Quarto product and rules
    page](https://en.gigamic.com/modern-classics/1049-quarto-3421271300410.html)
-   [Gigamic Quarto rulebook (English text in the rulebook
    PDF)](https://www.brettspielversand.de/mediafiles/spieleanleitungen/gigamic/155-0015_Quarto_Anleitung.pdf)
-   [Board Game Arena --- Quarto overview and rules
    summary](https://en.boardgamearena.com/gamepanel?game=quarto)

If a future implementation decision is not covered here, preserve the
classic objective and turn structure: the opponent chooses the piece,
the current player places it, and a line of four sharing at least one
attribute wins.
