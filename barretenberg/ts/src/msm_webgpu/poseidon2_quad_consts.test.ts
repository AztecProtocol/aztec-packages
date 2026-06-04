// Foundation gate for the Poseidon2 quad derived constants. Validates that the
// closed_form table (and the constants the relations consume) reproduce the
// actual Poseidon2 internal-round dynamics:
//   (A) forward 4-round iteration of the real internal round (ground truth)
//   (B) the relation's b_k + Lagrange-solve + step iteration (refFromWires)
// must agree (round-trip), and the probed closed_form table must reproduce (B).

import { describe, expect, it } from '@jest/globals';

import { poseidon2QuadConsts } from './cuzk/poseidon2_quad_consts.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const C = poseidon2QuadConsts(P);

let seed = 0x90521d2_caffe01n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

describe('Poseidon2 quad constants', () => {
  it('forward internal-round iteration == refFromWires (round-trip)', () => {
    for (let t = 0; t < 300; t++) {
      const f = C.forward(rnd(), rnd(), rnd(), rnd(), [rnd(), rnd(), rnd(), rnd()]);
      const ref = C.refFromWires(f.w_r, f.w_o, f.w_4, f.u[0], f.u[1], f.u[2], f.u[3]);
      expect(ref).toEqual(f.out);
    }
  });

  it('closed_form table reproduces refFromWires', () => {
    for (let t = 0; t < 200; t++) {
      const inp = Array.from({ length: 7 }, rnd);
      const ref = C.refFromWires(inp[0], inp[1], inp[2], inp[3], inp[4], inp[5], inp[6]);
      const tbl = C.closed_form.map(row => {
        let s = 0n;
        for (let i = 0; i < 7; i++) s = mod(s + row[i] * inp[i]);
        return s;
      });
      expect(tbl).toEqual(ref);
    }
  });

  it('forward_vandermonde_lhs row 0 is the (1,1,1) weighted sum of out_1..3', () => {
    for (let i = 0; i < 7; i++) {
      expect(C.forward_vandermonde_lhs[0][i]).toBe(mod(C.closed_form[1][i] + C.closed_form[2][i] + C.closed_form[3][i]));
    }
  });

  it('terminal U_3 coefficient of out_1..3 is 1', () => {
    expect(C.closed_form[1][6]).toBe(1n);
    expect(C.closed_form[2][6]).toBe(1n);
    expect(C.closed_form[3][6]).toBe(1n);
  });
});
