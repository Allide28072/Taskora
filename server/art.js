// THE FLASH — original procedural artwork (SVG). No copyrighted assets anywhere.
import crypto from 'node:crypto';

function hashInt(s) {
  const h = crypto.createHash('md5').update(String(s)).digest();
  return h.readUInt32BE(0);
}
function rng(seed) {
  let a = (hashInt(String(seed)) || 1) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  ['#ff7a18', '#7c3aed', '#0b0d1a'], ['#00e5a0', '#086788', '#04121c'],
  ['#ff2e63', '#260c2e', '#12060f'], ['#ffd166', '#ef476f', '#160c1c'],
  ['#4cc9f0', '#4361ee', '#050b1e'], ['#b5179e', '#560bad', '#12061e'],
  ['#f72585', '#3a0ca3', '#0c0518'], ['#06d6a0', '#118ab2', '#04141a'],
  ['#e0aaff', '#7b2cbf', '#0f0718'], ['#ff9f1c', '#cb3311', '#170703'],
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rings(r, w, h, cx, cy, n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const rr = 20 + i * (Math.min(w, h) / (n * 2.2)) + r() * 18;
    out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="none" stroke="rgba(255,255,255,${(0.05 + r() * 0.1).toFixed(3)})" stroke-width="${(0.6 + r() * 1.6).toFixed(2)}"/>`;
  }
  return out;
}

function bolt(cx, cy, s, fill, op) {
  return `<path d="M${cx + 3 * s} ${cy - 8 * s} L${cx - 4 * s} ${cy + 1 * s} L${cx - 0.5 * s} ${cy + 1 * s} L${cx - 2.5 * s} ${cy + 8 * s} L${cx + 4 * s} ${cy - 2 * s} L${cx + 0.2 * s} ${cy - 2 * s} Z" fill="${fill}" opacity="${op}"/>`;
}

function waves(r, w, h, yBase, color) {
  let out = '';
  for (let i = 0; i < 3; i++) {
    const y = yBase - i * (18 + r() * 26);
    const a = 30 + r() * 50;
    out += `<path d="M0 ${y} Q ${w * 0.25} ${y - a} ${w * 0.5} ${y} T ${w} ${y} V ${h} H 0 Z" fill="${color}" opacity="${(0.10 + i * 0.06).toFixed(2)}"/>`;
  }
  return out;
}

function mountainridges(r, w, h, base, colors) {
  let out = '';
  for (let i = 0; i < 3; i++) {
    const y = base - i * 20 - r() * 30;
    let d = `M0 ${h} L0 ${y}`;
    const steps = 6 + Math.floor(r() * 4);
    for (let k = 1; k <= steps; k++) {
      const x = (w / steps) * k;
      const peak = y - r() * 60;
      d += ` L ${x - w / steps / 2} ${(y + peak) / 2} L ${x} ${y}`;
    }
    d += ` L ${w} ${h} Z`;
    out += `<path d="${d}" fill="${colors[i % colors.length]}" opacity="${0.35 + i * 0.2}"/>`;
  }
  return out;
}

/**
 * poster(seed, name, kind) → SVG string, 600×900
 * backdrop(seed, name, kind) → SVG string, 1600×900
 */
export function poster(seed, name = '', kind = 'movie') {
  const r = rng('poster:' + seed);
  const [c1, c2, bg] = PALETTES[hashInt('p' + seed) % PALETTES.length];
  const W = 600, H = 900;
  const cx = 120 + r() * 360, cy = 140 + r() * 260;

  let body = '';
  const mode = hashInt('m' + seed) % 3;
  if (mode === 0) body += rings(r, W, H, cx, cy, 7);
  else if (mode === 1) body += waves(r, W, H, H * 0.72, c1);
  else body += mountainridges(r, W, H, H * 0.68, [bg, c2, '#00000055']);

  // stars / sparks
  let stars = '';
  const nStars = 26 + Math.floor(r() * 30);
  for (let i = 0; i < nStars; i++) {
    const x = r() * W, y = r() * H * 0.85, rr = 0.5 + r() * 1.8;
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(2)}" fill="rgba(255,255,255,${(0.25 + r() * 0.65).toFixed(2)})"/>`;
  }

  const boltOp = 0.16 + r() * 0.2;
  const bx = 60 + r() * 120, by = H * 0.18 + r() * 120, bs = 5 + r() * 6;

  const initials = esc(String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'TF');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c2}"/><stop offset="0.55" stop-color="${bg}"/><stop offset="1" stop-color="#05060c"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.42" r="0.75">
    <stop offset="0" stop-color="${c1}" stop-opacity="0.85"/><stop offset="0.45" stop-color="${c1}" stop-opacity="0.22"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.88"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${body}${stars}
