// Fully unroll constant-bound `for (var X: u32 = A; X < B; X = X + S)` loops in a
// WGSL file so malioc reports TRUE total instruction cycles (malioc counts a loop
// body ONCE — per-iteration — so any runtime loop wildly under-reports cost).
// Innermost-first to fixpoint; each iteration wrapped in a `{}` block to avoid
// `let` redeclaration; loop var replaced by its literal value (word-boundary).
// Data-dependent branches (if/else) are left intact — malioc costs those fine.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2], dst = process.argv[3];
let s = readFileSync(src, 'utf8');
// NOTE: break/continue are stripped ONLY from the bodies of loops we actually
// unroll (done per-body in the unroll step below) — a break inside an unrolled
// loop would be orphaned. Loops left rolled (e.g. the outer safegcd loop, in
// SKIP) keep their break, so the early-exit is preserved.

// Resolve `const NAME: u32 = Nu;` so bounds like PK15_MAX_OUTER become literals.
const consts = {};
for (const m of s.matchAll(/const\s+(\w+)\s*:\s*u32\s*=\s*(\d+)u\s*;/g)) consts[m[1]] = parseInt(m[2], 10);
// Keep the OUTER safegcd loop rolled (malioc then reports per-outer-iteration
// cost; multiply by NUM_OUTER for the true total) — unrolling it 49x makes a
// 5 MB SPIR-V malioc can't process. Only inner loops (axby w<9, divstep) unroll.
const SKIP = new Set(['PK15_MAX_OUTER', 'BYL_NUM_OUTER', 'BY_NUM_OUTER', 'NUM_OUTER']);
const resolve = (tok) => { tok = tok.trim().replace(/u$/, ''); if (SKIP.has(tok)) return null; if (/^\d+$/.test(tok)) return parseInt(tok, 10); if (tok in consts) return consts[tok]; return null; };

function matchBrace(str, openIdx) { // openIdx points at '{'; return index after matching '}'
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) { if (str[i] === '{') depth++; else if (str[i] === '}') { depth--; if (depth === 0) return i + 1; } }
  return -1;
}

const FOR_RE = /for\s*\(\s*var\s+(\w+)\s*(?::\s*u32\s*)?=\s*([\w]+)\s*;\s*\1\s*<\s*([\w]+)\s*;\s*\1\s*=\s*\1\s*\+\s*([\w]+)\s*\)\s*\{/;

let pass = 0, total = 0;
for (;;) {
  // Find the LAST (innermost-biased) for-loop whose body has no nested `for`.
  let best = -1, bestM = null;
  const re = new RegExp(FOR_RE, 'g');
  let m;
  while ((m = re.exec(s)) !== null) {
    const headStart = m.index, braceOpen = m.index + m[0].length - 1;
    const bodyEnd = matchBrace(s, braceOpen);
    if (bodyEnd < 0) continue;
    const body = s.slice(braceOpen + 1, bodyEnd - 1);
    if (/\bfor\s*\(/.test(body)) continue;          // not innermost
    const A = resolve(m[2]), B = resolve(m[3]), S = resolve(m[4]);
    if (A === null || B === null || S === null) continue;  // non-constant bound, leave it
    best = headStart; bestM = { m, braceOpen, bodyEnd, body, A, B, S };
  }
  if (best < 0) break;
  const { m: mm, braceOpen, bodyEnd, A, B, S } = bestM;
  // This loop is innermost (no nested for) and IS being unrolled, so any
  // break/continue in its body belongs to it and must be dropped.
  const body = bestM.body.replace(/\bbreak\s*;/g, '').replace(/\bcontinue\s*;/g, '');
  const v = mm[1];
  let out = '';
  for (let k = A; k < B; k += S) {
    // negative lookbehind on '.' so a struct field named like the loop var
    // (e.g. Pk9.w vs loop var w) is NOT clobbered; only real uses are substituted.
    const inst = body.replace(new RegExp(`(?<!\\.)\\b${v}\\b`, 'g'), `${k}u`);
    out += `{${inst}}\n`;
    total++;
  }
  s = s.slice(0, best) + out + s.slice(bodyEnd);
  if (++pass > 2000) { console.error('unroll: too many passes'); break; }
}
// Const-fold integer arithmetic that substitution produced (e.g. acc[8u + 1u]
// -> acc[9u], g.w[8u >> 1u] -> g.w[4u]) so the OOB clamp below sees literals.
{
  let prev;
  do {
    prev = s;
    s = s.replace(/(\d+)u\s*>>\s*(\d+)u/g, (m, a, b) => `${(+a >>> +b)}u`);
    s = s.replace(/(\d+)u\s*<<\s*(\d+)u/g, (m, a, b) => `${((+a << +b) >>> 0)}u`);
    s = s.replace(/(\d+)u\s*\*\s*(\d+)u/g, (m, a, b) => `${(+a * +b)}u`);
    s = s.replace(/(\d+)u\s*&\s*(\d+)u/g, (m, a, b) => `${(+a & +b)}u`);
    s = s.replace(/(\d+)u\s*\+\s*(\d+)u/g, (m, a, b) => `${(+a + +b)}u`);
    s = s.replace(/(\d+)u\s*-\s*(\d+)u/g, (m, a, b) => `${Math.max(0, +a - +b)}u`);
  } while (s !== prev);
}
// Clamp constant array indices that unrolling pushed out of bounds in
// statically-dead guard branches (e.g. acc[w+1] -> acc[9u] when w==8). naga
// rejects literal OOB even in dead code; the index VALUE is cost-neutral for
// malioc, so clamp to a valid slot. .limbs -> NUM_WORDS-1; size-9 packed
// arrays (.w / acc / nb) -> 8.
// Size-aware: parse each array's DECLARED length so we only clamp genuinely
// out-of-bounds indices. (Hardcoding 9 wrongly clamped the 13-bit packed
// `w: array<u32,10>`'s valid index 9.)
const NW = consts['NUM_WORDS'] || 20;
const dim = (re, def) => { const m = s.match(re); return m ? parseInt(m[1]) : def; };
const WSZ = dim(/struct\s+\w+\s*\{\s*w\s*:\s*array<u32,\s*(\d+)/, 9);
const ACCSZ = dim(/var\s+acc\s*:\s*array<u32,\s*(\d+)/, 9);
const NBSZ = dim(/var\s+nb\s*:\s*array<u32,\s*(\d+)/, 9);
s = s.replace(/\.limbs\[(\d+)u\]/g, (m, n) => parseInt(n) >= NW ? `.limbs[${NW - 1}u]` : m);
s = s.replace(/\.w\[(\d+)u\]/g, (m, n) => parseInt(n) >= WSZ ? `.w[${WSZ - 1}u]` : m);
s = s.replace(/\bacc\[(\d+)u\]/g, (m, n) => parseInt(n) >= ACCSZ ? `acc[${ACCSZ - 1}u]` : m);
s = s.replace(/\bnb\[(\d+)u\]/g, (m, n) => parseInt(n) >= NBSZ ? `nb[${NBSZ - 1}u]` : m);
writeFileSync(dst, s);
console.log(`unrolled ${src.split('/').pop()} -> ${dst.split('/').pop()}: ${pass} loops expanded, ${total} bodies; remaining for-loops: ${(s.match(/for\s*\(/g) || []).length}`);
