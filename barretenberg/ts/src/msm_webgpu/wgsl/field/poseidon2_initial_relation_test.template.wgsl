// Test kernel: MegaFlavor Poseidon2InitialExternalRelation accumulate, in
// isolation. WGSL transcription of relations/poseidon2_initial_external_relation.hpp
// under USE_SHORT_MONOMIALS. Four subrelations (each length 3): enforce
// y = M_E · x, i.e. q_sel·(y_k_calc - y_k_shift) = 0, where the external-matrix
// row combinations y_k_calc are formed by repeated addition (no scalar muls).
//
// One thread = one edge. Inputs (19 Fr, Montgomery, 8x u32 each): 9 entity edges
// {v0,v1} (w_l/r/o/4 = x_0..3, w_l/r/o/4_shift = y_0..3,
// q_poseidon2_external_initial) + scaling. Output: the 12-Fr per-edge
// contribution (4 subrelations x 3).

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

const IN_LEN: u32 = 19u;   // 9 entities x 2 evals + scaling
const OUT_LEN: u32 = 12u;  // 4 subrelations x 3

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

// q_by_scaling * (y_calc - y_shift) (degree-1 * degree-1 -> degree-2) into a
// length-3 subrelation slot.
fn accum3(row: u32, k0: u32, qbs: Mono, diff: Mono) {
  let prod = mono_mul_gg(qbs, diff);
  var l: Lag; lag_from_mono3(prod, 3u, &l);
  for (var k: u32 = 0u; k < 3u; k = k + 1u) { write_eval(row, k0 + k, l[k]); }
}

@compute @workgroup_size({{ workgroup_size }})
fn poseidon2_initial_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let x0 = edge(row, 0u);
  let x1 = edge(row, 2u);
  let x2 = edge(row, 4u);
  let x3 = edge(row, 6u);
  let y0 = edge(row, 8u);
  let y1 = edge(row, 10u);
  let y2 = edge(row, 12u);
  let y3 = edge(row, 14u);
  let q_sel = edge(row, 16u);
  let scaling = ld(row, 18u);

  let qbs = mono_mul_scalar(q_sel, scaling);

  let t0 = mono_add(x0, x1);                          // x0 + x1
  let t1 = mono_add(x2, x3);                          // x2 + x3
  let t2 = mono_add(mono_add(x1, x1), t1);            // 2x1 + x2 + x3
  let t3 = mono_add(mono_add(x3, x3), t0);            // x0 + x1 + 2x3

  var y3c = mono_add(t1, t1);
  y3c = mono_add(mono_add(y3c, y3c), t3);             // x0 + x1 + 4x2 + 6x3
  var y1c = mono_add(t0, t0);
  y1c = mono_add(mono_add(y1c, y1c), t2);             // 4x0 + 6x1 + x2 + x3
  let y0c = mono_add(t3, y1c);                        // 5x0 + 7x1 + x2 + 3x3
  let y2c = mono_add(t2, y3c);                        // x0 + 3x1 + 5x2 + 7x3

  accum3(row, 0u, qbs, mono_sub(y0c, y0));
  accum3(row, 3u, qbs, mono_sub(y1c, y1));
  accum3(row, 6u, qbs, mono_sub(y2c, y2));
  accum3(row, 9u, qbs, mono_sub(y3c, y3));
}
