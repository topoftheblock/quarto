// Generative studio: a decaying painter's atelier, redrawn from a new seed every game.
// Everything is SVG built from seeded randomness, so each game gets its own room.

function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function painter(rng) {
  const r = (a, b) => a + rng() * (b - a);
  return { rng, r, pick: (list) => list[Math.floor(rng() * list.length)], n: (v) => v.toFixed(1) };
}

const PAINT = {
  flesh: ["#e7b29b", "#f0c3a8", "#d99e88", "#eab7a6", "#e9c1a2"],
  stroke: ["#f6efe6", "#8fa7c6", "#5b4a94", "#d77a88", "#e7b29b", "#c7cfa0", "#3d3a78"],
  shadow: ["#5b4a94", "#3d3a78", "#6f8bb0", "#8a4a6a"],
  dark: ["#161b2a", "#1e1626", "#141c1e", "#231a14"],
  swatch: ["#e5652b", "#c2306b", "#5b4a94", "#2f6fb0", "#3c8a5a", "#f3ece2", "#141014", "#e7b29b", "#d8b23a", "#8a1f2a", "#9fb7c9", "#d77a88"],
  paper: ["#d9d0bd", "#c4b9a2", "#e6dfcf", "#b8ab92", "#a99c84"],
};

// Twist the paint with low-frequency noise, then streak it like a dry brush.
function torque(id, p, scale) {
  return `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence id="${id}-noise" type="fractalNoise" baseFrequency="${p.r(.005, .014).toFixed(4)} ${p.r(.018, .045).toFixed(4)}"
      numOctaves="3" seed="${Math.floor(p.r(0, 999))}"/>
    <feDisplacementMap in="SourceGraphic" scale="${p.n(scale)}" xChannelSelector="R" yChannelSelector="G" result="torqued"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.02 0.6" numOctaves="2" seed="${Math.floor(p.r(0, 999))}" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.7 0 0 0 -0.15" result="dry"/>
    <feComposite in="torqued" in2="dry" operator="in"/>
  </filter>`;
}

function strokes(p, count, box, width = [4, 18], opacity = [.45, .9]) {
  const [x0, y0, x1, y1] = box;
  const pt = () => `${p.n(p.r(x0, x1))} ${p.n(p.r(y0, y1))}`;
  return Array.from({ length: count }, () =>
    `<path d="M${pt()} C${pt()} ${pt()} ${pt()}" stroke="${p.pick(PAINT.stroke)}"
      stroke-width="${p.n(p.r(...width))}" opacity="${p.r(...opacity).toFixed(2)}"/>`).join("");
}

