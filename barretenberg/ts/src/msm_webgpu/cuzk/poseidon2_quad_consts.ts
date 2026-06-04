// Derived constants for the Poseidon2 K=4 "quad" compressed internal-round
// relations (poseidon2_quad_internal*, poseidon2_transition_entry). The C++ keeps
// these in poseidon2_quad_params.hpp as a compile-time `build_tables()` matrix
// derivation; here we obtain the same fixed tables by a route that is robust to
// transcription error and self-validating against the real Poseidon2 dynamics:
//
//   - ref_from_wires() reproduces the relation's own (b_k formulas + Lagrange
//     solve + 4 internal-round steps) and is checked, in the accompanying test,
//     against a forward iteration of the actual internal round (the ground truth).
//   - The (w, u) -> out map is linear, so the closed_form table is recovered by
//     probing ref_from_wires() with unit vectors. forward_vandermonde_lhs is the
//     documented weighted sum of out_1..out_3.
//
// Base diagonal D_i come from poseidon2_params.hpp (stored as D_i - 1, canonical
// hex). Everything else derives from D_1..D_4 over the given scalar field.

// internal_matrix_diagonal_minus_one[0..3] (poseidon2_params.hpp), canonical.
const D_MINUS_ONE_HEX = [
  0x10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7n,
  0x0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740bn,
  0x00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15n,
  0x222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428bn,
] as const;

export interface Poseidon2QuadConsts {
  D1: bigint;
  SIGMA: bigint;
  SIGMA_PLUS_2: bigint;
  B3_U0_COEF: bigint; // (Σ+2) D1 - Σ - 3
  D1_MINUS_3: bigint;
  A_one: bigint[]; // (A·1)_j = D_{j+1} + 2
  A2_one: bigint[]; // (A²·1)_j = D_{j+1}² + D_{j+1} + Σ + 4
  sum_A_one: bigint; // Σ + 6
  closed_form: bigint[][]; // [4][7] rows out_0..out_3, cols [w_r, w_o, w_4, u0, u1, u2, u3]
  forward_vandermonde_lhs: bigint[][]; // [3][7]
  /** ground-truth forward internal-round iteration, exposed for the test. */
  forward: (s1: bigint, s2: bigint, s3: bigint, w_l: bigint, c: bigint[]) => { w_r: bigint; w_o: bigint; w_4: bigint; u: bigint[]; out: bigint[] };
  /** relation's own b_k + Lagrange-solve + step iteration. */
  refFromWires: (w_r: bigint, w_o: bigint, w_4: bigint, u0: bigint, u1: bigint, u2: bigint, u3: bigint) => bigint[];
}

