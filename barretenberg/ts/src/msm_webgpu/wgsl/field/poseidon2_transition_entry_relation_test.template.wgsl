// Test kernel: MegaFlavor Poseidon2TransitionEntryRelation accumulate, in
// isolation. WGSL transcription of relations/poseidon2_transition_entry_relation.hpp
// under USE_SHORT_MONOMIALS. Three length-7 subrelations checking state[0] at
// internal rounds 1, 2, 3 of the K=4 compressed block. The x^5 S-box runs
// elementwise in Lagrange-7. Constants (D1, A_one, A2_one, Σ+6) are derived from
// the fixed Poseidon2 quad params (see cuzk/poseidon2_quad_consts.ts) and baked.
//
// One thread = one edge. Inputs (23 Fr, Montgomery, 8x u32 each): 11 entity edges
// {v0,v1} (w_l/r/o/4, w_r/o/4_shift, q_l/r/o, q_poseidon2_transition_entry) +
// scaling. Output: 21 Fr (3 subrelations x 7).

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

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

const IN_LEN: u32 = 23u;   // 11 entities x 2 evals + scaling
const OUT_LEN: u32 = 21u;  // 3 subrelations x 7

fn ld(row: u32, j: u32) -> array<u32, 8> {
  let base = (row * IN_LEN + j) * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = in_buf[base + {{i}}u];
{{/f8_words}}
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
  var x: Lag; lag_from_mono2(m, 7u, &x);
  var t2: Lag; lag_sqr(&x, 7u, &t2);
  var t4: Lag; lag_sqr(&t2, 7u, &t4);
  lag_mul(&t4, &x, 7u, out);
}

@compute @workgroup_size({{ workgroup_size }})
fn poseidon2_transition_entry_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let w_l = edge(row, 0u);
  let w_r = edge(row, 2u);
  let w_o = edge(row, 4u);
  let w_4 = edge(row, 6u);
  let w_rs = edge(row, 8u);  // w_r_shift
  let w_os = edge(row, 10u); // w_o_shift
  let w_4s = edge(row, 12u); // w_4_shift
  let q_l = edge(row, 14u);
  let q_r = edge(row, 16u);
  let q_o = edge(row, 18u);
  let q_sel = edge(row, 20u); // q_poseidon2_transition_entry
  let scaling = ld(row, 22u);

  var u0: Lag; sbox(mono_add(w_l, q_l), &u0);
  var u1: Lag; sbox(mono_add(w_rs, q_r), &u1);
  var u2: Lag; sbox(mono_add(w_os, q_o), &u2);

  var qbs: Lag; lag_from_mono2(mono_mul_scalar(q_sel, scaling), 7u, &qbs);

  // A_0: D1*u0 + (w_r + w_o + w_4) - w_r_shift
  var d1u0: Lag; lag_scale(&u0, TE_D1, 7u, &d1u0);
  let wp0 = mono_sub(mono_add(mono_add(w_r, w_o), w_4), w_rs);
  var wp0l: Lag; lag_from_mono2(wp0, 7u, &wp0l);
  var a0: Lag; lag_add(&d1u0, &wp0l, 7u, &a0);
  var s0: Lag; lag_mul(&qbs, &a0, 7u, &s0);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, k, s0[k]); }

  // A_1: D1*u1 + 3*u0 + (A_one . (w_r,w_o,w_4)) - w_o_shift
  var d1u1: Lag; lag_scale(&u1, TE_D1, 7u, &d1u1);
  var tu0: Lag; lag_scale(&u0, TE_THREE, 7u, &tu0);
  let wp1 = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, TE_A1_0), mono_mul_scalar(w_o, TE_A1_1)), mono_mul_scalar(w_4, TE_A1_2)), w_os);
  var wp1l: Lag; lag_from_mono2(wp1, 7u, &wp1l);
  var a1a: Lag; lag_add(&d1u1, &tu0, 7u, &a1a);
  var a1: Lag; lag_add(&a1a, &wp1l, 7u, &a1);
  var s1: Lag; lag_mul(&qbs, &a1, 7u, &s1);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, 7u + k, s1[k]); }

  // A_2: D1*u2 + 3*u1 + (Σ+6)*u0 + (A2_one . (w_r,w_o,w_4)) - w_4_shift
  var d1u2: Lag; lag_scale(&u2, TE_D1, 7u, &d1u2);
  var tu1: Lag; lag_scale(&u1, TE_THREE, 7u, &tu1);
  var su0: Lag; lag_scale(&u0, TE_SUMA, 7u, &su0);
  let wp2 = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, TE_A2_0), mono_mul_scalar(w_o, TE_A2_1)), mono_mul_scalar(w_4, TE_A2_2)), w_4s);
  var wp2l: Lag; lag_from_mono2(wp2, 7u, &wp2l);
  var a2a: Lag; lag_add(&d1u2, &tu1, 7u, &a2a);
  var a2b: Lag; lag_add(&a2a, &su0, 7u, &a2b);
  var a2: Lag; lag_add(&a2b, &wp2l, 7u, &a2);
  var s2: Lag; lag_mul(&qbs, &a2, 7u, &s2);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, 14u + k, s2[k]); }
}
