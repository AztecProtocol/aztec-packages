// Test kernel: MegaFlavor LogDerivLookupRelation accumulate, in isolation. WGSL
// transcription of relations/logderiv_lookup_relation.hpp under
// USE_SHORT_MONOMIALS. Three subrelations (5, 5, 3): inverse-correctness, the
// log-derivative lookup identity, and the read_tag boolean check. Subrelation 1
// (the lookup identity) is linearly dependent and is NOT multiplied by the
// scaling factor. gamma/beta/beta^2/beta^3 are degree-0 params at binding(3).
//
// One thread = one edge. Inputs (37 Fr, Montgomery, 8x u32 each): 18 entity edges
// {v0,v1} (table_1..4, w_l/r/o, w_l/r/o_shift, q_o, q_r, q_m, q_c,
// lookup_inverses, lookup_read_counts, q_lookup, lookup_read_tags) + scaling.
// Params: [gamma, beta, beta_sqr, beta_cube]. Output: 13 Fr (5 + 5 + 3).

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}
{{> mono_funcs }}
{{> lag_funcs }}

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> param_buf: array<u32>; // [gamma, beta, beta_sqr, beta_cube]

const IN_LEN: u32 = 37u;   // 18 entities x 2 evals + scaling
const OUT_LEN: u32 = 13u;  // 5 + 5 + 3

fn ld(row: u32, j: u32) -> array<u32, 8> {
  let base = (row * IN_LEN + j) * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = in_buf[base + {{i}}u];
{{/f8_words}}
  return v;
}

fn pld(j: u32) -> array<u32, 8> {
  let base = j * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = param_buf[base + {{i}}u];
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
fn logderiv_lookup_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let table_1 = edge(row, 0u);
  let table_2 = edge(row, 2u);
  let table_3 = edge(row, 4u);
  let table_4 = edge(row, 6u);
  let w_l = edge(row, 8u);
  let w_r = edge(row, 10u);
  let w_o = edge(row, 12u);
  let w_ls = edge(row, 14u);
  let w_rs = edge(row, 16u);
  let w_os = edge(row, 18u);
  let q_o = edge(row, 20u);   // table_index
  let q_r = edge(row, 22u);   // -column_1_step_size
  let q_m = edge(row, 24u);   // -column_2_step_size
  let q_c = edge(row, 26u);   // -column_3_step_size
  let inverses = edge(row, 28u);     // lookup_inverses
  let read_counts = edge(row, 30u);  // lookup_read_counts
  let q_lookup = edge(row, 32u);     // read_selector
  let read_tags = edge(row, 34u);    // lookup_read_tags
  let scaling = ld(row, 36u);

  let gamma = pld(0u);
  let beta = pld(1u);
  let beta_sqr = pld(2u);
  let beta_cube = pld(3u);

  // table_term (degree 1) = table_1 + gamma + table_2*beta + table_3*beta^2 + table_4*beta^3
  var tt = mono_mul_scalar(table_2, beta);
  tt = mono_add(tt, mono_mul_scalar(table_3, beta_sqr));
  tt = mono_add(tt, mono_mul_scalar(table_4, beta_cube));
  tt = mono_add(tt, table_1);
  tt = mono_add_scalar(tt, gamma);

  // derived table entries (degree 2)
  let dt1 = mono_add_lin(mono_mul_gg(q_r, w_ls), mono_add_scalar(w_l, gamma));
  let dt2 = mono_add_lin(mono_mul_gg(q_m, w_rs), w_r);
  let dt3 = mono_add_lin(mono_mul_gg(q_c, w_os), w_o);
  let tie = mono_mul_scalar(q_o, beta_cube); // table_index_entry (degree 1)

  // lookup_term (degree 2) = dt2*beta + dt3*beta^2 + (dt1 + table_index_entry)
  var lt = mono_mul_scalar(dt2, beta);
  lt = mono_add(lt, mono_mul_scalar(dt3, beta_sqr));
  lt = mono_add(lt, mono_add_lin(dt1, tie));

  // inverse_exists (degree 2) = -(read_tags*q_lookup) + read_tags + q_lookup
  var ie = mono_neg(mono_mul_gg(read_tags, q_lookup));
  ie = mono_add_lin(ie, read_tags);
  ie = mono_add_lin(ie, q_lookup);

  var lt_lag: Lag; lag_from_mono3(lt, 5u, &lt_lag);
  var tt_lag: Lag; lag_from_mono2(tt, 5u, &tt_lag);

  // subrel 0 (length 5): (lookup_term * table_term * inverses - inverse_exists) * scaling
  let inv_scaled = mono_mul_scalar(inverses, scaling);
  let ie_scaled = mono_mul_scalar(ie, scaling);
  var p0: Lag; lag_mul(&lt_lag, &tt_lag, 5u, &p0);
  var inv_s_lag: Lag; lag_from_mono2(inv_scaled, 5u, &inv_s_lag);
  var p0b: Lag; lag_mul(&p0, &inv_s_lag, 5u, &p0b);
  var ie_s_lag: Lag; lag_from_mono3(ie_scaled, 5u, &ie_s_lag);
  var sub0: Lag; lag_sub(&p0b, &ie_s_lag, 5u, &sub0);
  for (var k: u32 = 0u; k < 5u; k = k + 1u) { write_eval(row, k, sub0[k]); }

  // subrel 1 (length 5, LINEARLY DEPENDENT, no scaling):
  //   (read_selector*table_term - read_counts*lookup_term) * inverses
  var rs_lag: Lag; lag_from_mono2(q_lookup, 5u, &rs_lag);
  var rc_lag: Lag; lag_from_mono2(read_counts, 5u, &rc_lag);
  var a1: Lag; lag_mul(&rs_lag, &tt_lag, 5u, &a1);
  var b1: Lag; lag_mul(&rc_lag, &lt_lag, 5u, &b1);
  var t1: Lag; lag_sub(&a1, &b1, 5u, &t1);
  var inv_lag: Lag; lag_from_mono2(inverses, 5u, &inv_lag);
  var sub1: Lag; lag_mul(&t1, &inv_lag, 5u, &sub1);
  for (var k: u32 = 0u; k < 5u; k = k + 1u) { write_eval(row, 5u + k, sub1[k]); }

  // subrel 2 (length 3): (read_tag^2 - read_tag) * scaling
  let bc = mono_mul_scalar(mono_sub_lin(mono_sqr_g(read_tags), read_tags), scaling);
  var sub2: Lag; lag_from_mono3(bc, 3u, &sub2);
  for (var k: u32 = 0u; k < 3u; k = k + 1u) { write_eval(row, 10u + k, sub2[k]); }
}
