// Proving harness for the RNS basis + committed data file.
// Run:  node dev/msm-webgpu/rns_params.test.mjs   (exits non-zero on any failure)
//
// Asserts three things:
//   1. The full RNS-Montgomery path (the exact integer ops the GPU kernel mirrors)
//      computes a*b*M^{-1} mod p for random + edge + a long adversarial chain, and
//      the two output bases are mutually consistent.
//   2. The committed src/.../rns/rns_constants.wgsl is byte-identical to a fresh render
//      (catches hand-edits and stale data — the file is generated, never edited).
//   3. Structural invariants: pairwise coprimality and the redundancy bound M,N > 2p.
//
// Config-aware: works for both the t=20/w=13 solo basis and the t=16/w=16 cooperative basis
// (RNS_T=16 RNS_W=16 RNS_RANK_F=27). The fold-bound proof switches to the split-accumulate model
// (foldBoundsOk16) for power-of-two t, where the cooperative kernel's lo/hi recombine applies.

import { readFileSync, existsSync } from 'fs';
import { computeParams, validate, renderWgsl, foldBoundsOk, foldBoundsOk16, WGSL_PATH, T, W } from './rns_params.mjs';

const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
let failed = 0;
const ok = (cond, msg) => { if (cond) { console.log(`  ok  ${msg}`); } else { console.error(`  FAIL ${msg}`); failed++; } };

function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }

console.log('1. oracle correctness (random + edges + adversarial chain)');
const { p, total, fails, chainFails } = validate({ trials: 50000 });
ok(fails.length === 0, `${total} modmul cases, ${fails.length} fails`);
ok(chainFails === 0, `20000-step Montgomery chain, ${chainFails} fails`);

console.log('2. committed data file is fresh (no hand-edits / staleness)');
ok(existsSync(WGSL_PATH), `data file exists at ${WGSL_PATH.split('/msm_webgpu/')[1]}`);
if (existsSync(WGSL_PATH)) {
  const onDisk = readFileSync(WGSL_PATH, 'utf8');
  const fresh = renderWgsl(computeParams());
  ok(onDisk === fresh, 'rns_constants.wgsl == fresh render (regenerate via rns_params.mjs if this fails)');
}

console.log('3. structural invariants');
const all = [...p.mM, ...p.mN];
let coprime = true;
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (gcd(all[i], all[j]) !== 1n) coprime = false;
ok(coprime, `${all.length} moduli pairwise coprime`);
ok(p.mM.every((m) => gcd(m, P) === 1n) && p.mN.every((n) => gcd(n, P) === 1n), 'all moduli coprime to p');
ok(p.M > 2n * P && p.N > 2n * P, `M,N > 2p redundancy  (M/p = ${Number(p.M / P)}, N/p = ${Number(p.N / P)})`);
ok(p.mM.every((m) => m < (1n << BigInt(W))) && p.mN.every((n) => n < (1n << BigInt(W))), `all residues < 2^${W} (single-u32 products)`);
const isPow2 = (T & (T - 1)) === 0;
const fb = isPow2 ? foldBoundsOk16(p).ok : foldBoundsOk(p);
ok(fb, `kernel fold/subtract counts proven minimal & canonical (analytical, ${isPow2 ? 'split-accumulate' : 'ACC'} model)`);
ok((T === 20 && W === 13) || (T === 16 && W === 16), `basis shape T=${T}, w=${W}`);

console.log(failed === 0 ? '\nPASS' : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
