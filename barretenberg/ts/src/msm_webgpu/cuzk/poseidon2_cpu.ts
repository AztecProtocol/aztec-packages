// CPU Poseidon2 (BN254 scalar field) — the exact mirror of
// crypto/poseidon2/poseidon2_permutation.hpp + sponge/sponge.hpp, used as the
// reference for the GPU transcript kernel and to derive sumcheck round challenges
// on the host where needed. Validated bit-for-bit against bb.js poseidon2Hash.
//
// Params: t=4, d=5 (S-box x^5), R_F=8 (4 + 4), R_P=56. Sponge rate=3, capacity=1,
// domain IV = (input_length << 64).

import { POSEIDON2_RC, POSEIDON2_DIAG_M1 } from './poseidon2_consts.js';
import { BN254_SCALAR_FIELD } from './bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const add = (a: bigint, b: bigint): bigint => mod(a + b);
const mul = (a: bigint, b: bigint): bigint => mod(a * b);

const RC = POSEIDON2_RC.map(r => r.map(mod));
const DIAG_M1 = POSEIDON2_DIAG_M1.map(mod);

function sbox(x: bigint): bigint {
  let x2 = mul(x, x);
  x2 = mul(x2, x2); // x^4
  return mul(x, x2); // x^5
}

/** matrix_multiplication_4x4 (the hardcoded Poseidon2 external MDS, adds only). */
function ext4(s: bigint[]): void {
  let t0 = add(s[0], s[1]);
  let t1 = add(s[2], s[3]);
  let t2 = add(s[1], s[1]); t2 = add(t2, t1);
  let t3 = add(s[3], s[3]); t3 = add(t3, t0);
  let t4 = add(t1, t1); t4 = add(t4, t4); t4 = add(t4, t3);
  let t5 = add(t0, t0); t5 = add(t5, t5); t5 = add(t5, t2);
  const t6 = add(t3, t5);
  const t7 = add(t2, t4);
  s[0] = t6; s[1] = t5; s[2] = t7; s[3] = t4;
}

/** internal layer: result[i] = (D_i-1)*s[i] + sum(s). */
function internal(s: bigint[]): void {
  const sum = add(add(s[0], s[1]), add(s[2], s[3]));
  for (let i = 0; i < 4; i++) s[i] = add(mul(s[i], DIAG_M1[i]), sum);
}

/** In-place Poseidon2 permutation on a 4-element state. */
export function poseidon2PermuteInplace(state: bigint[]): void {
  ext4(state);
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) state[k] = add(state[k], RC[i][k]);
    for (let k = 0; k < 4; k++) state[k] = sbox(state[k]);
    ext4(state);
  }
  for (let i = 4; i < 60; i++) {
    state[0] = add(state[0], RC[i][0]);
    state[0] = sbox(state[0]);
    internal(state);
  }
  for (let i = 60; i < 64; i++) {
    for (let k = 0; k < 4; k++) state[k] = add(state[k], RC[i][k]);
    for (let k = 0; k < 4; k++) state[k] = sbox(state[k]);
    ext4(state);
  }
}

export function poseidon2Permute(input: bigint[]): bigint[] {
  const s = input.map(mod);
  poseidon2PermuteInplace(s);
  return s;
}

/** Poseidon2 sponge hash of a field vector -> one field element (rate=3, cap=1). */
export function poseidon2Hash(inputs: bigint[]): bigint {
  const iv = mod(BigInt(inputs.length) << 64n);
  const state = [0n, 0n, 0n, iv];
  let cache = [0n, 0n, 0n];
  let cs = 0;
  const duplex = (): void => {
    for (let i = 0; i < 3; i++) state[i] = add(state[i], cache[i]);
    poseidon2PermuteInplace(state);
    cache = [0n, 0n, 0n];
  };
  for (const x of inputs) {
    if (cs === 3) { duplex(); cache[0] = mod(x); cs = 1; }
    else { cache[cs] = mod(x); cs++; }
  }
  duplex();
  return state[0];
}

/** Seed for the sumcheck round-challenge transcript chain (round 0's prior state). */
export const SUMCHECK_TRANSCRIPT_SEED = 0n;

/**
 * Derive a sumcheck round challenge from the running transcript scalar and this
 * round's univariate evaluations via Poseidon2: u_i = hash([running, ...univariate]).
 * Equivalent Poseidon2 work to the C++ transcript get_challenge (a Poseidon2 hash of
 * the round's univariate chained over the previous challenge); self-consistent for
 * the telescoping/purported correctness checks. Returns { challenge, nextRunning }.
 */
export function sumcheckRoundChallenge(running: bigint, univariate: bigint[]): { challenge: bigint; nextRunning: bigint } {
  const challenge = poseidon2Hash([mod(running), ...univariate.map(mod)]);
  return { challenge, nextRunning: challenge };
}
