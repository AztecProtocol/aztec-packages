// Test kernel: gather a relation's packed edge-row input from its GPU-resident
// column-major columns, so the sumcheck columns never have to leave the GPU
// between rounds. Mirrors the host packEdgesFromBytes: for edge pair p and slot s
// of the in_len-wide row, entity j = s>>1 contributes its value at column row
// 2p+(s&1); the final slot (s == 2*num_edges) is the per-edge scaling. Pure
// 8x-u32 copy (no field arithmetic).

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}

struct Params {
  num_edges: u32, // entities per relation
  col_len: u32,   // current column length (rows) per entity
  in_len: u32,    // packed row width = 2*num_edges + 1
  num_pairs: u32, // edge pairs = col_len / 2
}

@group(0) @binding(0) var<storage, read> col_buf: array<u32>;  // num_edges * col_len Fr (column-major)
@group(0) @binding(1) var<storage, read> scaling: array<u32>;  // num_pairs Fr
@group(0) @binding(2) var<storage, read_write> out_buf: array<u32>; // num_pairs * in_len Fr
@group(0) @binding(3) var<uniform> params: Params;

fn ld_col(idx: u32) -> array<u32, 8> {
  let base = idx * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = col_buf[base + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_scal(idx: u32) -> array<u32, 8> {
  let base = idx * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = scaling[base + {{i}}u];
{{/f8_words}}
  return v;
}
fn st_out(idx: u32, v: array<u32, 8>) {
  let base = idx * 8u;
{{#f8_words}}
  out_buf[base + {{i}}u] = v[{{i}}];
{{/f8_words}}
}

@compute @workgroup_size({{ workgroup_size }})
fn gather_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let t = gid.x;
  if (t >= params.num_pairs * params.in_len) { return; }
  let p = t / params.in_len;
  let s = t % params.in_len;
  var v: array<u32, 8>;
  if (s < 2u * params.num_edges) {
    let j = s >> 1u;
    let h = s & 1u;
    v = ld_col(j * params.col_len + 2u * p + h);
  } else {
    v = ld_scal(p);
  }
  st_out(t, v);
}
