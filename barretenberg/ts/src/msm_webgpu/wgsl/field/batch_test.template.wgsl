// GPU batch_over_relations: reduce the flat 345-Fr per-edge-summed relation
// accumulator to the length-8 round univariate, on the GPU, so the whole sumcheck
// (accumulate -> reduce -> batch -> transcript hash -> fold) stays resident in one
// command buffer with no per-round CPU round-trip.
//
// WGSL mirror of batch_tail.ts batchOverRelations, reformulated (and validated in
// Node against batchOverRelations over random inputs) as two constant matrices:
//   uni[e] = (sum_idx li_mat[e][idx]*acc[idx]) * extRandom[e] * c_i
//          +  sum_idx ld_mat[e][idx]*acc[idx]
// where li_mat/ld_mat fold alpha^g and the barycentric extend-to-8 coefficients of
// each subrelation (li_mat for linearly-independent subrels, ld_mat for dependent),
// and extRandom[e] = a_e + b_e*beta_i is the pow univariate {1,beta_i} extended to 8.
// Both matrices and (a_e,b_e) are precomputed on the host per run (alpha is fixed for
// the whole sumcheck) and uploaded once; beta_i and c_i are this round's gate-separator
// scalars. One thread per eval point e in 0..7. All values are Montgomery 8x u32.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}

const ACC_LEN: u32 = 345u;
const BATCHED_LEN: u32 = 8u;

@group(0) @binding(0) var<storage, read> acc: array<u32>;          // ACC_LEN Fr (round accumulator)
@group(0) @binding(1) var<storage, read> li_mat: array<u32>;       // BATCHED_LEN*ACC_LEN Fr
@group(0) @binding(2) var<storage, read> ld_mat: array<u32>;       // BATCHED_LEN*ACC_LEN Fr
@group(0) @binding(3) var<storage, read> pow: array<u32>;          // 2*BATCHED_LEN Fr: a[0..7] then b[0..7]
@group(0) @binding(4) var<storage, read> scalars: array<u32>;      // [beta_i, c_i] Fr
@group(0) @binding(5) var<storage, read_write> out_buf: array<u32>; // BATCHED_LEN Fr

fn ld_acc(idx: u32) -> array<u32, 8> {
  let b = idx * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = acc[b + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_li(idx: u32) -> array<u32, 8> {
  let b = idx * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = li_mat[b + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_ld(idx: u32) -> array<u32, 8> {
  let b = idx * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = ld_mat[b + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_pow(idx: u32) -> array<u32, 8> {
  let b = idx * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = pow[b + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_sc(idx: u32) -> array<u32, 8> {
  let b = idx * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = scalars[b + {{i}}u];
{{/f8_words}}
  return v;
}

@compute @workgroup_size({{ workgroup_size }})
fn batch_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let e = gid.x;
  if (e >= BATCHED_LEN) { return; }

  var liSum: array<u32, 8>;
  var ldSum: array<u32, 8>;
{{#f8_words}}
  liSum[{{i}}] = 0u; ldSum[{{i}}] = 0u;
{{/f8_words}}
  let row = e * ACC_LEN;
  for (var idx: u32 = 0u; idx < ACC_LEN; idx = idx + 1u) {
    let a = ld_acc(idx);
    liSum = fr_add_f8(liSum, montgomery_product_f8(ld_li(row + idx), a));
    ldSum = fr_add_f8(ldSum, montgomery_product_f8(ld_ld(row + idx), a));
  }

  let beta = ld_sc(0u);
  let c = ld_sc(1u);
  let extRandom = fr_add_f8(ld_pow(e), montgomery_product_f8(ld_pow(BATCHED_LEN + e), beta));
  let res = fr_add_f8(montgomery_product_f8(montgomery_product_f8(liSum, extRandom), c), ldSum);

  let ob = e * 8u;
{{#f8_words}}
  out_buf[ob + {{i}}u] = res[{{i}}];
{{/f8_words}}
}
