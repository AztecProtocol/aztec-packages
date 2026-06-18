// Test kernel: MegaFlavor Poseidon2ExternalRelation accumulate, in isolation.
// WGSL transcription of relations/poseidon2_external_relation.hpp under
// USE_SHORT_MONOMIALS. Four subrelations (each length 7): v = M_E * u with
// u_k = (w_k + c_k)^5, enforcing v_k = w_k_shift. The S-box x^5 is applied
// elementwise in the length-7 Lagrange basis (a degree-1 input -> degree-5, exact
// in 7 evals); the external matrix M_E is applied by Lagrange additions. Round
// constants c_k are columns (q_l..q_4), not baked.
//
// One thread = one edge. Inputs (27 Fr, Montgomery, 8x u32 each): 13 entity edges
// {v0,v1} (w_l/r/o/4, w_l/r/o/4_shift, q_l/r/o/4, q_poseidon2_external) +
// scaling. Output: 28 Fr (4 subrelations x 7).

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
{{#shared}}
@group(0) @binding(4) var<storage, read> entity_map: array<u32>;  // shared: local entity -> global column index
{{/shared}}

const IN_LEN: u32 = 27u;   // 13 entities x 2 evals + scaling
const OUT_LEN: u32 = 28u;  // 4 subrelations x 7

fn ld(row: u32, j: u32) -> array<u32, 8> {
  var v: array<u32, 8>;
  if (j + 1u < IN_LEN) {
    let col_len = 2u * params.n;
    let base = ({{#shared}}entity_map[j >> 1u]{{/shared}}{{^shared}}(j >> 1u){{/shared}} * col_len + 2u * row + (j & 1u)) * 8u;
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

// S-box u = (w + c)^5, in length-7 Lagrange basis.
fn sbox(m: Mono, out: ptr<function, Lag>) {
  // x^2 is degree-2, so compute it in the monomial basis (mono_sqr_g = 3 muls) and
  // promote to Lagrange; x^4 and x^5 exceed degree-2 and stay in Lagrange. x^5 of a
  // degree-1 line is degree-5, so the whole sbox runs at L=6 (one eval cheaper than 7);
  // the L=7 lift is applied once per subrelation via lag_extend6 before the gate multiply.
  var x: Lag; lag_from_mono2(m, 6u, &x);
  var t2: Lag; lag_from_mono3(mono_sqr_g(m), 6u, &t2);
  var t4: Lag; lag_sqr(&t2, 6u, &t4);
  lag_mul(&t4, &x, 6u, out);
}

// subrel k: q_pos_by_scaling * (v_k - w_k_shift), written at out offset k0.
fn accum_v(row: u32, k0: u32, v: ptr<function, Lag>, w_shift: Mono, qps: ptr<function, Lag>) {
  var wsl: Lag; lag_from_mono2(w_shift, 6u, &wsl);
  var d: Lag; lag_sub(v, &wsl, 6u, &d);
  var de: Lag; lag_extend6(&d, &de);
  var s: Lag; lag_mul(qps, &de, 7u, &s);
  for (var k: u32 = 0u; k < 7u; k = k + 1u) { write_eval(row, k0 + k, s[k]); }
}

@compute @workgroup_size({{ workgroup_size }})
fn poseidon2_external_main(@builtin(global_invocation_id) gid: vec3<u32>) {
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
  let c1 = edge(row, 16u);  // q_l
  let c2 = edge(row, 18u);  // q_r
  let c3 = edge(row, 20u);  // q_o
  let c4 = edge(row, 22u);  // q_4
  let qpe = edge(row, 24u); // q_poseidon2_external
  let scaling = ld(row, 26u);

  var u1: Lag; sbox(mono_add(w1, c1), &u1);
  var u2: Lag; sbox(mono_add(w2, c2), &u2);
  var u3: Lag; sbox(mono_add(w3, c3), &u3);
  var u4: Lag; sbox(mono_add(w4, c4), &u4);

  // M_E * u via additions (matches the C++ summand structure). The v_k are degree-5
  // (linear combos of the degree-5 sbox outputs), carried at L=6; accum_v lifts to L=7.
  var t0: Lag; lag_add(&u1, &u2, 6u, &t0);   // u1 + u2
  var t1: Lag; lag_add(&u3, &u4, 6u, &t1);   // u3 + u4
  var t2a: Lag; lag_add(&u2, &u2, 6u, &t2a);
  var t2: Lag; lag_add(&t2a, &t1, 6u, &t2);  // 2u2 + u3 + u4
  var t3a: Lag; lag_add(&u4, &u4, 6u, &t3a);
  var t3: Lag; lag_add(&t3a, &t0, 6u, &t3);  // u1 + u2 + 2u4

  var v4a: Lag; lag_add(&t1, &t1, 6u, &v4a);
  var v4b: Lag; lag_add(&v4a, &v4a, 6u, &v4b);
  var v4: Lag; lag_add(&v4b, &t3, 6u, &v4);  // 4u3+4u4 + (u1+u2+2u4) = u1+u2+4u3+6u4

  var v2a: Lag; lag_add(&t0, &t0, 6u, &v2a);
  var v2b: Lag; lag_add(&v2a, &v2a, 6u, &v2b);
  var v2: Lag; lag_add(&v2b, &t2, 6u, &v2);  // 4u1+4u2 + (2u2+u3+u4) = 4u1+6u2+u3+u4

  var v1: Lag; lag_add(&t3, &v2, 6u, &v1);   // 5u1+7u2+u3+3u4
  var v3: Lag; lag_add(&t2, &v4, 6u, &v3);   // u1+3u2+5u3+7u4

  // Gate scalar is degree-1; build it directly at L=7 (adds only) for the final multiply.
  var qps: Lag; lag_from_mono2(mono_mul_scalar(qpe, scaling), 7u, &qps);

  accum_v(row, 0u, &v1, w1s, &qps);
  accum_v(row, 7u, &v2, w2s, &qps);
  accum_v(row, 14u, &v3, w3s, &qps);
  accum_v(row, 21u, &v4, w4s, &qps);
}
