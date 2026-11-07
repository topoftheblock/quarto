// Quarto front end: renders server state inside a generated painter's studio
// (see scene.js) and animates the machine's replies. Each game gets a new room.
const $ = (sel) => document.querySelector(sel);

let state = null;
let busy = false;
let seed = Math.floor(Math.random() * 2 ** 31);
const settings = { first: "human", level: "normal" };

// --- Room layouts, in scene units ([x, y, w, h]) ---------------------------------------

const LAYOUTS = {
  wide: {
    w: 1600, h: 1000, floor: 700,
    status: [90, 70, 470, 190],
    board: [610, 150, 400, 400],
    bulb: [520, 120],
    machine: [130, 300, 290, 410, -4],
    mirror: [1330, 190, 100],
    shelf: [1150, 340, 360, 420],
    hand: [452, 708, 96, 96],
    stool: [500, 800], stoolWidth: 120,
  },
  tall: {
    w: 1000, h: 1600, floor: 1050,
    status: [60, 90, 620, 120],
    board: [130, 220, 740, 740],
    bulb: [850, 120],
    machine: [30, 1080, 250, 330, -3],
    mirror: null,
    shelf: [400, 1040, 560, 420],
    hand: [262, 1400, 96, 96],
    stool: [310, 1494], stoolWidth: 110,
  },
};

let layout = null;

function chooseLayout() {
  return window.innerWidth / window.innerHeight < 0.85 ? LAYOUTS.tall : LAYOUTS.wide;
}

function place(el, [x, y, w, h], L) {
  Object.assign(el.style, {
    left: `${(x / L.w) * 100}%`, top: `${(y / L.h) * 100}%`,
    width: `${(w / L.w) * 100}%`, height: `${(h / L.h) * 100}%`,
  });
}

function paint() {
  const L = layout;
  const studio = $("#studio");
  studio.classList.toggle("tall", L === LAYOUTS.tall);
  studio.style.setProperty("--w", L.w);
  studio.style.setProperty("--h", L.h);
  studio.style.setProperty("--bx", `${(L.bulb[0] / L.w) * 100}%`);
  studio.style.setProperty("--by", `${(L.bulb[1] / L.h) * 100}%`);
  $("#scene").innerHTML = paintStudio(L, seed);
  $("#swaths").innerHTML = paintSwaths(seededRandom(seed + 1));
  place($("#canvas"), L.board, L);
  place($("#pieces"), L.shelf, L);
  place($("#hand"), L.hand, L);
  place($("#status"), L.status, L);
}

window.addEventListener("resize", () => {
  const next = chooseLayout();
  if (next !== layout) { layout = next; paint(); }
});

// --- Pieces ---------------------------------------------------------------------------

// Piece ids are 4 bits in game.ALL_PIECES order: tall, dark, square, hollow.
const traits = (id) => ({ tall: id >> 3 & 1, dark: id >> 2 & 1, square: id >> 1 & 1, hollow: id & 1 });

function describe(id) {
  const t = traits(id);
  return [t.tall ? "tall" : "short", t.dark ? "dark" : "light", t.square ? "square" : "round", t.hollow ? "hollow" : "solid"].join(", ");
}

function pieceSVG(id, extra = "") {
  const t = traits(id);
  const base = 92;
  const top = base - (t.tall ? 64 : 34);
  const c = t.dark
    ? { body: "url(#body-dark)", side: "#17122e", lid: "#7a6ab4", hole: "#05030c", rim: "#a99be0" }
    : { body: "url(#body-light)", side: "#a8585a", lid: "#f8dfcc", hole: "#5c1626", rim: "#fff4ea" };
  let shape;
  if (t.square) {
    const d = 9; // depth offset of the box
    shape = `
      <polygon points="64,${top} 78,${top - d} 78,${base - d} 64,${base}" fill="${c.side}"/>
      <rect x="20" y="${top}" width="44" height="${base - top}" fill="${c.body}"/>
      <rect x="20" y="${top}" width="44" height="${base - top}" fill="url(#streaks)"/>
      <polygon points="20,${top} 64,${top} 78,${top - d} 34,${top - d}" fill="${c.lid}" stroke="${c.rim}" stroke-width=".8"/>
      ${t.hollow ? `<ellipse cx="49" cy="${top - d / 2}" rx="11" ry="3" fill="${c.hole}"/>` : ""}`;
  } else {
    const body = `M22 ${top} V${base} A28 8 0 0 0 78 ${base} V${top} Z`;
    shape = `
      <path d="${body}" fill="${c.body}"/>
      <path d="${body}" fill="url(#streaks)"/>
      <ellipse cx="50" cy="${top}" rx="28" ry="8" fill="${c.lid}" stroke="${c.rim}" stroke-width=".8"/>
      ${t.hollow ? `<ellipse cx="50" cy="${top}" rx="15" ry="4.3" fill="${c.hole}"/>` : ""}`;
  }
  return `<svg class="piece ${extra}" viewBox="0 0 100 100" role="img" aria-label="${describe(id)}">
    <ellipse cx="50" cy="${base + 3}" rx="34" ry="6" fill="#000" opacity=".45"/>
    <g filter="url(#smear)">${shape}</g></svg>`;
}