// A torqued head and shoulders in a 200x250 box.
function paintHead(rng, id) {
  const p = painter(rng);
  const cx = p.r(90, 110), cy = p.r(95, 110), rx = p.r(38, 54), ry = p.r(50, 66);
  const tilt = p.r(-24, 24), flip = rng() < 0.5 ? "translate(200 0) scale(-1 1)" : "";
  const mouthY = cy + ry * p.r(.3, .55), mouthW = p.r(14, 34);
  return `<defs>${torque(id, p, p.r(20, 44))}</defs>
    <g filter="url(#${id})" stroke-linecap="round">
      <g transform="${flip} rotate(${p.n(tilt)} ${p.n(cx)} ${p.n(cy)})">
        <path d="M14 250 C24 ${p.n(p.r(185, 205))} 60 ${p.n(p.r(168, 180))} 100 170 C140 ${p.n(p.r(168, 180))} 176 ${p.n(p.r(185, 205))} 186 250 Z" fill="${p.pick(PAINT.dark)}"/>
        <path d="M76 178 L100 ${p.n(p.r(196, 214))} L126 176" stroke="#f3efe8" stroke-width="${p.n(p.r(5, 11))}" fill="none"/>
        <path d="M${p.n(cx - 16)} ${p.n(cy + ry * .7)} L${p.n(cx - 14)} 180 L${p.n(cx + 16)} 180 L${p.n(cx + 18)} ${p.n(cy + ry * .7)} Z" fill="${p.pick(PAINT.flesh)}" opacity=".85"/>
        <ellipse cx="${p.n(cx)}" cy="${p.n(cy)}" rx="${p.n(rx)}" ry="${p.n(ry)}" fill="${p.pick(PAINT.flesh)}"/>
        <ellipse cx="${p.n(cx + rx * p.r(.3, .6))}" cy="${p.n(cy + p.r(-10, 10))}" rx="${p.n(rx * p.r(.4, .65))}" ry="${p.n(ry * p.r(.7, .95))}" fill="${p.pick(PAINT.shadow)}" opacity="${p.r(.55, .85).toFixed(2)}"/>
        <ellipse cx="${p.n(cx - rx * .4)}" cy="${p.n(cy + ry * .25)}" rx="${p.n(p.r(12, 22))}" ry="${p.n(p.r(10, 18))}" fill="#d77a88" opacity="${p.r(.4, .8).toFixed(2)}"/>
        <path d="M${p.n(cx - rx)} ${p.n(cy - ry * .5)} C${p.n(cx - rx * .4)} ${p.n(cy - ry * 1.4)} ${p.n(cx + rx * .8)} ${p.n(cy - ry * 1.3)} ${p.n(cx + rx)} ${p.n(cy - ry * .4)}" fill="#24181c" opacity="${p.r(.6, 1).toFixed(2)}"/>
        <ellipse cx="${p.n(cx - rx * .3)}" cy="${p.n(cy - ry * .1)}" rx="${p.n(p.r(4, 8))}" ry="${p.n(p.r(3, 5))}" fill="#14090e"/>
        <path d="M${p.n(cx - mouthW / 2)} ${p.n(mouthY)} C${p.n(cx - 4)} ${p.n(mouthY + p.r(0, 14))} ${p.n(cx + 4)} ${p.n(mouthY + p.r(0, 14))} ${p.n(cx + mouthW / 2)} ${p.n(mouthY - p.r(0, 8))}"
          stroke="#3a0f1c" stroke-width="${p.n(p.r(4, 11))}" fill="none"/>
        <g fill="none">${strokes(p, 3 + Math.floor(rng() * 4), [cx - rx * 1.3, cy - ry, cx + rx * 1.3, cy + ry])}</g>
      </g>
    </g>`;
}

// Broad swaths of paint for the canvas on the easel, behind the board.
function paintSwaths(rng) {
  const p = painter(rng);
  return `<svg viewBox="0 0 200 200" preserveAspectRatio="none">
    <defs>${torque("torque-swaths", p, p.r(28, 50))}</defs>
    <g filter="url(#torque-swaths)" fill="none" stroke-linecap="round">${strokes(p, 3 + Math.floor(rng() * 3), [-20, -20, 220, 220], [22, 46], [.22, .5])}</g>
  </svg>`;
}

// --- The room ------------------------------------------------------------------------

function wall(p, L) {
  const stains = Array.from({ length: 7 }, () =>
    `<ellipse cx="${p.n(p.r(0, L.w))}" cy="${p.n(p.r(0, L.floor))}" rx="${p.n(p.r(60, 260))}" ry="${p.n(p.r(80, 320))}"
      fill="${p.pick(["#2a221c", "#4a3a26", "#1c1a1e"])}" opacity="${p.r(.15, .4).toFixed(2)}"/>`).join("");
  const cracks = Array.from({ length: 5 }, () => {
    let x = p.r(0, L.w), y = p.r(0, L.floor * .8);
    let d = `M${p.n(x)} ${p.n(y)}`;
    for (let i = 0; i < 9; i++) { x += p.r(-30, 30); y += p.r(6, 34); d += ` L${p.n(x)} ${p.n(y)}`; }
    return `<path d="${d}" stroke="#15110e" stroke-width="${p.n(p.r(.8, 2))}" fill="none" opacity=".7"/>`;
  }).join("");
  return `
    <rect width="${L.w}" height="${L.floor}" fill="url(#wall-tone)"/>
    <g filter="url(#blur-40)">${stains}</g>
    <rect width="${L.w}" height="${L.floor}" filter="url(#plaster)" opacity=".55"/>
    ${cracks}
    <rect y="${L.floor - 14}" width="${L.w}" height="14" fill="#1e1915"/>`;
}

