// Test kernel: MegaFlavor DeltaRangeConstraintRelation accumulate, in isolation.
// WGSL transcription of relations/delta_range_constraint_relation.hpp under
// USE_SHORT_MONOMIALS. Four subrelations (each length 6): for each wire
// difference D, accumulate q_delta_range * D(D-1)(D-2)(D-3) via the polynomial
// trick T=(D-3)*D, T*(T+2). Promotion to Lagrange uses ptr<function,Lag>
// out-params (nested-array by-value miscompiles on Metal).
//
// One thread = one edge. Inputs (13 Fr, Montgomery, 8x u32 each): the 5 entity
// edges {v0,v1} (w_l, w_r, w_o, w_4, w_l_shift), q_delta_range, scaling. Output:
// the 24-Fr per-edge contribution (4 subrelations x 6).

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}
{{> mono_funcs }}
{{> lag_funcs }}

const FR_TWO: array<u32, 8> = array<u32, 8>({{ c2_csv }});
const FR_THREE: array<u32, 8> = array<u32, 8>({{ c3_csv }});

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

const IN_LEN: u32 = 13u;   // 6 entities x 2 evals + scaling
const OUT_LEN: u32 = 24u;  // 4 subrelations x 6

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

// One subrelation: q_delta_range_scaled * D(D-1)(D-2)(D-3), via T=(D-3)*D and
// T*(T+2). `slag` is the length-6 Lagrange promotion of q_delta_range_scaled.
fn accum_delta(row: u32, k0: u32, d: Mono, slag: ptr<function, Lag>) {
  let t = mono_mul_gg(mono_sub_scalar(d, FR_THREE), d); // degree-2 packed
  var lt: Lag; lag_from_mono3(t, 6u, &lt);
  var lt2: Lag;
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { lt2[k] = fr_add_f8(lt[k], FR_TWO); } // T+2 on evals
  var p: Lag; lag_mul(&lt, &lt2, 6u, &p);
  var sub: Lag; lag_mul(&p, slag, 6u, &sub);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, k0 + k, sub[k]); }
}

@compute @workgroup_size({{ workgroup_size }})
fn delta_range_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let w_l = edge(row, 0u);
  let w_r = edge(row, 2u);
  let w_o = edge(row, 4u);
  let w_4 = edge(row, 6u);
  let w_ls = edge(row, 8u);  // w_l_shift
  let q_dr = edge(row, 10u);
  let scaling = ld(row, 12u);

  let q_scaled = mono_mul_scalar(q_dr, scaling);
  var slag: Lag; lag_from_mono2(q_scaled, 6u, &slag);

  accum_delta(row, 0u, mono_sub(w_r, w_l), &slag);   // D_0 = w_2 - w_1
  accum_delta(row, 6u, mono_sub(w_o, w_r), &slag);   // D_1 = w_3 - w_2
  accum_delta(row, 12u, mono_sub(w_4, w_o), &slag);  // D_2 = w_4 - w_3
  accum_delta(row, 18u, mono_sub(w_ls, w_4), &slag); // D_3 = w_1_shift - w_4
}
