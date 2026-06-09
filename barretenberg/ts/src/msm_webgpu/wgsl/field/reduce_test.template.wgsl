// Test kernel: edge reduction for the sumcheck accumulate. Sums a relation's
// per-edge output (num_edges rows of out_len Fr, the contributions written by the
// relation accumulate kernel) over the edges, on the GPU, so only a handful of
// workgroup partial sums are read back instead of the full num_edges*out_len
// buffer. Each workgroup g sums a contiguous chunk of `chunk` edges; thread k
// (one per output column, out_len <= workgroup_size) accumulates column k of that
// chunk into partials[g*out_len + k]. The host sums the G = ceil(num_edges/chunk)
// partials per column to finish the reduction.
//
// All values are Montgomery 8x u32; the all-zero word vector is Montgomery 0, so
// a zero-initialized accumulator is the additive identity.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}

struct Params {
  num_edges: u32,
  out_len: u32,
  chunk: u32, // edges summed per workgroup
}

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;        // num_edges * out_len Fr
@group(0) @binding(1) var<storage, read_write> partials: array<u32>; // G * out_len Fr
@group(0) @binding(2) var<uniform> params: Params;

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
  partials[base + {{i}}u] = v[{{i}}];
{{/f8_words}}
}

@compute @workgroup_size({{ workgroup_size }})
fn reduce_main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let k = lid.x;
  if (k >= params.out_len) { return; }
  let start = wid.x * params.chunk;
  if (start >= params.num_edges) { return; }
  var end = start + params.chunk;
  if (end > params.num_edges) { end = params.num_edges; }

  var acc: array<u32, 8>;
{{#f8_words}}
  acc[{{i}}] = 0u;
{{/f8_words}}
  for (var e = start; e < end; e = e + 1u) {
    acc = fr_add_f8(acc, ld(e * params.out_len + k));
  }
  st(wid.x * params.out_len + k, acc);
}