export function poseidon2QuadConsts(P: bigint): Poseidon2QuadConsts {
  const mod = (x: bigint): bigint => ((x % P) + P) % P;
  const add = (a: bigint, b: bigint): bigint => mod(a + b);
  const sub = (a: bigint, b: bigint): bigint => mod(a - b);
  const mul = (a: bigint, b: bigint): bigint => mod(a * b);
  const neg = (a: bigint): bigint => mod(-a);
  const inv = (a: bigint): bigint => {
    let [or, r] = [mod(a), P];
    let [os, s] = [1n, 0n];
    while (r) { const q = or / r; [or, r] = [r, or - q * r]; [os, s] = [s, os - q * s]; }
    return mod(os);
  };
  const pow5 = (x: bigint): bigint => { const s = mul(x, x); return mul(mul(s, s), x); };

  const D1 = add(1n, D_MINUS_ONE_HEX[0]);
  const D2 = add(1n, D_MINUS_ONE_HEX[1]);
  const D3 = add(1n, D_MINUS_ONE_HEX[2]);
  const D4 = add(1n, D_MINUS_ONE_HEX[3]);
  const Dlane = [D1, D2, D3, D4];
  const SIGMA = add(add(D2, D3), D4);

  // forward internal round on a 4-element state (constant added before sbox).
  const forward = (s1: bigint, s2: bigint, s3: bigint, w_l: bigint, c: bigint[]) => {
    let state = [w_l, s1, s2, s3];
    const w: bigint[] = [w_l];
    const u: bigint[] = [];
    for (let r = 0; r < 4; r++) {
      const uu = pow5(add(state[0], c[r]));
      const full = [uu, state[1], state[2], state[3]];
      const sum = full.reduce(add, 0n);
      state = [0, 1, 2, 3].map(i => add(mul(sub(Dlane[i], 1n), full[i]), sum));
      u.push(uu);
      if (r < 3) w.push(state[0]);
    }
    return { w_r: w[1], w_o: w[2], w_4: w[3], u, out: state };
  };

  // Lagrange inverse rows (alpha coefficients) at nodes (D2, D3, D4).
  const id1 = inv(mul(sub(D2, D3), sub(D2, D4)));
  const id2 = inv(mul(neg(sub(D2, D3)), sub(D3, D4)));
  const id3 = inv(mul(neg(sub(D2, D4)), neg(sub(D3, D4))));
  const Vinv = [
    [mul(mul(D3, D4), id1), mul(neg(add(D3, D4)), id1), id1],
    [mul(mul(D2, D4), id2), mul(neg(add(D2, D4)), id2), id2],
    [mul(mul(D2, D3), id3), mul(neg(add(D2, D3)), id3), id3],
  ];
  const step = (s: bigint[], u: bigint): bigint[] => {
    const t = add(u, add(add(s[0], s[1]), s[2]));
    return [add(t, mul(s[0], sub(D2, 1n))), add(t, mul(s[1], sub(D3, 1n))), add(t, mul(s[2], sub(D4, 1n)))];
  };
  const refFromWires = (w_r: bigint, w_o: bigint, w_4: bigint, u0: bigint, u1: bigint, u2: bigint, u3: bigint): bigint[] => {
    const b1 = sub(w_r, mul(D1, u0));
    const b2 = add(add(mul(neg(2n), w_r), w_o), sub(mul(sub(mul(2n, D1), 3n), u0), mul(D1, u1)));
    const b3 = add(add(add(add(add(mul(neg(add(SIGMA, 2n)), w_r), neg(w_o)), w_4),
      mul(sub(sub(mul(add(SIGMA, 2n), D1), SIGMA), 3n), u0)), mul(sub(D1, 3n), u1)), neg(mul(D1, u2)));
    let s = Vinv.map(r => add(add(mul(r[0], b1), mul(r[1], b2)), mul(r[2], b3)));
    s = step(s, u0); s = step(s, u1); s = step(s, u2);
    const T3 = add(add(s[0], s[1]), s[2]);
    const out0 = add(mul(u3, D1), T3);
    s = step(s, u3);
    return [out0, s[0], s[1], s[2]];
  };

  // closed_form by probing the linear map ref_from_wires with unit vectors.
  const closed_form: bigint[][] = [[], [], [], []];
  for (let col = 0; col < 7; col++) {
    const inp = [0n, 0n, 0n, 0n, 0n, 0n, 0n];
    inp[col] = 1n;
    const out = refFromWires(inp[0], inp[1], inp[2], inp[3], inp[4], inp[5], inp[6]);
    for (let j = 0; j < 4; j++) closed_form[j][col] = out[j];
  }

  const lhsWeights = [[1n, 1n, 1n], [D2, D3, D4], [mul(D2, D2), mul(D3, D3), mul(D4, D4)]];
  const forward_vandermonde_lhs = lhsWeights.map(w =>
    [0, 1, 2, 3, 4, 5, 6].map(i =>
      add(add(mul(w[0], closed_form[1][i]), mul(w[1], closed_form[2][i])), mul(w[2], closed_form[3][i]))),
  );

  return {
    D1,
    SIGMA,
    SIGMA_PLUS_2: add(SIGMA, 2n),
    B3_U0_COEF: sub(sub(mul(add(SIGMA, 2n), D1), SIGMA), 3n),
    D1_MINUS_3: sub(D1, 3n),
    A_one: [add(D2, 2n), add(D3, 2n), add(D4, 2n)],
    A2_one: [
      add(add(add(mul(D2, D2), D2), SIGMA), 4n),
      add(add(add(mul(D3, D3), D3), SIGMA), 4n),
      add(add(add(mul(D4, D4), D4), SIGMA), 4n),
    ],
    sum_A_one: add(SIGMA, 6n),
    closed_form,
    forward_vandermonde_lhs,
    forward,
    refFromWires,
  };
}