// Test dabs of colour scraped onto the wall, clustered like a working palette.
function swatches(p, L, avoid) {
  const free = (x, y) => !avoid.some(([ax, ay, aw, ah]) => x > ax - 20 && x < ax + aw + 20 && y > ay - 20 && y < ay + ah + 20);
  const clusters = Array.from({ length: 4 }, () => [p.r(40, L.w - 40), p.r(60, L.floor - 80)]);
  let out = "";
  for (let i = 0; i < 160; i++) {
    const [cx, cy] = p.pick(clusters);
    const x = cx + p.r(-160, 160), y = cy + p.r(-140, 140);
    if (y < 10 || y > L.floor - 20 || !free(x, y)) continue;
    const w = p.r(8, 46), h = p.r(5, 22);
    out += `<rect x="${p.n(x)}" y="${p.n(y)}" width="${p.n(w)}" height="${p.n(h)}" rx="${p.n(h / 2)}"
      transform="rotate(${p.n(p.r(-40, 40))} ${p.n(x)} ${p.n(y)})" fill="${p.pick(PAINT.swatch)}" opacity="${p.r(.55, .95).toFixed(2)}"/>`;
  }
  return `<g filter="url(#dab)">${out}</g>`;
}

function bulb(L) {
  const [x, y] = L.bulb;
  return `
    <line x1="${x}" y1="0" x2="${x}" y2="${y - 24}" stroke="#0c0a09" stroke-width="2"/>
    <rect x="${x - 8}" y="${y - 26}" width="16" height="14" fill="#2b2420"/>
    <path d="M${x} ${y - 14} C${x - 20} ${y - 8} ${x - 20} ${y + 22} ${x} ${y + 28} C${x + 20} ${y + 22} ${x + 20} ${y - 8} ${x} ${y - 14} Z" fill="#fff6d6" class="bulb-glass"/>`;
}

function mirror(p, L, rng) {
  if (!L.mirror) return "";
  const [cx, cy, r] = L.mirror;
  return `
    <defs>
      <clipPath id="mirror-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <radialGradient id="mirror-glass" cx=".35" cy=".3"><stop offset="0" stop-color="#7c8794"/><stop offset="1" stop-color="#1d2228"/></radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy + 8}" r="${r + 10}" fill="#000" opacity=".45" filter="url(#blur-12)"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 9}" fill="#3a332b"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#mirror-glass)"/>
    <g clip-path="url(#mirror-clip)" opacity=".8">
      <svg x="${cx - r * 1.05}" y="${cy - r * .9}" width="${r * 2.1}" height="${r * 2.4}" viewBox="0 0 200 250">${paintHead(rng, "torque-mirror")}</svg>
      <circle cx="${cx + r * .45}" cy="${cy - r * .55}" r="${r * .16}" fill="#fff4d0" opacity=".55" filter="url(#blur-12)"/>
      <rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="#6d7f93" opacity=".22"/>
    </g>
    <path d="M${cx - r * .7} ${cy - r * .5} Q${cx - r * .2} ${cy - r * .95} ${cx + r * .3} ${cy - r * .85}" stroke="#fff" stroke-width="3" opacity=".25" fill="none"/>`;
}

function leaningCanvas(p, L, rng) {
  const [x, y, w, h, tilt] = L.machine;
  return `
    <g transform="rotate(${tilt} ${x + w / 2} ${y + h})">
      <polygon points="${x + 10},${y + h} ${x + w + 26},${y + h + 6} ${x + w + 4},${y + 20}" fill="#000" opacity=".4" filter="url(#blur-12)"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#bcae92"/>
      <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" fill="#0a090b"/>
      <svg x="${x + 6}" y="${y + h * .1}" width="${w - 12}" height="${h * .88}" viewBox="0 0 200 250" id="machine-head">${paintHead(rng, "torque-head")}</svg>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#8a7d64" stroke-width="2"/>
    </g>`;
}

function easel(L) {
  const [x, y, w, h] = L.board;
  const cx = x + w / 2, foot = L.h + 20;
  return `
    <g stroke-linecap="square">
      <line x1="${cx}" y1="${y - 60}" x2="${cx}" y2="${foot}" stroke="#2a1d14" stroke-width="16"/>
      <line x1="${cx - 30}" y1="${y - 50}" x2="${x - 30}" y2="${foot}" stroke="#3d2a1b" stroke-width="18"/>
      <line x1="${cx + 30}" y1="${y - 50}" x2="${x + w + 30}" y2="${foot}" stroke="#3d2a1b" stroke-width="18"/>
      <rect x="${x - 24}" y="${y + h + 4}" width="${w + 48}" height="16" fill="#4a3322"/>
      <rect x="${x - 24}" y="${y + h + 4}" width="${w + 48}" height="4" fill="#6b4c33"/>
      <rect x="${cx - 14}" y="${y - 34}" width="28" height="30" fill="#4a3322"/>
    </g>`;
}