${bolt(bx, by, bs, '#ffffff', boltOp)}
<rect width="${W}" height="${H}" fill="url(#fade)"/>
<circle cx="${W / 2}" cy="${H * 0.42}" r="86" fill="rgba(8,9,18,0.55)" stroke="rgba(255,255,255,0.22)"/>
<text x="${W / 2}" y="${H * 0.42 + 16}" text-anchor="middle" font-family="Sora,Arial,sans-serif" font-weight="800" font-size="56" fill="rgba(255,255,255,0.92)" letter-spacing="4">${initials}</text>
</svg>`;
}

export function backdrop(seed, name = '', kind = 'movie') {
  const r = rng('backdrop:' + seed);
  const [c1, c2, bg] = PALETTES[hashInt('b' + seed) % PALETTES.length];
  const W = 1600, H = 900;
  const cx = 300 + r() * 1000, cy = 180 + r() * 300;

  let body = '';
  const mode = hashInt('bm' + seed) % 3;
  if (mode === 0) body += rings(r, W, H, cx, cy, 9);
  else if (mode === 1) body += waves(r, W, H, H * 0.78, c1);
  else body += mountainridges(r, W, H, H * 0.7, [bg, c2, '#00000066']);

  let stars = '';
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = r() * H * 0.9, rr = 0.5 + r() * 2.2;
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(2)}" fill="rgba(255,255,255,${(0.2 + r() * 0.6).toFixed(2)})"/>`;
  }

  const initials = esc(String(name).split(/\s+/).filter(Boolean).slice(0, 3).map(w => w[0]?.toUpperCase() || '').join('') || 'TF');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c2}"/><stop offset="0.5" stop-color="${bg}"/><stop offset="1" stop-color="#04050a"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.38" r="0.8">
    <stop offset="0" stop-color="${c1}" stop-opacity="0.8"/><stop offset="0.5" stop-color="${c1}" stop-opacity="0.18"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.9"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${body}${stars}
<rect width="${W}" height="${H}" fill="url(#fade)"/>
<text x="80" y="${H - 80}" font-family="Sora,Arial,sans-serif" font-weight="800" font-size="64" fill="rgba(255,255,255,0.16)" letter-spacing="18">${initials}</text>
</svg>`;
}

export function cover(seed, name = '') {
  return poster('novel:' + seed, name, 'novel');
}

export function still(seed) {
  const r = rng('still:' + seed);
  const [c1, c2, bg] = PALETTES[hashInt('s' + seed) % PALETTES.length];
  const W = 640, H = 360;
  let stars = '';
  for (let i = 0; i < 40; i++) {
    stars += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * H).toFixed(1)}" r="${(0.4 + r() * 1.4).toFixed(2)}" fill="rgba(255,255,255,${(0.2 + r() * 0.5).toFixed(2)})"/>`;
  }
  const bars = Array.from({ length: 9 }, (_, i) => {
    const bw = W / 9;
    const h = 30 + r() * 90;
    return `<rect x="${(i * bw + 6).toFixed(1)}" y="${(H - 24 - h).toFixed(1)}" width="${(bw - 12).toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${i % 2 ? c1 : c2}" opacity="${(0.25 + r() * 0.4).toFixed(2)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${bg}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>${stars}${bars}
<circle cx="${W / 2}" cy="${H / 2}" r="34" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
<path d="M${W / 2 - 8} ${H / 2 - 14} L${W / 2 + 16} ${H / 2} L${W / 2 - 8} ${H / 2 + 14} Z" fill="rgba(255,255,255,0.9)"/>
</svg>`;
}

/* ── anime key art ──────────────────────────────────────────────────────
 * Anime titles get their own cel-shaded key art instead of photography:
 * a burning horizon, sunburst, flat-colour mountain ranges, manga tone dots
 * and a lone figure on the ridge. Still fully generated, still original, so
 * an anime card never falls back to a photo that reads as live action.
 * ------------------------------------------------------------------- */
const ANIME_SKIES = [
  ['#2b1055', '#7597de', '#ffd9a0', '#120a24'],
  ['#0f2027', '#2c5364', '#ffb56b', '#06131a'],
  ['#1a2a6c', '#b21f1f', '#fdbb2d', '#160a12'],
  ['#3a1c71', '#d76d77', '#ffaf7b', '#1c0f22'],
  ['#10124a', '#4e54c8', '#a6e3ff', '#080a1e'],
  ['#42275a', '#734b6d', '#f7c59f', '#180d1c'],
  ['#0b3d3b', '#1f7a6f', '#ffe08a', '#06201e'],
];

function sunburst(r, cx, cy, radius, color, count) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a1 = (i / count) * Math.PI * 2 + r() * 0.05;
    const a2 = a1 + (0.012 + r() * 0.05);
    const len = radius * (0.75 + r() * 0.5);
    out += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} L${(cx + Math.cos(a1) * len).toFixed(1)} ${(cy + Math.sin(a1) * len).toFixed(1)} L${(cx + Math.cos(a2) * len).toFixed(1)} ${(cy + Math.sin(a2) * len).toFixed(1)} Z" fill="${color}" opacity="${(0.05 + r() * 0.09).toFixed(3)}"/>`;
  }
  return out;
}

