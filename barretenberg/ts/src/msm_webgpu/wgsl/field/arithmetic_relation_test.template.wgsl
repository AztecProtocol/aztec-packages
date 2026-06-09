// Phase-2 step-2 test kernel: the MegaFlavor ArithmeticRelation accumulate, in
// isolation. WGSL transcription of relations/ultra_arithmetic_relation.hpp under
// USE_SHORT_MONOMIALS — the template for all 14 relations: assemble degree-1/2
// factors in the Mono (coefficient) basis, promote to the Lagrange basis once a
// product exceeds degree 2, multiply/add elementwise, scale by the gate-separator
// (scaling_factor). Two subrelations: primary (length 6), secondary (length 5).
//
// One thread = one edge. Inputs (27 Fr, Montgomery, 8x u32 each) are the entity
// edges {v0,v1} in a fixed order plus the scaling factor; output is the 11-Fr
// per-edge contribution (6 + 5), which the host diffs against a polynomial
// reference. (The cross-edge sum/reduction is a separate, shared concern.)

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}
{{> mono_funcs }}
{{> lag_funcs }}

// Montgomery-form constants the relation subtracts/multiplies (FF(1/2/3), -1/2).
const FR_ONE: array<u32, 8> = array<u32, 8>({{ c1_csv }});
const FR_TWO: array<u32, 8> = array<u32, 8>({{ c2_csv }});
const FR_THREE: array<u32, 8> = array<u32, 8>({{ c3_csv }});
const NEG_HALF: array<u32, 8> = array<u32, 8>({{ neg_half_csv }});

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> col_buf: array<u32>;  // num_edges columns, column-major, length 2*n each
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> scaling: array<u32>;  // per-pair gate-separator scaling

const IN_LEN: u32 = 27u;   // 13 entities x 2 evals + scaling
const OUT_LEN: u32 = 11u;  // subrel0 (6) + subrel1 (5)

fn ld(row: u32, j: u32) -> array<u32, 8> {
  var v: array<u32, 8>;
  if (j + 1u < IN_LEN) {
    let col_len = 2u * params.n;
    let base = ((j >> 1u) * col_len + 2u * row + (j & 1u)) * 8u;
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

@compute @workgroup_size({{ workgroup_size }})
fn arithmetic_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  // entity edges (cached degree-1 monomials)
  let w_l = edge(row, 0u);
  let w_r = edge(row, 2u);
  let w_o = edge(row, 4u);
  let w_4 = edge(row, 6u);
  let w_4s = edge(row, 8u);   // w_4_shift
  let w_ls = edge(row, 10u);  // w_l_shift
  let q_m = edge(row, 12u);
  let q_l = edge(row, 14u);
  let q_r = edge(row, 16u);
  let q_o = edge(row, 18u);
  let q_4 = edge(row, 20u);
  let q_c = edge(row, 22u);
  let q_arith = edge(row, 24u);
  let scaling = ld(row, 26u);

  let scaled_q_arith = mono_mul_scalar(q_arith, scaling); // q_arith * scaling_factor (deg-1)
  let q_arith_m1 = mono_sub_scalar(q_arith, FR_ONE);      // q_arith - 1 (deg-1, general)

  // Lag temporaries are written in place (ptr out-params): a Lag is a nested
  // fixed-size array, and returning/copying one by value miscompiles on Metal.
  var A0: Lag; var B0: Lag; var tmp0: Lag; var t1lag: Lag; var inner: Lag;
  var slag: Lag; var sub0: Lag;

  // ── Subrelation 1 (length 6) ──
  // tmp0 = (w_r*w_l*(-1/2)) * ((q_arith-3)*q_m)
  lag_from_mono3(mono_mul_scalar(mono_mul_cc(w_r, w_l), NEG_HALF), 6u, &A0);
  lag_from_mono3(mono_mul_gc(mono_sub_scalar(q_arith, FR_THREE), q_m), 6u, &B0);
  lag_mul(&A0, &B0, 6u, &tmp0);
  // tmp1 = q_l*w_l + q_r*w_r + q_o*w_o + q_4*w_4 + q_c + (q_arith-1)*w_4_shift
  var tmp1 = mono_add(mono_mul_cc(q_l, w_l), mono_mul_cc(q_r, w_r));
  tmp1 = mono_add(tmp1, mono_mul_cc(q_o, w_o));
  tmp1 = mono_add(tmp1, mono_mul_cc(q_4, w_4));
  tmp1 = mono_add_lin(tmp1, q_c);
  tmp1 = mono_add(tmp1, mono_mul_gc(q_arith_m1, w_4s));
  lag_from_mono3(tmp1, 6u, &t1lag);
  lag_add(&tmp0, &t1lag, 6u, &inner);
  lag_from_mono2(scaled_q_arith, 6u, &slag);
  lag_mul(&inner, &slag, 6u, &sub0);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, k, sub0[k]); }

  // ── Subrelation 2 (length 5) ──
  // (w_l + w_4 - w_l_shift + q_m)*(q_arith-2) * ((q_arith-1)*scaled_q_arith)
  var t0 = mono_add(w_l, w_4);
  t0 = mono_sub(t0, w_ls);
  t0 = mono_add(t0, q_m);
  let tmp_1 = mono_mul_gg(t0, mono_sub_scalar(q_arith, FR_TWO));
  let tmp_2 = mono_mul_gg(q_arith_m1, scaled_q_arith);
  var l1: Lag; var l2: Lag; var sub1: Lag;
  lag_from_mono3(tmp_1, 5u, &l1);
  lag_from_mono3(tmp_2, 5u, &l2);
  lag_mul(&l1, &l2, 5u, &sub1);
  for (var k: u32 = 0u; k < 5u; k = k + 1u) { write_eval(row, 6u + k, sub1[k]); }
}