// --- Server ---------------------------------------------------------------------------

async function api(path, body) {
  const options = body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  };
  const response = await fetch(path, options);
  return response.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Rendering ------------------------------------------------------------------------

function statusText() {
  if (busy) return "It is thinking.";
  if (state.phase === "over") {
    return { human: "You win.", computer: "It wins.", draw: "Nobody wins." }[state.winner];
  }
  if (state.phase === "place") return "Place the piece.";
  return "Give it a piece.";
}

function render(prev) {
  const placing = state.phase === "place" && !busy;
  const picking = state.phase === "pick" && !busy;
  const lastAi = state.ai_move ? state.ai_move.cell : null;

  $("#board").innerHTML = state.board.map((piece, i) => {
    const classes = ["cell"];
    if (state.winning_line.includes(i)) classes.push("win");
    else if (i === lastAi) classes.push("last");
    const fresh = prev && prev.board[i] === null && piece !== null ? "fresh" : "";
    let content = "";
    if (piece !== null) content = pieceSVG(piece, fresh);
    else if (placing) content = pieceSVG(state.selected, "ghost");
    const disabled = placing && piece === null ? "" : " disabled";
    return `<button class="${classes.join(" ")}" data-cell="${i}"${disabled} aria-label="Cell ${i + 1}">${content}</button>`;
  }).join("");

  const handChanged = prev && prev.selected !== state.selected;
  $("#hand").innerHTML = state.selected === null ? "" : pieceSVG(state.selected, handChanged ? "fresh" : "");

  $("#pieces").innerHTML = Array.from({ length: 16 }, (_, id) => {
    if (!state.available.includes(id)) return `<span class="slot"></span>`;
    const disabled = picking ? "" : " disabled";
    return `<button class="slot" data-piece="${id}"${disabled} title="${describe(id)}">${pieceSVG(id)}</button>`;
  }).join("");

  const status = $("#status");
  status.textContent = statusText();
  status.classList.toggle("loud", state.phase === "over");
  document.querySelectorAll("#level button").forEach((b) => b.classList.toggle("on", b.dataset.level === settings.level));
  document.querySelectorAll("#first button").forEach((b) => b.classList.toggle("on", b.dataset.first === settings.first));
  $("#studio").classList.toggle("thinking", busy);
}

function apply(next, prev = state) {
  state = next;
  render(prev);
}

// The machine's portrait writhes while it searches.
let churn = null;
function setThinking(on) {
  clearInterval(churn);
  const noise = document.getElementById("torque-head-noise");
  if (!on || !noise) return;
  const [fx, fy] = noise.getAttribute("baseFrequency").split(" ").map(Number);
  churn = setInterval(() => {
    noise.setAttribute("seed", Math.floor(Math.random() * 1000));
    noise.setAttribute("baseFrequency", `${fx * (0.85 + Math.random() * 0.3)} ${fy * (0.85 + Math.random() * 0.3)}`);
  }, 90);
}

// --- Actions --------------------------------------------------------------------------

async function placePiece(cell) {
  if (busy) return;
  apply(await api("/api/place", { cell }));
}

async function pick(piece) {
  if (busy) return;
  const prev = state;
  busy = true;
  // Show the piece leaving for the machine while it thinks.
  state = { ...state, selected: piece, available: state.available.filter((p) => p !== piece), ai_move: null };
  render(prev);
  setThinking(true);
  const started = Date.now();
  const next = await api("/api/pick", { piece });
  await sleep(Math.max(0, 900 - (Date.now() - started)));
  busy = false;
  setThinking(false);
  apply(next, state);
}

async function newGame() {
  if (busy) return;
  const next = await api("/api/new", settings);
  seed = Math.floor(Math.random() * 2 ** 31);
  paint();
  apply(next, null);
}

$("#board").addEventListener("click", (e) => {
  const cell = e.target.closest("[data-cell]");
  if (cell && !cell.disabled) placePiece(Number(cell.dataset.cell));
});

$("#pieces").addEventListener("click", (e) => {
  const slot = e.target.closest("[data-piece]");
  if (slot && !slot.disabled) pick(Number(slot.dataset.piece));
});

$("#level").addEventListener("click", (e) => {
  const b = e.target.closest("[data-level]");
  if (b) { settings.level = b.dataset.level; render(); }
});

$("#first").addEventListener("click", (e) => {
  const b = e.target.closest("[data-first]");
  if (b) { settings.first = b.dataset.first; render(); }
});

$("#new-game").addEventListener("click", newGame);

(async () => {
  layout = chooseLayout();
  paint();
  state = await api("/api/state");
  settings.level = state.level;
  render();
})();