/** Flat cel-shaded ridge line — sharp peaks, no gradients. */
function celRidge(r, w, h, baseY, colour, opacity, jag) {
  const steps = 5 + Math.floor(r() * 4);
  let d = `M0 ${h} L0 ${baseY.toFixed(1)}`;
  for (let k = 1; k <= steps; k++) {
    const x = (w / steps) * k;
    const peak = baseY - (0.35 + r() * 0.65) * jag;
    const mid = (baseY + peak) / 2;
    d += ` L ${(x - w / steps * 0.55).toFixed(1)} ${mid.toFixed(1)} L ${x.toFixed(1)} ${baseY.toFixed(1)}`;
  }
  d += ` L ${w} ${h} Z`;
  return `<path d="${d}" fill="${colour}" opacity="${opacity}"/>`;
}

/** A lone silhouette on the ridge — the classic anime poster figure. */
function silhouette(cx, groundY, scale, colour) {
  const s = scale;
  return `<g fill="${colour}">
    <circle cx="${cx.toFixed(1)}" cy="${(groundY - 62 * s).toFixed(1)}" r="${(13 * s).toFixed(1)}"/>
    <path d="M${(cx - 17 * s).toFixed(1)} ${groundY.toFixed(1)}
      L${(cx - 13 * s).toFixed(1)} ${(groundY - 46 * s).toFixed(1)}
      Q${cx.toFixed(1)} ${(groundY - 58 * s).toFixed(1)} ${(cx + 13 * s).toFixed(1)} ${(groundY - 46 * s).toFixed(1)}
      L${(cx + 17 * s).toFixed(1)} ${groundY.toFixed(1)} Z"/>
    <rect x="${(cx + 14 * s).toFixed(1)}" y="${(groundY - 58 * s).toFixed(1)}" width="${(26 * s).toFixed(1)}" height="${(3.4 * s).toFixed(1)}" rx="${(1.7 * s).toFixed(1)}" transform="rotate(-24 ${cx.toFixed(1)} ${(groundY - 56 * s).toFixed(1)})"/>
  </g>`;
}

function halftone(id, size) {
  return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.19}" fill="#ffffff"/>
  </pattern>`;
}

function animeArt(seed, kind, W, H) {
  const r = rng('anime:' + seed);
  const [deep, mid, warm, ink] = ANIME_SKIES[hashInt('an' + seed) % ANIME_SKIES.length];
  const horizon = H * (kind === 'poster' ? 0.63 : 0.68);
  const sunX = W * (0.28 + r() * 0.44);
  const sunY = horizon - H * (0.02 + r() * 0.06);
  const sunR = Math.min(W, H) * (kind === 'poster' ? 0.115 : 0.09);

  let sparkles = '';
  const nSparks = kind === 'poster' ? 34 : 70;
  for (let i = 0; i < nSparks; i++) {
    const x = r() * W, y = r() * horizon * 1.02, rad = 0.6 + r() * 2.1;
    sparkles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="#fff" opacity="${(0.25 + r() * 0.7).toFixed(2)}"/>`;
    if (r() > 0.86) {
      sparkles += `<path d="M${x.toFixed(1)} ${(y - rad * 3.4).toFixed(1)} L${(x + rad * 3.4).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + rad * 3.4).toFixed(1)} L${(x - rad * 3.4).toFixed(1)} ${y.toFixed(1)} Z" fill="#fff" opacity="${(0.25 + r() * 0.4).toFixed(2)}"/>`;
    }
  }

  const ridges =
    celRidge(r, W, H, horizon - H * 0.05, mid, 0.55, H * 0.10) +
    celRidge(r, W, H, horizon + H * 0.005, deep, 0.78, H * 0.085) +
    celRidge(r, W, H, horizon + H * 0.05, ink, 0.94, H * 0.06);

  const figure = silhouette(W * (0.20 + r() * 0.6), horizon + H * 0.075, (kind === 'poster' ? H : W) / 900, ink);

  return { r, deep, mid, warm, ink, horizon, sunX, sunY, sunR, sparkles, ridges, figure };
}

