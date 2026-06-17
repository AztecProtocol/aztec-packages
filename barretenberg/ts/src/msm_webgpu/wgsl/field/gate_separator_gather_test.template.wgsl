// Gate-separator per-round edge-scaling gather. The relation accumulate kernels
// read a contiguous per-pair scaling buffer scal[p] = beta_products[p * periodicity]
// (GateSeparatorPolynomial::edgeScaling, periodicity = 2^{round+1}). This kernel
// gathers that strided slice out of the resident Montgomery beta_products table
// (built once by gate_separator_scan) into the contiguous scal buffer the accumulate
// already expects — so the 14 relation kernels are unchanged and the host does no
// per-round bigint work.
//
// One thread per pair; a plain 8x u32 (Montgomery) copy, no field arithmetic.

struct Params {
  pairs: u32,       // output length = this round's edge-pair count
  periodicity: u32, // 2^{round+1}: stride into beta_products
}

@group(0) @binding(0) var<storage, read> beta_buf: array<u32>;        // 2^d Fr (Montgomery)
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;   // pairs Fr (Montgomery)
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size({{ workgroup_size }})
fn gate_separator_gather_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let p = gid.x;
  if (p >= params.pairs) { return; }
  let src = (p * params.periodicity) * 8u;
  let dst = p * 8u;
{{#f8_words}}
  out_buf[dst + {{i}}u] = beta_buf[src + {{i}}u];
{{/f8_words}}
}
