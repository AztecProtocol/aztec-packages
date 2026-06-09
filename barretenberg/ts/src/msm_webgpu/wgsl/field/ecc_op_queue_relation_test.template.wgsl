// Test kernel: MegaFlavor EccOpQueueRelation accumulate, in isolation. WGSL
// transcription of relations/ecc_op_queue_relation.hpp under USE_SHORT_MONOMIALS.
// Eight subrelations (each length 3): subrels 1-4 check op_wire_i == w_i_shift on
// the ecc-op domain (× lagrange_ecc_op × scaling); subrels 5-8 check op_wire_i
// vanishes off it (× scaling × (1 - lagrange_ecc_op)).
//
// One thread = one edge. Inputs (19 Fr, Montgomery, 8x u32 each): 9 entity edges
// {v0,v1} (w_l/r/o/4_shift, ecc_op_wire_1..4, lagrange_ecc_op) + scaling. Output:
// the 24-Fr per-edge contribution (8 subrelations x 3).

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

@group(0) @binding(0) var<storage, read> col_buf: array<u32>;  // num_edges columns, column-major, length 2*n each
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> scaling: array<u32>;  // per-pair gate-separator scaling

const IN_LEN: u32 = 19u;   // 9 entities x 2 evals + scaling
const OUT_LEN: u32 = 24u;  // 8 subrelations x 3

fn ld(row: u32, j: u32) -> array<u32, 8> {
  var v: array<u32, 8>;
  if (j + 1u < IN_LEN) {
    let col_len = 2u * params.n;
    let base = ((j >> 1u) * col_len + 2u * row + (j & 1u)) * 8u;
{{#f8_words}}
    v[{{i}}] = col_buf[base + {{i}}u];
{{/f8_words}}
  } else {
    let base = row * 8u;
{{#f8_words}}
    v[{{i}}] = scaling[base + {{i}}u];
{{/f8_words}}
  }
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

// a*b (degree-1 * degree-1 -> degree-2) promoted to a length-3 subrelation slot.
fn accum3(row: u32, k0: u32, a: Mono, b: Mono) {
  let prod = mono_mul_gg(a, b);
  var l: Lag; lag_from_mono3(prod, 3u, &l);
  for (var k: u32 = 0u; k < 3u; k = k + 1u) { write_eval(row, k0 + k, l[k]); }
}

@compute @workgroup_size({{ workgroup_size }})
fn ecc_op_queue_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let w1s = edge(row, 0u);
  let w2s = edge(row, 2u);
  let w3s = edge(row, 4u);
  let w4s = edge(row, 6u);
  let op1 = edge(row, 8u);
  let op2 = edge(row, 10u);
  let op3 = edge(row, 12u);
  let op4 = edge(row, 14u);
  let lecc = edge(row, 16u); // lagrange_ecc_op
  let scaling = ld(row, 18u);

  let lbs = mono_mul_scalar(lecc, scaling);            // lagrange_by_scaling
  let comp = mono_add_scalar(mono_neg(lbs), scaling);  // scaling*(1 - lagrange_ecc_op)

  // (1-4) op_wire_i - w_i_shift, on the ecc-op domain
  accum3(row, 0u, mono_sub(op1, w1s), lbs);
  accum3(row, 3u, mono_sub(op2, w2s), lbs);
  accum3(row, 6u, mono_sub(op3, w3s), lbs);
  accum3(row, 9u, mono_sub(op4, w4s), lbs);
  // (5-8) op_wire_i vanishes off it
  accum3(row, 12u, op1, comp);
  accum3(row, 15u, op2, comp);
  accum3(row, 18u, op3, comp);
  accum3(row, 21u, op4, comp);
}