/** Poster-shaped anime key art (2:3). */
export function animePoster(seed) {
  const W = 600, H = 900;
  const a = animeArt(seed, 'poster', W, H);

  let speed = '';
  for (let i = 0; i < 12; i++) {
    const y = a.r() * H * 0.55, w = W * (0.1 + a.r() * 0.32), x = a.r() * W;
    speed += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(0.8 + a.r() * 3).toFixed(1)}" rx="1.6" fill="#fff" opacity="${(0.08 + a.r() * 0.16).toFixed(2)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${a.deep}"/><stop offset="0.42" stop-color="${a.mid}"/>
    <stop offset="0.78" stop-color="${a.warm}"/><stop offset="1" stop-color="${a.ink}"/>
  </linearGradient>
  <radialGradient id="bloom" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.45" stop-color="#ffe9b8" stop-opacity="0.45"/><stop offset="1" stop-color="#ffc46b" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.9"/>
  </linearGradient>
  ${halftone('tone', 13)}
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${sunburst(a.r, a.sunX, a.sunY, Math.max(W, H) * 0.9, a.warm, 54)}
<circle cx="${a.sunX.toFixed(1)}" cy="${a.sunY.toFixed(1)}" r="${(a.sunR * 3.1).toFixed(1)}" fill="url(#bloom)"/>
<circle cx="${a.sunX.toFixed(1)}" cy="${a.sunY.toFixed(1)}" r="${a.sunR.toFixed(1)}" fill="#fffdf5" opacity="0.96"/>
${a.sparkles}${speed}
${a.ridges}${a.figure}
<rect x="0" y="0" width="${W * 0.5}" height="${H * 0.3}" fill="url(#tone)" opacity="0.07"/>
<rect width="${W}" height="${H}" fill="url(#shade)"/>
<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
</svg>`;
}

/** Wide anime key art (16:9) for heroes and backdrops. */
export function animeBackdrop(seed) {
  const W = 1600, H = 900;
  const a = animeArt(seed, 'backdrop', W, H);

  let speed = '';
  for (let i = 0; i < 22; i++) {
    const y = a.r() * H * 0.5, w = W * (0.08 + a.r() * 0.3), x = a.r() * W;
    speed += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(1 + a.r() * 3.4).toFixed(1)}" rx="2" fill="#fff" opacity="${(0.06 + a.r() * 0.14).toFixed(2)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${a.deep}"/><stop offset="0.45" stop-color="${a.mid}"/>
    <stop offset="0.8" stop-color="${a.warm}"/><stop offset="1" stop-color="${a.ink}"/>
  </linearGradient>
  <radialGradient id="bloom" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.4" stop-color="#ffe9b8" stop-opacity="0.4"/><stop offset="1" stop-color="#ffc46b" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.92"/>
  </linearGradient>
  ${halftone('tone', 14)}
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${sunburst(a.r, a.sunX, a.sunY, Math.max(W, H) * 0.85, a.warm, 72)}
<circle cx="${a.sunX.toFixed(1)}" cy="${a.sunY.toFixed(1)}" r="${(a.sunR * 3.4).toFixed(1)}" fill="url(#bloom)"/>
<circle cx="${a.sunX.toFixed(1)}" cy="${a.sunY.toFixed(1)}" r="${a.sunR.toFixed(1)}" fill="#fffdf5" opacity="0.95"/>
${a.sparkles}${speed}
${a.ridges}${a.figure}
<rect x="0" y="0" width="${W * 0.42}" height="${H * 0.34}" fill="url(#tone)" opacity="0.06"/>
<rect width="${W}" height="${H}" fill="url(#shade)"/>
<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
</svg>`;
}

export function avatar(seed, name = '') {
  const r = rng('avatar:' + seed);
  const [c1, c2] = PALETTES[hashInt('a' + seed) % PALETTES.length];
  const initials = esc(String(name).split(/\s+/).filter(Boolean).slice(0, 1).map(w => w[0]?.toUpperCase() || '').join('') || 'F');
  const W = 240, H = 240;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="120" fill="url(#g)"/>
<circle cx="${60 + r() * 120}" cy="${60 + r() * 120}" r="${20 + r() * 40}" fill="rgba(255,255,255,0.18)"/>
<text x="${W / 2}" y="${H / 2 + 22}" text-anchor="middle" font-family="Sora,Arial,sans-serif" font-weight="800" font-size="88" fill="rgba(255,255,255,0.95)">${initials}</text>
</svg>`;
}