function stool(L) {
  const [x, y] = L.stool, w = L.stoolWidth;
  return `
    <g>
      <line x1="${x - w * .35}" y1="${y}" x2="${x - w * .5}" y2="${y + w * 1.1}" stroke="#2c1f15" stroke-width="9"/>
      <line x1="${x + w * .35}" y1="${y}" x2="${x + w * .5}" y2="${y + w * 1.1}" stroke="#2c1f15" stroke-width="9"/>
      <line x1="${x}" y1="${y}" x2="${x + w * .05}" y2="${y + w * 1.2}" stroke="#20160f" stroke-width="8"/>
      <ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${w * .14}" fill="#5a3e28"/>
      <ellipse cx="${x - w * .1}" cy="${y - 2}" rx="${w * .2}" ry="${w * .05}" fill="#c2306b" opacity=".7" filter="url(#dab)"/>
    </g>`;
}

function shelf(p, L) {
  const [x, y, w, h] = L.shelf;
  const row = h / 4;
  let planks = "";
  for (let i = 1; i <= 4; i++) {
    const py = y + row * i;
    planks += `<rect x="${x - 10}" y="${p.n(py - 6 + p.r(-2, 2))}" width="${w + 20}" height="12" fill="#4a3424" transform="rotate(${p.n(p.r(-.8, .8))} ${x + w / 2} ${py})"/>
      <rect x="${x - 10}" y="${py - 6}" width="${w + 20}" height="3" fill="#6d5038"/>`;
  }
  const smears = Array.from({ length: 12 }, () =>
    `<rect x="${p.n(p.r(x, x + w))}" y="${p.n(p.r(y, y + h))}" width="${p.n(p.r(10, 40))}" height="${p.n(p.r(4, 10))}" fill="${p.pick(PAINT.swatch)}" opacity=".7"/>`).join("");
  return `
    <rect x="${x - 6}" y="${y}" width="${w + 12}" height="${h + 6}" fill="#120e0c" opacity=".55"/>
    <rect x="${x - 18}" y="${y - 10}" width="12" height="${L.h - y + 10}" fill="#3a291c"/>
    <rect x="${x + w + 6}" y="${y - 10}" width="12" height="${L.h - y + 10}" fill="#3a291c"/>
    ${planks}
    <g filter="url(#dab)">${smears}</g>`;
}

// The floor is buried: torn photographs, newsprint, books, tubes, rags and brushes.
function debris(p, L, front) {
  const depth = L.h - L.floor;
  const items = [];
  const count = front ? 26 : 150;
  for (let i = 0; i < count; i++) {
    const y = front ? L.floor + depth * p.r(.82, 1.02) : L.floor + depth * Math.pow(p.rng(), .8);
    const x = p.r(-40, L.w + 40);
    const s = .5 + (y - L.floor) / depth; // nearer is larger
    items.push([y, debrisItem(p, x, y, s)]);
  }
  return items.sort((a, b) => a[0] - b[0]).map(([, svg]) => svg).join("");
}

