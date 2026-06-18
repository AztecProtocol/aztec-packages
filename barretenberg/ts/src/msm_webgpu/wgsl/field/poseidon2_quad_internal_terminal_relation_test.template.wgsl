// Test kernel: MegaFlavor Poseidon2QuadInternalTerminalRelation accumulate, in
// isolation. WGSL transcription of
// relations/poseidon2_quad_internal_terminal_relation.hpp under
// USE_SHORT_MONOMIALS. Four length-7 subrelations matching the closed-form
// 4-round output (out_0..out_3) against (w_l/r/o/4_shift). The x^5 S-box runs
// elementwise in Lagrange-7; the closed_form coefficient table is derived from
// the fixed Poseidon2 quad params (cuzk/poseidon2_quad_consts.ts) and baked as
// CF_{j}_{i} (row out_j, col [w_r,w_o,w_4,u0,u1,u2,u3]).
//
// One thread = one edge. Inputs (27 Fr, Montgomery, 8x u32 each): 13 entity edges
// {v0,v1} (w_l/r/o/4, w_l/r/o/4_shift, q_l/r/o/4,
// q_poseidon2_quad_internal_terminal) + scaling. Output: 28 Fr (4 subrelations x 7).

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

const IN_LEN: u32 = 27u;   // 13 entities x 2 evals + scaling
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

// out_j body: u0*c3 + u1*c4 + u2*c5 + u3*c6 + (wire part), then * q_by_scaling.
fn accum_out(
  row: u32, k0: u32,
  u0: ptr<function, Lag>, u1: ptr<function, Lag>, u2: ptr<function, Lag>, u3: ptr<function, Lag>,
  c3: array<u32, 8>, c4: array<u32, 8>, c5: array<u32, 8>, c6: array<u32, 8>,
  wp: Mono, qbs: ptr<function, Lag>,
) {
  var acc: Lag; lag_scale(u0, c3, 6u, &acc);
  var tmp: Lag;
  lag_scale(u1, c4, 6u, &tmp);
  var a1: Lag; lag_add(&acc, &tmp, 6u, &a1);
  lag_scale(u2, c5, 6u, &tmp);
  var a2: Lag; lag_add(&a1, &tmp, 6u, &a2);
  lag_scale(u3, c6, 6u, &tmp);
  var a3: Lag; lag_add(&a2, &tmp, 6u, &a3);
  var wpl: Lag; lag_from_mono2(wp, 6u, &wpl);
  var body: Lag; lag_add(&a3, &wpl, 6u, &body);
  var bodye: Lag; lag_extend6(&body, &bodye);
  var s: Lag; lag_mul(qbs, &bodye, 7u, &s);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, k0 + k, s[k]); }
}

@compute @workgroup_size({{ workgroup_size }})
fn poseidon2_quad_internal_terminal_main(@builtin(global_invocation_id) gid: vec3<u32>) {
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
  let q_sel = edge(row, 24u);
  let scaling = ld(row, 26u);

  var u0: Lag; sbox(mono_add(w_l, q_l), &u0);
  var u1: Lag; sbox(mono_add(w_r, q_r), &u1);
  var u2: Lag; sbox(mono_add(w_o, q_o), &u2);
  var u3: Lag; sbox(mono_add(w_4, q_4), &u3);
  var qbs: Lag; lag_from_mono2(mono_mul_scalar(q_sel, scaling), 7u, &qbs);

  // wire part wp_j = w_r*CF_j_0 + w_o*CF_j_1 + w_4*CF_j_2 - w_target_shift
  let wp0 = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, CF_0_0), mono_mul_scalar(w_o, CF_0_1)), mono_mul_scalar(w_4, CF_0_2)), w_ls);
  let wp1 = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, CF_1_0), mono_mul_scalar(w_o, CF_1_1)), mono_mul_scalar(w_4, CF_1_2)), w_rs);
  let wp2 = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, CF_2_0), mono_mul_scalar(w_o, CF_2_1)), mono_mul_scalar(w_4, CF_2_2)), w_os);
  let wp3 = mono_sub(mono_add(mono_add(mono_mul_scalar(w_r, CF_3_0), mono_mul_scalar(w_o, CF_3_1)), mono_mul_scalar(w_4, CF_3_2)), w_4s);

  accum_out(row, 0u, &u0, &u1, &u2, &u3, CF_0_3, CF_0_4, CF_0_5, CF_0_6, wp0, &qbs);
  accum_out(row, 7u, &u0, &u1, &u2, &u3, CF_1_3, CF_1_4, CF_1_5, CF_1_6, wp1, &qbs);
  accum_out(row, 14u, &u0, &u1, &u2, &u3, CF_2_3, CF_2_4, CF_2_5, CF_2_6, wp2, &qbs);
  accum_out(row, 21u, &u0, &u1, &u2, &u3, CF_3_3, CF_3_4, CF_3_5, CF_3_6, wp3, &qbs);
}
