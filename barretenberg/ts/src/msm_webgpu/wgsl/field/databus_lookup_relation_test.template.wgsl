// Test kernel: MegaFlavor DatabusLookupRelation accumulate, in isolation. WGSL
// transcription of relations/databus_lookup_relation.hpp under USE_SHORT_MONOMIALS.
// Five bus columns, three subrelations each (15 total, all length 6):
//   (1a) (I*L*T - 1) * is_read   * scaling
//   (1b) (I*L*T - 1) * count     * scaling
//   (2)  (is_read*T - count*L) * I   [linearly dependent: NO scaling]
// where L = lookup_term (shared), T = table_term (per bus), is_read = q_busread *
// column_selector, I = inverses, count = read_counts. All factors are degree-1,
// so every product is exact in length-6 Lagrange. beta/gamma at binding(4).
//
// One thread = one edge. Inputs (49 Fr, Montgomery, 8x u32 each): 24 entity edges
// {v0,v1} (w_l, w_r, databus_id, q_busread, then per bus: value, selector,
// inverses, read_counts) + scaling. Params: [beta, gamma]. Output: 90 Fr.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}
{{> mono_funcs }}
{{> lag_funcs }}

const FR_ONE: array<u32, 8> = array<u32, 8>({{ one_csv }});

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> col_buf: array<u32>;  // num_edges columns, column-major, length 2*n each
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> scaling: array<u32>;  // per-pair gate-separator scaling
@group(0) @binding(4) var<storage, read> param_buf: array<u32>; // [beta, gamma]
{{#shared}}
@group(0) @binding(5) var<storage, read> entity_map: array<u32>;  // shared: local entity -> global column index
{{/shared}}

const IN_LEN: u32 = 49u;   // 24 entities x 2 evals + scaling
const OUT_LEN: u32 = 90u;  // 5 buses x 3 subrelations x 6

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

fn pld(j: u32) -> array<u32, 8> {
  let base = j * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = param_buf[base + {{i}}u];
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

// One bus column: writes the 3 subrelations (1a, 1b, 2) starting at out offset `base`.
//   T = dbg + value (dbg = databus_id*beta + gamma);  is_read = q_busread * selector.
fn accum_bus(
  row: u32, base: u32,
  value: Mono, sel: Mono, inv: Mono, rc: Mono, dbg: Mono,
  llag: ptr<function, Lag>, qbrlag: ptr<function, Lag>, ones: ptr<function, Lag>,
  scaling: array<u32, 8>,
) {
  var tlag: Lag; lag_from_mono2(mono_add(dbg, value), 6u, &tlag);
  var sellag: Lag; lag_from_mono2(sel, 6u, &sellag);
  var rslag: Lag; lag_mul(qbrlag, &sellag, 6u, &rslag);
  var invlag: Lag; lag_from_mono2(inv, 6u, &invlag);
  var rclag: Lag; lag_from_mono2(rc, 6u, &rclag);

  // iltm1 = L * T * I - 1
  var lt: Lag; lag_mul(llag, &tlag, 6u, &lt);
  var lti: Lag; lag_mul(&lt, &invlag, 6u, &lti);
  var iltm1: Lag; lag_sub(&lti, ones, 6u, &iltm1);

  // (1a) iltm1 * is_read * scaling
  var t1: Lag; lag_mul(&iltm1, &rslag, 6u, &t1);
  var s1a: Lag; lag_scale(&t1, scaling, 6u, &s1a);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, base + k, s1a[k]); }

  // (1b) iltm1 * count * scaling
  var t2: Lag; lag_mul(&iltm1, &rclag, 6u, &t2);
  var s1b: Lag; lag_scale(&t2, scaling, 6u, &s1b);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, base + 6u + k, s1b[k]); }

  // (2) (is_read*T - count*L) * I   [no scaling]
  var a: Lag; lag_mul(&rslag, &tlag, 6u, &a);
  var b: Lag; lag_mul(&rclag, llag, 6u, &b);
  var d: Lag; lag_sub(&a, &b, 6u, &d);
  var s2: Lag; lag_mul(&d, &invlag, 6u, &s2);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, base + 12u + k, s2[k]); }
}

@compute @workgroup_size({{ workgroup_size }})
fn databus_lookup_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }

  let w_l = edge(row, 0u);
  let w_r = edge(row, 2u);
  let db_id = edge(row, 4u);
  let qbr = edge(row, 6u);     // q_busread
  let scaling = ld(row, 48u);
  let beta = pld(0u);
  let gamma = pld(1u);

  // shared: L = w_r*beta + w_l + gamma ; dbg = databus_id*beta + gamma ; ones ; q_busread
  let l_mono = mono_add_scalar(mono_add(mono_mul_scalar(w_r, beta), w_l), gamma);
  var llag: Lag; lag_from_mono2(l_mono, 6u, &llag);
  let dbg = mono_add_scalar(mono_mul_scalar(db_id, beta), gamma);
  var qbrlag: Lag; lag_from_mono2(qbr, 6u, &qbrlag);
  var z: array<u32, 8>;
  var ones: Lag; lag_from_mono2(Mono(FR_ONE, z, z), 6u, &ones);

  // bus j entities at edges 8 + 4*j (value), +2 (sel), +4 (inv), +6 (rc); out base 18*j.
  accum_bus(row, 0u, edge(row, 8u), edge(row, 10u), edge(row, 12u), edge(row, 14u), dbg, &llag, &qbrlag, &ones, scaling);
  accum_bus(row, 18u, edge(row, 16u), edge(row, 18u), edge(row, 20u), edge(row, 22u), dbg, &llag, &qbrlag, &ones, scaling);
  accum_bus(row, 36u, edge(row, 24u), edge(row, 26u), edge(row, 28u), edge(row, 30u), dbg, &llag, &qbrlag, &ones, scaling);
  accum_bus(row, 54u, edge(row, 32u), edge(row, 34u), edge(row, 36u), edge(row, 38u), dbg, &llag, &qbrlag, &ones, scaling);
  accum_bus(row, 72u, edge(row, 40u), edge(row, 42u), edge(row, 44u), edge(row, 46u), dbg, &llag, &qbrlag, &ones, scaling);
}
