// Test kernel: MegaFlavor UltraPermutationRelation accumulate, in isolation. WGSL
// transcription of relations/permutation_relation.hpp under USE_SHORT_MONOMIALS.
// Three subrelations (6, 3, 3): the grand-product identity, the left-shiftable
// (lagrange_last * z_perm_shift) term, and the z_perm initialization term.
// beta/gamma/public_input_delta are degree-0 parameters, read from a separate
// read-only buffer at binding(3).
//
// One thread = one edge. Inputs (33 Fr, Montgomery, 8x u32 each): 16 entity edges
// {v0,v1} (w_l/r/o/4, id_1..4, sigma_1..4, z_perm, z_perm_shift, lagrange_first,
// lagrange_last) + scaling. Params buffer: [beta, gamma, public_input_delta].
// Output: the 12-Fr per-edge contribution (6 + 3 + 3).

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
@group(0) @binding(3) var<storage, read> param_buf: array<u32>; // [beta, gamma, public_input_delta]

const IN_LEN: u32 = 33u;   // 16 entities x 2 evals + scaling
const OUT_LEN: u32 = 12u;  // 6 + 3 + 3

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

// (entity * beta + (wire + gamma)), then optionally * scaling — one grand-product
// factor (degree-1).
fn gp_factor(ent: Mono, w_plus_gamma: Mono, beta: array<u32, 8>) -> Mono {
  return mono_add(mono_mul_scalar(ent, beta), w_plus_gamma);
}

@compute @workgroup_size({{ workgroup_size }})
fn permutation_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let w1 = edge(row, 0u);
  let w2 = edge(row, 2u);
  let w3 = edge(row, 4u);
  let w4 = edge(row, 6u);
  let id1 = edge(row, 8u);
  let id2 = edge(row, 10u);
  let id3 = edge(row, 12u);
  let id4 = edge(row, 14u);
  let s1 = edge(row, 16u);
  let s2 = edge(row, 18u);
  let s3 = edge(row, 20u);
  let s4 = edge(row, 22u);
  let zp = edge(row, 24u);   // z_perm
  let zps = edge(row, 26u);  // z_perm_shift
  let lf = edge(row, 28u);   // lagrange_first
  let ll = edge(row, 30u);   // lagrange_last
  let scaling = ld(row, 32u);

  let beta = pld(0u);
  let gamma = pld(1u);
  let pid = pld(2u); // public_input_delta

  let w1g = mono_add_scalar(w1, gamma);
  let w2g = mono_add_scalar(w2, gamma);
  let w3g = mono_add_scalar(w3, gamma);
  let w4g = mono_add_scalar(w4, gamma);

  // numerator = prod_i (w_i + id_i*beta + gamma), with scaling folded into factor 1
  var t1 = mono_mul_scalar(gp_factor(id1, w1g, beta), scaling);
  let t2 = gp_factor(id2, w2g, beta);
  let t3 = gp_factor(id3, w3g, beta);
  let t4 = gp_factor(id4, w4g, beta);
  var l1: Lag; lag_from_mono2(t1, 6u, &l1);
  var l2: Lag; lag_from_mono2(t2, 6u, &l2);
  var num_a: Lag; lag_mul(&l1, &l2, 6u, &num_a);
  var l3: Lag; lag_from_mono2(t3, 6u, &l3);
  var num_b: Lag; lag_mul(&num_a, &l3, 6u, &num_b);
  var l4: Lag; lag_from_mono2(t4, 6u, &l4);
  var num: Lag; lag_mul(&num_b, &l4, 6u, &num);

  // denominator = prod_i (w_i + sigma_i*beta + gamma), with scaling folded in
  var t5 = mono_mul_scalar(gp_factor(s1, w1g, beta), scaling);
  let t6 = gp_factor(s2, w2g, beta);
  let t7 = gp_factor(s3, w3g, beta);
  let t8 = gp_factor(s4, w4g, beta);
  var l5: Lag; lag_from_mono2(t5, 6u, &l5);
  var l6: Lag; lag_from_mono2(t6, 6u, &l6);
  var den_a: Lag; lag_mul(&l5, &l6, 6u, &den_a);
  var l7: Lag; lag_from_mono2(t7, 6u, &l7);
  var den_b: Lag; lag_mul(&den_a, &l7, 6u, &den_b);
  var l8: Lag; lag_from_mono2(t8, 6u, &l8);
  var den: Lag; lag_mul(&den_b, &l8, 6u, &den);

  // subrel 0 = (z_perm + L_first) * num - (z_perm_shift + L_last*pid) * den
  let zlf = mono_add(zp, lf);
  let pit = mono_add(mono_mul_scalar(ll, pid), zps);
  var lzlf: Lag; lag_from_mono2(zlf, 6u, &lzlf);
  var lpit: Lag; lag_from_mono2(pit, 6u, &lpit);
  var s0a: Lag; lag_mul(&lzlf, &num, 6u, &s0a);
  var s0b: Lag; lag_mul(&lpit, &den, 6u, &s0b);
  var sub0: Lag; lag_sub(&s0a, &s0b, 6u, &sub0);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, k, sub0[k]); }

  // subrel 1 = (L_last * z_perm_shift) * scaling  (length 3)
  let s1m = mono_mul_scalar(mono_mul_gg(ll, zps), scaling);
  var sub1: Lag; lag_from_mono3(s1m, 3u, &sub1);
  for (var k: u32 = 0u; k < 3u; k = k + 1u) { write_eval(row, 6u + k, sub1[k]); }

  // subrel 2 = (L_first * z_perm) * scaling  (length 3)
  let s2m = mono_mul_scalar(mono_mul_gg(lf, zp), scaling);
  var sub2: Lag; lag_from_mono3(s2m, 3u, &sub2);
  for (var k: u32 = 0u; k < 3u; k = k + 1u) { write_eval(row, 9u + k, sub2[k]); }
}
