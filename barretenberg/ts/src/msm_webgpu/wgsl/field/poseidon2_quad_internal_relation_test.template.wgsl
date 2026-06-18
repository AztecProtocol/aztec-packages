// Test kernel: MegaFlavor Poseidon2QuadInternalRelation accumulate, in isolation.
// WGSL transcription of relations/poseidon2_quad_internal_relation.hpp under
// USE_SHORT_MONOMIALS. Four length-7 subrelations: A_0 matches the closed-form
// out_0 against w_l_shift; A_1..A_3 equate the forward-Vandermonde LHS of the
// predicted output to the next row's b'-encoded hidden lanes. The x^5 S-box runs
// elementwise in Lagrange-7. closed_form[0] (CF_0_*), forward_vandermonde_lhs
// (FV_{k}_*) and the scalar constants (D1, Σ+2, (Σ+2)D1-Σ-3, D1-3) are derived
// from the fixed Poseidon2 quad params (cuzk/poseidon2_quad_consts.ts) and baked.
//
// One thread = one edge. Inputs (33 Fr, Montgomery, 8x u32 each): 16 entity edges
// {v0,v1} (w_l/r/o/4, w_l/r/o/4_shift, q_l/r/o/4, q_m, q_c, q_5,
// q_poseidon2_quad_internal) + scaling. Output: 28 Fr (4 subrelations x 7).

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}
{{> mono_funcs }}
{{> lag_funcs }}