function debrisItem(p, x, y, s) {
  const rot = `rotate(${p.n(p.r(-50, 50))} ${p.n(x)} ${p.n(y)})`;
  const kind = p.rng();
  if (kind < .5) {
    // Torn sheet: newsprint, a photograph of a smeared face, or bare paper.
    const w = p.r(40, 110) * s, h = p.r(30, 80) * s * .55;
    const jag = () => p.r(-6, 6) * s;
    const pts = [[x - w / 2 + jag(), y - h / 2 + jag()], [x + w / 2 + jag(), y - h / 2 + jag()], [x + w / 2 + jag(), y + h / 2 + jag()], [x - w / 2 + jag(), y + h / 2 + jag()]]
      .map(([a, b]) => `${p.n(a)},${p.n(b)}`).join(" ");
    let inner = "";
    const sort = p.rng();
    if (sort < .35) {
      inner = `<rect x="${p.n(x - w * .4)}" y="${p.n(y - h * .4)}" width="${p.n(w * .8)}" height="${p.n(h * .8)}" fill="#3b3836"/>
        <ellipse cx="${p.n(x + p.r(-5, 5) * s)}" cy="${p.n(y - h * .05)}" rx="${p.n(w * .14)}" ry="${p.n(h * .3)}" fill="#8d8781" filter="url(#dab)"/>`;
    } else if (sort < .7) {
      for (let k = 0; k < 5; k++) {
        inner += `<line x1="${p.n(x - w * .4)}" x2="${p.n(x + w * p.r(0, .4))}" y1="${p.n(y - h * .35 + k * h * .17)}" y2="${p.n(y - h * .35 + k * h * .17)}" stroke="#5c564c" stroke-width="${p.n(1.4 * s)}"/>`;
      }
    }
    return `<g transform="${rot}"><polygon points="${pts}" fill="${p.pick(PAINT.paper)}"/>${inner}</g>`;
  }
  if (kind < .62) {
    const w = p.r(50, 80) * s, h = p.r(12, 22) * s;
    return `<rect x="${p.n(x)}" y="${p.n(y)}" width="${p.n(w)}" height="${p.n(h)}" fill="${p.pick(["#3a2a2a", "#1f2a33", "#4a3a20", "#2b2b2b"])}" transform="${rot}"/>`;
  }
  if (kind < .76) {
    const w = p.r(26, 40) * s, h = 8 * s;
    return `<g transform="${rot}"><rect x="${p.n(x)}" y="${p.n(y)}" width="${p.n(w)}" height="${p.n(h)}" rx="${p.n(h / 3)}" fill="${p.pick(["#c9c4bb", "#9a9590"])}"/>
      <rect x="${p.n(x + w * .2)}" y="${p.n(y)}" width="${p.n(w * .45)}" height="${p.n(h)}" fill="${p.pick(PAINT.swatch)}"/>
      <rect x="${p.n(x + w)}" y="${p.n(y + h * .2)}" width="${p.n(5 * s)}" height="${p.n(h * .6)}" fill="#111"/></g>`;
  }
  if (kind < .88) {
    const r = p.r(18, 40) * s;
    const d = Array.from({ length: 7 }, (_, k) => {
      const a = (k / 7) * Math.PI * 2, rr = r * p.r(.6, 1.2);
      return `${k ? "L" : "M"}${p.n(x + Math.cos(a) * rr)} ${p.n(y + Math.sin(a) * rr * .5)}`;
    }).join(" ") + "Z";
    return `<path d="${d}" fill="${p.pick(PAINT.swatch)}" opacity=".85" filter="url(#dab)"/>`;
  }
  const len = p.r(60, 120) * s;
  return `<g transform="${rot}"><line x1="${p.n(x)}" y1="${p.n(y)}" x2="${p.n(x + len)}" y2="${p.n(y)}" stroke="#5a3d26" stroke-width="${p.n(4 * s)}"/>
    <line x1="${p.n(x + len)}" y1="${p.n(y)}" x2="${p.n(x + len + 14 * s)}" y2="${p.n(y)}" stroke="${p.pick(PAINT.swatch)}" stroke-width="${p.n(7 * s)}" stroke-linecap="round"/></g>`;
}

function paintStudio(L, seed) {
  const rng = seededRandom(seed);
  const p = painter(rng);
  const avoid = [L.status, L.board, L.shelf, L.machine.slice(0, 4)];
  if (L.mirror) avoid.push([L.mirror[0] - L.mirror[2], L.mirror[1] - L.mirror[2], L.mirror[2] * 2, L.mirror[2] * 2]);
  return `<svg viewBox="0 0 ${L.w} ${L.h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wall-tone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${p.pick(["#6a6157", "#5f5a52", "#6b5f50"])}"/><stop offset="1" stop-color="#3a342e"/>
      </linearGradient>
      <linearGradient id="floor-tone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a231d"/><stop offset="1" stop-color="#14100d"/>
      </linearGradient>
      <filter id="plaster"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${Math.floor(p.r(0, 99))}"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 .9"/></filter>
      <filter id="dab" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.3" numOctaves="2" seed="4"/>
        <feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="blur-40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
      <filter id="blur-12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
    </defs>
    ${wall(p, L)}
    ${swatches(p, L, avoid)}
    ${mirror(p, L, rng)}
    <rect y="${L.floor}" width="${L.w}" height="${L.h - L.floor}" fill="url(#floor-tone)"/>
    ${debris(p, L, false)}
    ${shelf(p, L)}
    ${leaningCanvas(p, L, rng)}
    ${easel(L)}
    ${stool(L)}
    ${debris(p, L, true)}
    ${bulb(L)}
  </svg>`;
}
