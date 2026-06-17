// Gate-separator beta_products scan (polynomials/gate_separator.hpp). Builds the
// length-2^d beta_products table — beta_products[i] = prod over set bits j of i of
// betas[j], beta_products[0] = 1 — in Montgomery form, on the GPU, replacing the
// host's O(n log n) popcount-product computeBetaProducts.
//
// One doubling pass per beta: pass k (this dispatch) reads the already-filled lower
// half beta_buf[0..2^k) and writes the upper half beta_buf[2^k..2^{k+1}) via
//   beta_buf[2^k + r] = beta_buf[r] * betas[k]
// so after d passes all 2^d entries are filled with only 2^d - 1 multiplies total.
// The two halves are disjoint within a pass (read [0,count), write [count,2*count)),
// so the writes are race-free; the host runs the d passes as ordered dispatches in
// one encoder, where WebGPU's read-after-write hazard tracking serializes them.
//
// All values are Montgomery 8x u32. beta_buf[0] is seeded by the host to mont(1)
// (or mont(0) for the empty-betas degenerate case); `scalars` holds the d betas in
// Montgomery form.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}

struct Params {
  count: u32, // 2^k: thread bound, lower-half length, and write offset
  k: u32,     // index of this pass's beta in `scalars`
}

@group(0) @binding(0) var<storage, read_write> beta_buf: array<u32>; // 2^d Fr (Montgomery)
@group(0) @binding(1) var<storage, read> scalars: array<u32>;        // d betas (Montgomery)
@group(0) @binding(2) var<uniform> params: Params;

fn ld(buf_idx: u32) -> array<u32, 8> {
  let base = buf_idx * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = beta_buf[base + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_scalar(idx: u32) -> array<u32, 8> {
  let base = idx * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = scalars[base + {{i}}u];
{{/f8_words}}
  return v;
}
fn st(buf_idx: u32, v: array<u32, 8>) {
  let base = buf_idx * 8u;
{{#f8_words}}
  beta_buf[base + {{i}}u] = v[{{i}}];
{{/f8_words}}
}

@compute @workgroup_size({{ workgroup_size }})
fn gate_separator_scan_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let r = gid.x;
  if (r >= params.count) { return; }
  let beta_k = ld_scalar(params.k);
  st(params.count + r, montgomery_product_f8(ld(r), beta_k));
}
