// Shared dark-mode SVG drawing kit for the in-tree architecture diagrams.
// Attribute-based styling only (no <style>, scripts, or external refs) so the
// SVGs render identically as <img> on GitHub, VS Code preview, and any viewer.
//
// Extracted from gen_wgpu_diagrams.mjs so new generators (e.g.
// gen_msm_algo_diagrams.mjs) reuse one palette + primitive set rather than
// forking a parallel copy. State (the path list P) is module-global; call
// reset() before each diagram and svg() to emit it — diagrams are built
// sequentially.
//
// LaTeX math (placeTex / texPill / texBullet) is typeset with MathJax to
// inline glyph *paths* (fontCache:'none' — no <use>, no shared <defs>, so many
// equations embed in one parent SVG with no id collisions and no external
// fonts). MathJax is lazy-loaded from .build/node_modules only when a tex
// helper is first called, so generators that draw no math need it installed.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

export const BG = '#0b0e14',
  PANEL_STROKE = '#212a39',
  TXT = '#e6e9ef',
  MUT = '#9aa4b2';
export const ARROW = '#6b7688',
  ARROW_ACCENT = '#8aa0c0';
export const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const V = {
  blue: { s: '#4b9fff', f: '#0e1c30', t: '#a9ccff' },
  green: { s: '#34d399', f: '#0c2620', t: '#7be9c0' },
  purple: { s: '#a78bfa', f: '#1b1633', t: '#c9bafd' },
  amber: { s: '#f5b544', f: '#271e10', t: '#fbd38d' },
  red: { s: '#f87171', f: '#2a1416', t: '#fca5a5' },
  teal: { s: '#2dd4bf', f: '#0c2422', t: '#69ecd7' },
  slate: { s: '#5a6683', f: '#12161f', t: '#c3ccdb' },
};

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// deliberately conservative widths (wider than Liberation/Arial/SFMono) so a
// heavier browser font still fits inside the box.
export const tw = (s, fs, mono = false) => s.length * fs * (mono ? 0.635 : 0.58);
let P = [];
export const push = s => P.push(s);