{{{ quad_consts }}}

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> col_buf: array<u32>;  // num_edges columns, column-major, length 2*n each
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> scaling: array<u32>;  // per-pair gate-separator scaling
{{#shared}}
@group(0) @binding(4) var<storage, read> entity_map: array<u32>;  // shared: local entity -> global column index
{{/shared}}

const IN_LEN: u32 = 33u;   // 16 entities x 2 evals + scaling
const OUT_LEN: u32 = 28u;  // 4 subrelations x 7

fn ld(row: u32, j: u32) -> array<u32, 8> {
  var v: array<u32, 8>;
  if (j + 1u < IN_LEN) {
    let col_len = 2u * params.n;
    let base = ({{#shared}}entity_map[j >> 1u]{{/shared}}{{^shared}}(j >> 1u){{/shared}} * col_len + 2u * row + (j & 1u)) * 8u;
{{#f8_words}}
    v[{{i}}] = col_buf[base + {{i}}u];
{{/f8_words}}
  } else {
    let base = row * 8u;
{{#f8_words}}
    v[{{i}}] = scaling[base + {{i}}u];
{{/f8_words}}
  }
  return v;
}

fn edge(row: u32, j0: u32) -> Mono {
  return mono_from_edge(ld(row, j0), ld(row, j0 + 1u));
}

fn write_eval(row: u32, k: u32, v: array<u32, 8>) {
  let base = (row * OUT_LEN + k) * 8u;
{{#f8_words}}
  out_buf[base + {{i}}u] = v[{{i}}];
{{/f8_words}}
}

fn sbox(m: Mono, out: ptr<function, Lag>) {
  // x^2 is degree-2, so compute it in the monomial basis (mono_sqr_g = 3 muls) and
  // promote to Lagrange; x^4 and x^5 exceed degree-2 and stay in Lagrange. x^5 of a
  // degree-1 line is degree-5, so the whole sbox runs at L=6 (one eval cheaper than 7);
  // the L=7 lift is applied once per subrelation via lag_extend6 before the gate multiply.
  var x: Lag; lag_from_mono2(m, 6u, &x);
  var t2: Lag; lag_from_mono3(mono_sqr_g(m), 6u, &t2);
  var t4: Lag; lag_sqr(&t2, 6u, &t4);
  lag_mul(&t4, &x, 6u, out);
}

// u0*c3 + u1*c4 + u2*c5 + u3*c6 into `out` (degree-5, carried at L=6).
fn ucomb(
  u0: ptr<function, Lag>, u1: ptr<function, Lag>, u2: ptr<function, Lag>, u3: ptr<function, Lag>,
  c3: array<u32, 8>, c4: array<u32, 8>, c5: array<u32, 8>, c6: array<u32, 8>,
  out: ptr<function, Lag>,
) {
  var acc: Lag; lag_scale(u0, c3, 6u, &acc);
  var tmp: Lag;
  lag_scale(u1, c4, 6u, &tmp);
  var a1: Lag; lag_add(&acc, &tmp, 6u, &a1);
  lag_scale(u2, c5, 6u, &tmp);
  var a2: Lag; lag_add(&a1, &tmp, 6u, &a2);
  lag_scale(u3, c6, 6u, &tmp);
  lag_add(&a2, &tmp, 6u, out);
}

@compute @workgroup_size({{ workgroup_size }})
fn poseidon2_quad_internal_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let w_l = edge(row, 0u);
  let w_r = edge(row, 2u);
  let w_o = edge(row, 4u);
  let w_4 = edge(row, 6u);
  let w_ls = edge(row, 8u);
  let w_rs = edge(row, 10u);
  let w_os = edge(row, 12u);
  let w_4s = edge(row, 14u);
  let q_l = edge(row, 16u);
  let q_r = edge(row, 18u);
  let q_o = edge(row, 20u);
  let q_4 = edge(row, 22u);
  let q_m = edge(row, 24u);
  let q_c = edge(row, 26u);
  let q_5 = edge(row, 28u);
  let q_sel = edge(row, 30u);
  let scaling = ld(row, 32u);

  // current-row S-boxes
  var u0: Lag; sbox(mono_add(w_l, q_l), &u0);
  var u1: Lag; sbox(mono_add(w_r, q_r), &u1);
  var u2: Lag; sbox(mono_add(w_o, q_o), &u2);
  var u3: Lag; sbox(mono_add(w_4, q_4), &u3);
  // next-row S-boxes (first three only)
  var u0p: Lag; sbox(mono_add(w_ls, q_m), &u0p);
  var u1p: Lag; sbox(mono_add(w_rs, q_c), &u1p);
  var u2p: Lag; sbox(mono_add(w_os, q_5), &u2p);

  // Gate scalar is degree-1; build it directly at L=7 (adds only) for the final multiply.
  var qbs: Lag; lag_from_mono2(mono_mul_scalar(q_sel, scaling), 7u, &qbs);
  var u0nD1: Lag; lag_scale(&u0p, QI_D1, 6u, &u0nD1); // D1 * u0', reused (L=6)

  // A_0: closed-form out_0 - w_l_shift
  let wp0 = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, CF_0_0), mono_mul_scalar(w_o, CF_0_1)), mono_mul_scalar(w_4, CF_0_2)), w_ls);
  var base0: Lag; ucomb(&u0, &u1, &u2, &u3, CF_0_3, CF_0_4, CF_0_5, CF_0_6, &base0);
  var wp0l: Lag; lag_from_mono2(wp0, 6u, &wp0l);
  var a0: Lag; lag_add(&base0, &wp0l, 6u, &a0);
  var a0e: Lag; lag_extend6(&a0, &a0e);
  var s0: Lag; lag_mul(&qbs, &a0e, 7u, &s0);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, k, s0[k]); }

  // A_1: (out_1+out_2+out_3) - b_1' ;  b_1' = w_r' - D1 u0'
  let wp1 = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, FV_0_0), mono_mul_scalar(w_o, FV_0_1)), mono_mul_scalar(w_4, FV_0_2)), w_rs);
  var base1: Lag; ucomb(&u0, &u1, &u2, &u3, FV_0_3, FV_0_4, FV_0_5, FV_0_6, &base1);
  var a1a: Lag; lag_add(&base1, &u0nD1, 6u, &a1a);
  var wp1l: Lag; lag_from_mono2(wp1, 6u, &wp1l);
  var a1: Lag; lag_add(&a1a, &wp1l, 6u, &a1);
  var a1e: Lag; lag_extend6(&a1, &a1e);
  var s1: Lag; lag_mul(&qbs, &a1e, 7u, &s1);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, 7u + k, s1[k]); }

  // A_2: (D2 out1 + D3 out2 + D4 out3) - b_2' ;  b_2' = w_o' - 2 w_r' + (2D1-3) u0' - D1 u1'
  // body = base2 - 2*(D1 u0') + 3 u0' + D1 u1' + wp2
  let wp2t = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, FV_1_0), mono_mul_scalar(w_o, FV_1_1)), mono_mul_scalar(w_4, FV_1_2)), w_os);
  let wp2 = mono_add(mono_add(wp2t, w_rs), w_rs); // -w_o_shift + 2 w_r_shift
  var base2: Lag; ucomb(&u0, &u1, &u2, &u3, FV_1_3, FV_1_4, FV_1_5, FV_1_6, &base2);
  var a2a: Lag; lag_sub(&base2, &u0nD1, 6u, &a2a);
  var a2b: Lag; lag_sub(&a2a, &u0nD1, 6u, &a2b);
  var tu0p: Lag; lag_scale(&u0p, QI_THREE, 6u, &tu0p);
  var a2c: Lag; lag_add(&a2b, &tu0p, 6u, &a2c);
  var u1nD1: Lag; lag_scale(&u1p, QI_D1, 6u, &u1nD1);
  var a2d: Lag; lag_add(&a2c, &u1nD1, 6u, &a2d);
  var wp2l: Lag; lag_from_mono2(wp2, 6u, &wp2l);
  var a2: Lag; lag_add(&a2d, &wp2l, 6u, &a2);
  var a2e: Lag; lag_extend6(&a2, &a2e);
  var s2: Lag; lag_mul(&qbs, &a2e, 7u, &s2);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, 14u + k, s2[k]); }

  // A_3: (D2^2 out1 + D3^2 out2 + D4^2 out3) - b_3'
  // body = base3 - B3_U0_COEF u0' - (D1-3) u1' + D1 u2' + wp3
  let wp3t = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, FV_2_0), mono_mul_scalar(w_o, FV_2_1)), mono_mul_scalar(w_4, FV_2_2)), w_4s);
  let wp3 = mono_add(mono_add(wp3t, w_os), mono_mul_scalar(w_rs, QI_SIGMA_PLUS_2)); // -w_4s + w_os + (Σ+2) w_rs
  var base3: Lag; ucomb(&u0, &u1, &u2, &u3, FV_2_3, FV_2_4, FV_2_5, FV_2_6, &base3);
  var b3u0: Lag; lag_scale(&u0p, QI_B3_U0, 6u, &b3u0);
  var a3a: Lag; lag_sub(&base3, &b3u0, 6u, &a3a);
  var d1m3u1: Lag; lag_scale(&u1p, QI_D1M3, 6u, &d1m3u1);
  var a3b: Lag; lag_sub(&a3a, &d1m3u1, 6u, &a3b);
  var d1u2p: Lag; lag_scale(&u2p, QI_D1, 6u, &d1u2p);
  var a3c: Lag; lag_add(&a3b, &d1u2p, 6u, &a3c);
  var wp3l: Lag; lag_from_mono2(wp3, 6u, &wp3l);
  var a3: Lag; lag_add(&a3c, &wp3l, 6u, &a3);
  var a3e: Lag; lag_extend6(&a3, &a3e);
  var s3: Lag; lag_mul(&qbs, &a3e, 7u, &s3);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, 21u + k, s3[k]); }
}
