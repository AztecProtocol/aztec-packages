// Test kernel: MegaFlavor NonNativeFieldRelation accumulate, in isolation. WGSL
// transcription of relations/non_native_field_relation.hpp under
// USE_SHORT_MONOMIALS. One subrelation (length 6): three bigfield-product gates
// and two limb-accumulation gates, combined and gated by q_nnf. Degree-2 factors
// are assembled in the Mono basis (mixed-degree folds use mono_add_lin/sub_lin),
// promoted to length-6 Lagrange via ptr<Lag> out-params, then multiplied.
//
// One thread = one edge. Inputs (27 Fr, Montgomery, 8x u32 each): 13 entity edges
// {v0,v1} (w_l/r/o/4, w_l/r/o/4_shift, q_r, q_o, q_4, q_m, q_nnf) + scaling.
// Output: the 6-Fr per-edge contribution.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}
{{> mono_funcs }}
{{> lag_funcs }}

const LIMB_SIZE: array<u32, 8> = array<u32, 8>({{ limb_size_csv }});    // 2^68
const SUBLIMB_SHIFT: array<u32, 8> = array<u32, 8>({{ sublimb_csv }});  // 2^14

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

const IN_LEN: u32 = 27u;  // 13 entities x 2 evals + scaling
const OUT_LEN: u32 = 6u;  // 1 subrelation x 6

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
fn non_native_field_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let w1 = edge(row, 0u);
  let w2 = edge(row, 2u);
  let w3 = edge(row, 4u);
  let w4 = edge(row, 6u);
  let w1s = edge(row, 8u);
  let w2s = edge(row, 10u);
  let w3s = edge(row, 12u);
  let w4s = edge(row, 14u);
  let q2 = edge(row, 16u);  // q_r
  let q3 = edge(row, 18u);  // q_o
  let q4 = edge(row, 20u);  // q_4
  let qm = edge(row, 22u);  // q_m
  let qnnf = edge(row, 24u);
  let scaling = ld(row, 26u);

  // limb_subproduct = w1*w2s + w1s*w2  (degree-2)
  var lsp = mono_add(mono_mul_gg(w1, w2s), mono_mul_gg(w1s, w2));

  // gate 2: (w1*w4 + w2*w3 - w3s) * 2^68 - w4s + limb_subproduct
  var g2 = mono_add(mono_mul_gg(w1, w4), mono_mul_gg(w2, w3));
  g2 = mono_sub_lin(g2, w3s);
  g2 = mono_mul_scalar(g2, LIMB_SIZE);
  g2 = mono_sub_lin(g2, w4s);
  g2 = mono_add(g2, lsp);
  var lg2: Lag; lag_from_mono3(g2, 6u, &lg2);
  var lq4: Lag; lag_from_mono2(q4, 6u, &lq4);
  var ng2: Lag; lag_mul(&lg2, &lq4, 6u, &ng2);

  // limb_subproduct = limb_subproduct * 2^68 + w1s*w2s
  lsp = mono_mul_scalar(lsp, LIMB_SIZE);
  lsp = mono_add(lsp, mono_mul_gg(w1s, w2s));

  // gate 1: limb_subproduct - (w3 + w4)
  var g1 = mono_sub_lin(lsp, mono_add(w3, w4));
  var lg1: Lag; lag_from_mono3(g1, 6u, &lg1);
  var lq3: Lag; lag_from_mono2(q3, 6u, &lq3);
  var ng1: Lag; lag_mul(&lg1, &lq3, 6u, &ng1);

  // gate 3: limb_subproduct + w4 - (w3s + w4s)
  var g3 = mono_add_lin(lsp, w4);
  g3 = mono_sub_lin(g3, mono_add(w3s, w4s));
  var lg3: Lag; lag_from_mono3(g3, 6u, &lg3);
  var lqm: Lag; lag_from_mono2(qm, 6u, &lqm);
  var ng3: Lag; lag_mul(&lg3, &lqm, 6u, &ng3);

  // non_native_field_identity = (ng1 + ng2 + ng3) * q2
  var s12: Lag; lag_add(&ng1, &ng2, 6u, &s12);
  var nid: Lag; lag_add(&s12, &ng3, 6u, &nid);
  var lq2: Lag; lag_from_mono2(q2, 6u, &lq2);
  var nfid: Lag; lag_mul(&nid, &lq2, 6u, &nfid);

  // limb accumulation gate 1 (Horner over 2^14), all degree-1
  var la1 = mono_mul_scalar(w2s, SUBLIMB_SHIFT);
  la1 = mono_add(la1, w1s);
  la1 = mono_mul_scalar(la1, SUBLIMB_SHIFT);
  la1 = mono_add(la1, w3);
  la1 = mono_mul_scalar(la1, SUBLIMB_SHIFT);
  la1 = mono_add(la1, w2);
  la1 = mono_mul_scalar(la1, SUBLIMB_SHIFT);
  la1 = mono_add(la1, w1);
  la1 = mono_sub(la1, w4);
  let la1f = mono_mul_gg(la1, q4);

  // limb accumulation gate 2
  var la2 = mono_mul_scalar(w3s, SUBLIMB_SHIFT);
  la2 = mono_add(la2, w2s);
  la2 = mono_mul_scalar(la2, SUBLIMB_SHIFT);
  la2 = mono_add(la2, w1s);
  la2 = mono_mul_scalar(la2, SUBLIMB_SHIFT);
  la2 = mono_add(la2, w4);
  la2 = mono_mul_scalar(la2, SUBLIMB_SHIFT);
  la2 = mono_add(la2, w3);
  la2 = mono_sub(la2, w4s);
  let la2f = mono_mul_gg(la2, qm);

  // limb_accumulator_identity = (la1f + la2f) * q3
  let lai_m = mono_add(la1f, la2f);
  var llai: Lag; lag_from_mono3(lai_m, 6u, &llai);
  var lq3b: Lag; lag_from_mono2(q3, 6u, &lq3b);
  var laid: Lag; lag_mul(&llai, &lq3b, 6u, &laid);

  // nnf = (non_native_field_identity + limb_accumulator_identity) * (q_nnf * scaling)
  var tot: Lag; lag_add(&nfid, &laid, 6u, &tot);
  let qns = mono_mul_scalar(qnnf, scaling);
  var lqns: Lag; lag_from_mono2(qns, 6u, &lqns);
  var outl: Lag; lag_mul(&tot, &lqns, 6u, &outl);

  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, k, outl[k]); }
}