function markerDefs(colors) {
  let d = '<defs>';
  for (const c of colors) {
    const id = c.replace('#', '');
    // `ah<color>` = default head; `ahs<color>` = small head (arrow({head:'small'})).
    d += `<marker id="ah${id}" viewBox="0 0 12 12" refX="9.4" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0.5,0.5 L12,6 L0.5,11.5 L4,6 Z" fill="${c}"/></marker>`;
    d += `<marker id="ahs${id}" viewBox="0 0 12 12" refX="9.4" refY="6" markerWidth="6.4" markerHeight="6.4" orient="auto-start-reverse"><path d="M0.5,0.5 L12,6 L0.5,11.5 L4,6 Z" fill="${c}"/></marker>`;
  }
  return d + '</defs>';
}
export function bgRect(w, h) {
  push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${BG}"/>`);
  push(`<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="16" fill="none" stroke="${PANEL_STROKE}"/>`);
}
export function heading(x, y, text, color = MUT, size = 11.5, spacing = 2) {
  push(
    `<text x="${x}" y="${y}" font-family="${SANS}" font-size="${size}" font-weight="700" letter-spacing="${spacing}" fill="${color}">${esc(text.toUpperCase())}</text>`,
  );
}
export function plain(x, y, text, { color = MUT, size = 12.5, weight = 400, anchor = 'start', mono = false } = {}) {
  push(
    `<text x="${x}" y="${y}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(text)}</text>`,
  );
}
export function title(x, y, main, sub) {
  push(
    `<text x="${x}" y="${y}" font-family="${SANS}" font-size="17" font-weight="700" fill="${TXT}">${esc(main)}</text>`,
  );
  if (sub) push(`<text x="${x}" y="${y + 19}" font-family="${SANS}" font-size="12.5" fill="${MUT}">${esc(sub)}</text>`);
}
export function region(x, y, w, h, { label, color = V.slate, dash = true } = {}) {
  push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${color.f}" fill-opacity="0.32" stroke="${color.s}"${dash ? ' stroke-dasharray="6 5"' : ''}/>`,
  );
  if (label) heading(x + 16, y + 22, label, color.s);
}
export function card(
  x,
  y,
  w,
  h,
  { tag, lines = [], variant = V.blue, star = false, tagSize = 13.5, center = false } = {},
) {
  push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11" fill="${variant.f}" stroke="${variant.s}" stroke-width="${star ? 2.2 : 1.4}"/>`,
  );
  if (!center) push(`<path d="M${x + 3},${y + 9} a6,6 0 0 1 5,-6 v${h - 6} a6,6 0 0 1 -5,-6 Z" fill="${variant.s}"/>`);
  const cx = center ? x + w / 2 : x + 16;
  const anchor = center ? ' text-anchor="middle"' : '';
  let ty = y + (lines.length ? 25 : Math.round(h / 2) + 5);
  push(
    `<text x="${cx}" y="${ty}"${anchor} font-family="${MONO}" font-size="${tagSize}" font-weight="600" fill="${variant.t}">${esc((star ? '★ ' : '') + tag)}</text>`,
  );
  ty += 18;
  for (const ln of lines) {
    push(`<text x="${cx}" y="${ty}"${anchor} font-family="${SANS}" font-size="11" fill="${MUT}">${esc(ln)}</text>`);
    ty += 16;
  }
  const PAD = center ? 16 : 30; // left inset (16) + comfortable right margin
  const need = tw((star ? '★ ' : '') + tag, tagSize, true) + PAD;
  if (need > w) console.warn(`  ! tag overflow "${tag}": ${Math.round(need)} > ${w}`);
  for (const ln of lines) {
    const n = tw(ln, 11) + PAD;
    if (n > w) console.warn(`  ! line overflow "${ln}": ${Math.round(n)} > ${w}`);
  }
  return {
    x,
    y,
    w,
    h,
    cx: x + w / 2,
    cy: y + h / 2,
    top: { x: x + w / 2, y },
    bot: { x: x + w / 2, y: y + h },
    left: { x, y: y + h / 2 },
    right: { x: x + w, y: y + h / 2 },
    tr: { x: x + w - 15, y: y + 15 },
  };
}
export function labelPill(x, y, text, color = MUT) {
  const w = tw(text, 11) + 16;
  push(`<rect x="${x - w / 2}" y="${y - 9.5}" width="${w}" height="19" rx="9" fill="${BG}" stroke="${PANEL_STROKE}"/>`);
  push(
    `<text x="${x}" y="${y + 3.8}" font-family="${SANS}" font-size="11" fill="${color}" text-anchor="middle">${esc(text)}</text>`,
  );
}
export function arrow(a, b, { color = ARROW, dashed = false, label, elbow, mid = 0.5, lx, ly, width = 1.9, head } = {}) {
  let d;
  if (elbow === 'v') {
    const my = a.y + (b.y - a.y) * mid;
    d = `M${a.x},${a.y} L${a.x},${my} L${b.x},${my} L${b.x},${b.y}`;
  } else if (elbow === 'h') {
    const mx = a.x + (b.x - a.x) * mid;
    d = `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`;
  } else d = `M${a.x},${a.y} L${b.x},${b.y}`;
  const mk = head === 'small' ? 'ahs' : 'ah';
  push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${mk}${color.replace('#', '')})"/>`,
  );
  if (label) labelPill(lx ?? (a.x + b.x) / 2, ly ?? (a.y + b.y) / 2, label);
}
export function poly(pts, { color = ARROW, dashed = false, label, lx, ly, width = 1.9, head } = {}) {
  const d = 'M' + pts.map(p => `${p.x},${p.y}`).join(' L');
  const mk = head === 'small' ? 'ahs' : 'ah';
  push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${mk}${color.replace('#', '')})"/>`,
  );
  if (label) labelPill(lx, ly, label);
}
export function stepDot(x, y, n, color = ARROW_ACCENT) {
  push(`<circle cx="${x}" cy="${y}" r="10.5" fill="${BG}" stroke="${color}" stroke-width="1.7"/>`);
  push(
    `<text x="${x}" y="${y + 4}" font-family="${SANS}" font-size="12" font-weight="700" fill="${color}" text-anchor="middle">${n}</text>`,
  );
}
export function mathPill(x, y, text, { color = V.slate, size = 13 } = {}) {
  // A rounded pill holding a short (pseudo-)LaTeX identity, monospace.
  const w = tw(text, size, true) + 26;
  push(
    `<rect x="${x - w / 2}" y="${y - 15}" width="${w}" height="30" rx="8" fill="${color.f}" stroke="${color.s}" stroke-width="1.2"/>`,
  );
  push(
    `<text x="${x}" y="${y + 5}" font-family="${MONO}" font-size="${size}" fill="${color.t}" text-anchor="middle">${esc(text)}</text>`,
  );
}
export function bulletList(x, y, items, dh, accent) {
  let cy = y;
  for (const [t, s] of items) {
    push(`<circle cx="${x}" cy="${cy - 4}" r="3.5" fill="${accent}"/>`);
    plain(x + 16, cy, t, { color: V.slate.t, size: 12.5, weight: 600, mono: true });
    plain(x + 16, cy + 16, s, { color: MUT, size: 11 });
    cy += dh;
  }
}
// ---- LaTeX → SVG (MathJax, lazy) --------------------------------------------
let _conv = null;
function converter() {
  if (_conv) return _conv;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const req = createRequire(path.join(here, '.build', 'resolve.cjs'));
  const { mathjax } = req('mathjax-full/js/mathjax.js');
  const { TeX } = req('mathjax-full/js/input/tex.js');
  const { SVG } = req('mathjax-full/js/output/svg.js');
  const { liteAdaptor } = req('mathjax-full/js/adaptors/liteAdaptor.js');
  const { RegisterHTMLHandler } = req('mathjax-full/js/handlers/html.js');
  req('mathjax-full/js/input/tex/AllPackages.js');
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document('', {
    InputJax: new TeX({ packages: ['base', 'ams'] }),
    OutputJax: new SVG({ fontCache: 'none' }),
  });
  _conv = (latex, display) => adaptor.innerHTML(doc.convert(latex, { display }));
  return _conv;
}
function renderTex(latex, display) {
  const s = converter()(latex, display);
  return {
    wEx: parseFloat(s.match(/width="([\d.]+)ex"/)[1]),
    hEx: parseFloat(s.match(/height="([\d.]+)ex"/)[1]),
    viewBox: s.match(/viewBox="([^"]+)"/)[1],
    inner: s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
  };
}
// Emit a typeset equation. `ex` is px-per-ex (the font size). anchor 'center'
// centres the math box on (x, y); 'left' puts its left edge at x, centred
// vertically on y. Returns the rendered {w, h} in px.
export function placeTex(
  x,
  y,
  latex,
  { color = TXT, ex = 9, display = false, anchor = 'center', maxW = Infinity } = {},
) {
  const r = renderTex(latex, display);
  let e = ex;
  if (r.wEx * e > maxW) e = maxW / r.wEx;
  const w = r.wEx * e,
    h = r.hEx * e;
  const px = anchor === 'left' ? x : x - w / 2;
  const colored = r.inner.replace(/currentColor/g, color);
  push(
    `<svg x="${px.toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${r.viewBox}" preserveAspectRatio="xMidYMid meet">${colored}</svg>`,
  );
  return { w, h };
}
// A rounded pill sized to a centred equation — the LaTeX analogue of a labelled
// chip on the flow spine.
export function texPill(cx, cy, latex, { color = V.slate, ex = 9, maxW = 640, padX = 18, minH = 30 } = {}) {
  const r = renderTex(latex, false);
  let e = ex;
  const avail = maxW - 2 * padX;
  if (r.wEx * e > avail) e = avail / r.wEx;
  const mw = r.wEx * e,
    mh = r.hEx * e;
  const w = mw + 2 * padX,
    h = Math.max(minH, mh + 12);
  push(
    `<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="8" fill="${color.f}" stroke="${color.s}" stroke-width="1.2"/>`,
  );
  const colored = r.inner.replace(/currentColor/g, color.t);
  push(
    `<svg x="${(cx - mw / 2).toFixed(1)}" y="${(cy - mh / 2).toFixed(1)}" width="${mw.toFixed(1)}" height="${mh.toFixed(1)}" viewBox="${r.viewBox}" preserveAspectRatio="xMidYMid meet">${colored}</svg>`,
  );
  return { w, h };
}
// A bullet row whose label is a typeset equation and whose caption is plain text.
export function texBullet(x, y, latex, caption, accent, { ex = 8.5, labelColor = V.slate.t } = {}) {
  push(`<circle cx="${x}" cy="${y - 4}" r="3.5" fill="${accent}"/>`);
  placeTex(x + 16, y - 1, latex, { color: labelColor, ex, anchor: 'left' });
  plain(x + 16, y + 17, caption, { color: MUT, size: 11 });
}
export function svg(w, h, colors) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">` +
    markerDefs(colors) +
    P.join('') +
    '</svg>'
  );
}
export function reset() {
  P = [];
}
