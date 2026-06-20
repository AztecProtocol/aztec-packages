// Test kernel: sumcheck fold (partially_evaluate). Halves every polynomial
// column by dest[k] = src[2k] + u*(src[2k+1] - src[2k]), folding hypercube
// variable 0. WGSL transcription of SumcheckProver::partially_evaluate
// (sumcheck/sumcheck.hpp:670) for power-of-two (even) column lengths.
//
// One thread per output element. Input is num_cols columns of length len = 2*half_len
// (column c at c*len); output is num_cols columns of length half_len. The round
// challenge u is one Fr (Montgomery, 8x u32) at binding(3).

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}

struct Params {
  num_out: u32,    // total dispatched output elements = num_cols * band_count
  half_len: u32,   // output length per column = len / 2 (out_buf column stride)
  band_count: u32, // output rows written per column this round (== half_len for a full fold)
  band_start: u32, // first output row per column (== 0 for a full fold)
}

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> challenge: array<u32>; // u (8x u32, Montgomery)

fn ld(idx: u32) -> array<u32, 8> {
  let base = idx * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = in_buf[base + {{i}}u];
{{/f8_words}}
  return v;
}
fn st(idx: u32, v: array<u32, 8>) {
  let base = idx * 8u;
{{#f8_words}}
  out_buf[base + {{i}}u] = v[{{i}}];
{{/f8_words}}
}

@compute @workgroup_size({{ workgroup_size }})
fn fold_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let o = gid.x;
  if (o >= params.num_out) { return; }
  // One thread = one OUTPUT row of one column. For a full fold band_count == half_len and
  // band_start == 0, so k == o % half_len and the write index is o (the original behavior).
  // For a band fold (realistic trace), only [band_start, band_start+band_count) of each
  // column is written; the rest of the freshly-allocated (zero-initialized) column stays 0.
  let c = o / params.band_count;
  let k = params.band_start + (o % params.band_count);
  let base = c * params.half_len * 2u; // start of column c (len = 2 * half_len)
  let a = ld(base + 2u * k);
  let b = ld(base + 2u * k + 1u);
  var u: array<u32, 8>;
{{#f8_words}}
  u[{{i}}] = challenge[{{i}}u];
{{/f8_words}}
  st(c * params.half_len + k, fr_add_f8(a, montgomery_product_f8(u, fr_sub_f8(b, a))));
}
