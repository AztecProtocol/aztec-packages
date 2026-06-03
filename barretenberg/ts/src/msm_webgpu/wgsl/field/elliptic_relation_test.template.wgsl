// Test kernel: MegaFlavor EllipticRelation accumulate, in isolation. WGSL
// transcription of relations/elliptic_relation.hpp under USE_SHORT_MONOMIALS.
// Two subrelations (each length 6): the x- and y-coordinate checks, each holding
// both the point-add branch (gated by q_elliptic*(1-q_is_double)) and the
// point-double branch (gated by q_elliptic*q_is_double). curve_b = -17 (Grumpkin,
// since MegaFlavor's FF is Grumpkin's base field). Degree-2 factors assemble in
// the Mono basis; length-6 promotion uses ptr<Lag> out-params.
//
// Entity->wire map (per the C++): x1=w_r, x2=w_l_shift, x3=w_r_shift, y1=w_o,
// y2=w_4_shift, y3=w_o_shift, q_elliptic, q_is_double=q_m, q_sign=q_l.
//
// One thread = one edge. Inputs (19 Fr, Montgomery, 8x u32 each): 9 entity edges
// {v0,v1} + scaling. Output: the 12-Fr per-edge contribution (2 subrelations x 6).

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}
{{> mono_funcs }}
{{> lag_funcs }}

const CURVE_B: array<u32, 8> = array<u32, 8>({{ curve_b_csv }});  // -17 mod p (Grumpkin)

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

const IN_LEN: u32 = 19u;   // 9 entities x 2 evals + scaling
const OUT_LEN: u32 = 12u;  // 2 subrelations x 6

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

