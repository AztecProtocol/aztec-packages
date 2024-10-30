/* eslint-disable camelcase */
import { default as hash } from 'hash.js';

import { Fr } from '../../fields/fields.js';
import { truncateAndPad } from '../../serialize/free_funcs.js';
import { type Bufferable, serializeToBuffer } from '../../serialize/serialize.js';

export function sha256(data: Buffer) {
  return Buffer.from(hash.sha256().update(data).digest());
}

export function sha256Trunc(data: Buffer) {
  return truncateAndPad(sha256(data));
}

export function sha256ToField(data: Bufferable[]) {
  const buffer = serializeToBuffer(data);
  return Fr.fromBuffer(sha256Trunc(buffer));
}

/**
 * The "SHA256 Compression" operation (component operation of SHA256 "Hash").
 * WARNING: modifies `state` in place (and also returns it)
 *
 * This algorithm is extracted from the hash.js package
 * and modified to take in an initial state to operate on.
 *
 * @param state - The initial state to operate on (modified in-place). 8 u32s.
 * @param inputs - The inputs to compress into the state. 16 u32s.
 * @returns The modified state. 8 u32s.
 */
export function sha256Compression(state: Uint32Array, inputs: Uint32Array): Uint32Array {
  if (state.length !== 8) {
    throw new Error('`state` argument to SHA256 compression must be of length 8');
  }
  if (inputs.length !== 16) {
    throw new Error('`inputs` argument to SHA256 compression must be of length 16');
  }

  const W = new Array(64);
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ];
  let i = 0;
  for (i = 0; i < 16; i++) {
    W[i] = inputs[i];
  }
  for (i = 16; i < W.length; i++) {
    W[i] = sum32_4(
      W[i - 16],
      W[i - 7],
      g0_256(W[i - 15]), // Rot17, Rot18, Sh3
      g1_256(W[i - 2]), //ROt17, Rot19, Sh10
    );
  }

  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];

  for (let i = 0; i < 64; i++) {
    const T1 = sum32_5(
      h,
      s1_256(e), // Rot6, Rot11, Rot25
      ch32(e, f, g),
      k[i],
      W[i],
    );

    const T2 = sum32(
      s0_256(a), // Rot2, Rot13, Rot22
      maj32(a, b, c),
    );
    h = g;
    g = f;
    f = e;
    e = sum32(d, T1);
    d = c;
    c = b;
    b = a;
    a = sum32(T1, T2);
  }

  state[0] = sum32(state[0], a);
  state[1] = sum32(state[1], b);
  state[2] = sum32(state[2], c);
  state[3] = sum32(state[3], d);
  state[4] = sum32(state[4], e);
  state[5] = sum32(state[5], f);
  state[6] = sum32(state[6], g);
  state[7] = sum32(state[7], h);
  return state;
}

// SHA256  HELPER FUNCTIONS (from hash.js package)

function rotr32(w: number, b: number) {
  return (w >>> b) | (w << (32 - b));
}

function sum32(a: number, b: number) {
  return (a + b) >>> 0;
}

function sum32_4(a: number, b: number, c: number, d: number) {
  return (a + b + c + d) >>> 0;
}

function sum32_5(a: number, b: number, c: number, d: number, e: number) {
  return (a + b + c + d + e) >>> 0;
}

function ch32(x: number, y: number, z: number) {
  return (x & y) ^ (~x & z);
}

function maj32(x: number, y: number, z: number) {
  return (x & y) ^ (x & z) ^ (y & z);
}

function s0_256(x: number) {
  return rotr32(x, 2) ^ rotr32(x, 13) ^ rotr32(x, 22);
}

function s1_256(x: number) {
  return rotr32(x, 6) ^ rotr32(x, 11) ^ rotr32(x, 25);
}

function g0_256(x: number) {
  return rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3);
}

function g1_256(x: number) {
  return rotr32(x, 17) ^ rotr32(x, 19) ^ (x >>> 10);
}