@compute @workgroup_size({{ workgroup_size }})
fn elliptic_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let x1 = edge(row, 0u);   // w_r
  let x2 = edge(row, 2u);   // w_l_shift
  let x3 = edge(row, 4u);   // w_r_shift
  let y1 = edge(row, 6u);   // w_o
  let y2 = edge(row, 8u);   // w_4_shift
  let y3 = edge(row, 10u);  // w_o_shift
  let q_ell = edge(row, 12u);
  let q_double = edge(row, 14u); // q_m
  let q_sign = edge(row, 16u);   // q_l
  let scaling = ld(row, 18u);

  // degree-1 combinations
  let x2_sub_x1 = mono_sub(x2, x1);
  let x1_mul_3 = mono_add(mono_add(x1, x1), x1);
  let x3_sub_x1 = mono_sub(x3, x1);
  let x3_plus_two_x1 = mono_add(x3_sub_x1, x1_mul_3);
  let x3_plus_x2_plus_x1 = mono_add(x3_plus_two_x1, x2_sub_x1);

  // degree-2 products
  let y2_sqr = mono_sqr_g(y2);
  let y1_sqr = mono_sqr_g(y1);
  let y2_q_sign = mono_mul_gg(y2, q_sign);
  let x2_sub_x1_sqr = mono_sqr_g(x2_sub_x1);

  // gate scalings
  let q_ell_by_scaling = mono_mul_scalar(q_ell, scaling);
  let q_ell_q_double_m = mono_mul_gg(q_ell_by_scaling, q_double);
  let neg_qnd_m = mono_sub_lin(q_ell_q_double_m, q_ell_by_scaling); // q_ell*(q_double-1)*scaling
  var lqdd: Lag; lag_from_mono3(q_ell_q_double_m, 6u, &lqdd);
  var lnqnd: Lag; lag_from_mono3(neg_qnd_m, 6u, &lnqnd);

  // x_add_identity = (x3+x2+x1)(x2-x1)^2 - (y2^2+y1^2) + 2*q_sign*y2*y1
  var l_a1: Lag; lag_from_mono2(x3_plus_x2_plus_x1, 6u, &l_a1);
  var l_a2: Lag; lag_from_mono3(x2_sub_x1_sqr, 6u, &l_a2);
  var la: Lag; lag_mul(&l_a1, &l_a2, 6u, &la);
  var lb: Lag; lag_from_mono3(mono_add(y2_sqr, y1_sqr), 6u, &lb);
  var l_c1: Lag; lag_from_mono3(mono_add(y2_q_sign, y2_q_sign), 6u, &l_c1);
  var l_c2: Lag; lag_from_mono2(y1, 6u, &l_c2);
  var lc: Lag; lag_mul(&l_c1, &l_c2, 6u, &lc);
  var xai_t: Lag; lag_sub(&la, &lb, 6u, &xai_t);
  var xai: Lag; lag_add(&xai_t, &lc, 6u, &xai);

  // x_double_identity = (x3+2*x1)(4*y1^2) - 9*x1*(y1^2 - b)
  let y1_sqr_2 = mono_add(y1_sqr, y1_sqr);
  let y1_sqr_4 = mono_add(y1_sqr_2, y1_sqr_2);
  let y1_sqr_sub_b = mono_sub_scalar(y1_sqr, CURVE_B);
  var l_xp1: Lag; lag_from_mono3(y1_sqr_sub_b, 6u, &l_xp1);
  var l_xp2: Lag; lag_from_mono2(x1_mul_3, 6u, &l_xp2);
  var xp43: Lag; lag_mul(&l_xp1, &l_xp2, 6u, &xp43);     // (y1^2-b)*3*x1
  var xp43_2: Lag; lag_add(&xp43, &xp43, 6u, &xp43_2);
  var xp49: Lag; lag_add(&xp43_2, &xp43, 6u, &xp49);     // *3
  var l_xd1: Lag; lag_from_mono2(x3_plus_two_x1, 6u, &l_xd1);
  var l_xd2: Lag; lag_from_mono3(y1_sqr_4, 6u, &l_xd2);
  var xdi_t: Lag; lag_mul(&l_xd1, &l_xd2, 6u, &xdi_t);
  var xdi: Lag; lag_sub(&xdi_t, &xp49, 6u, &xdi);

  // subrel 0 = x_double_identity*q_ell_q_double - x_add_identity*neg_qnd
  var s0a: Lag; lag_mul(&xdi, &lqdd, 6u, &s0a);
  var s0b: Lag; lag_mul(&xai, &lnqnd, 6u, &s0b);
  var sub0: Lag; lag_sub(&s0a, &s0b, 6u, &sub0);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, k, sub0[k]); }

  // y_add_identity = (y1+y3)(x2-x1) + (x3-x1)(q_sign*y2 - y1)
  let y1_plus_y3 = mono_add(y1, y3);
  let y_diff_m = mono_sub_lin(y2_q_sign, y1);
  let yai_prod_m = mono_mul_gg(y1_plus_y3, x2_sub_x1);
  var l_yai1: Lag; lag_from_mono3(yai_prod_m, 6u, &l_yai1);
  var l_xs: Lag; lag_from_mono2(x3_sub_x1, 6u, &l_xs);
  var l_yd: Lag; lag_from_mono3(y_diff_m, 6u, &l_yd);
  var l_yai2: Lag; lag_mul(&l_xs, &l_yd, 6u, &l_yai2);
  var yai: Lag; lag_add(&l_yai1, &l_yai2, 6u, &yai);

  // neg_y_double_identity = (3*x1^2)(x3-x1) + (2*y1)(y1+y3)
  let x1_sqr_mul_3_m = mono_mul_gg(x1_mul_3, x1);
  var l_xsm3: Lag; lag_from_mono3(x1_sqr_mul_3_m, 6u, &l_xsm3);
  var l_xs2: Lag; lag_from_mono2(x3_sub_x1, 6u, &l_xs2);
  var nyd1: Lag; lag_mul(&l_xsm3, &l_xs2, 6u, &nyd1);
  let y1_2_times_m = mono_mul_gg(mono_add(y1, y1), y1_plus_y3);
  var nyd2: Lag; lag_from_mono3(y1_2_times_m, 6u, &nyd2);
  var nyd: Lag; lag_add(&nyd1, &nyd2, 6u, &nyd);

  // subrel 1 = -(y_add_identity*neg_qnd) - (neg_y_double_identity*q_ell_q_double)
  var s1a: Lag; lag_mul(&yai, &lnqnd, 6u, &s1a);
  var s1b: Lag; lag_mul(&nyd, &lqdd, 6u, &s1b);
  var s1sum: Lag; lag_add(&s1a, &s1b, 6u, &s1sum);
  var sub1: Lag; lag_neg(&s1sum, 6u, &sub1);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, 6u + k, sub1[k]); }
}
