// Test kernel: MegaFlavor MemoryRelation accumulate, in isolation. WGSL
// transcription of relations/memory_relation.hpp under USE_SHORT_MONOMIALS. Six
// length-6 subrelations: the combined RAM/ROM memory identity plus the ROM (x2)
// and RAM (x3) consistency checks. eta/eta_two/eta_three are degree-0 params at
// binding(3). Degree-2 factors assemble in the Mono basis (mixed-degree folds
// via mono_add_lin/sub_lin), promoted to length-6 Lagrange via ptr<Lag>.
//
// One thread = one edge. Inputs (31 Fr, Montgomery, 8x u32 each): 15 entity edges
// {v0,v1} (w_l/r/o/4, w_l/r/o/4_shift, q_l, q_r, q_o, q_4, q_m, q_c, q_memory) +
// scaling. Params: [eta, eta_two, eta_three]. Output: 36 Fr (6 subrelations x 6).

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

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> param_buf: array<u32>; // [eta, eta_two, eta_three]

const IN_LEN: u32 = 31u;   // 15 entities x 2 evals + scaling
const OUT_LEN: u32 = 36u;  // 6 subrelations x 6

fn ld(row: u32, j: u32) -> array<u32, 8> {
  let base = (row * IN_LEN + j) * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = in_buf[base + {{i}}u];
{{/f8_words}}
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

@compute @workgroup_size({{ workgroup_size }})
fn memory_main(@builtin(global_invocation_id) gid: vec3<u32>) {
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
  let q1 = edge(row, 16u);  // q_l
  let q2 = edge(row, 18u);  // q_r
  let q3 = edge(row, 20u);  // q_o
  let q4 = edge(row, 22u);
  let qm = edge(row, 24u);
  let qc = edge(row, 26u);
  let qmem = edge(row, 28u);
  let scaling = ld(row, 30u);

  let eta = pld(0u);
  let eta2 = pld(1u);
  let eta3 = pld(2u);

  // partial_record_check (deg 1) = w3*eta3 + w2*eta2 + w1*eta + qc
  var prc = mono_mul_scalar(w3, eta3);
  prc = mono_add(prc, mono_mul_scalar(w2, eta2));
  prc = mono_add(prc, mono_mul_scalar(w1, eta));
  prc = mono_add(prc, qc);
  let mrc = mono_sub(prc, w4); // memory_record_check = neg_access_type (deg 1)

  let neg_index_delta = mono_sub(w1, w1s);
  let idz = mono_add_scalar(neg_index_delta, FR_ONE); // index_delta_is_zero (deg 1)
  let record_delta = mono_sub(w4s, w4);

  let qmbs = mono_mul_scalar(qmem, scaling);       // deg 1
  let q12_mono = mono_mul_gg(q1, q2);              // deg 2
  let q3bms_mono = mono_mul_gg(q3, qmbs);         // deg 2

  let iizoo_mono = mono_add_lin(mono_sqr_g(neg_index_delta), neg_index_delta);   // deg 2
  let avmaim_mono = mono_mul_gg(idz, record_delta);                              // deg 2
  let access_check_mono = mono_add_lin(mono_sqr_g(mrc), mrc);                    // deg 2

  // neg_next_gate_access_type (deg 1) = w3s*eta3 + w2s*eta2 + w1s*eta - w4s
  var nngat = mono_mul_scalar(w3s, eta3);
  nngat = mono_add(nngat, mono_mul_scalar(w2s, eta2));
  nngat = mono_add(nngat, mono_mul_scalar(w1s, eta));
  nngat = mono_sub(nngat, w4s);
  let ngatib_mono = mono_add_lin(mono_sqr_g(nngat), nngat);  // deg 2
  let value_delta = mono_sub(w3s, w3);
  let timestamp_delta = mono_sub(w2s, w2);
  let rtci_mono = mono_sub_lin(mono_mul_gg(idz, timestamp_delta), w3); // deg 2

  // shared Lag terms
  var lq12: Lag; lag_from_mono3(q12_mono, 6u, &lq12);
  var lqmbs: Lag; lag_from_mono2(qmbs, 6u, &lqmbs);
  var q12bmbs: Lag; lag_mul(&lq12, &lqmbs, 6u, &q12bmbs);   // deg 3
  var q3bms: Lag; lag_from_mono3(q3bms_mono, 6u, &q3bms);   // deg 2
  var iizoo: Lag; lag_from_mono3(iizoo_mono, 6u, &iizoo);   // deg 2

  // subrel 1: ROM consistency 1 = adjacent_values_match * q12bmbs
  var avmaim: Lag; lag_from_mono3(avmaim_mono, 6u, &avmaim);
  var sub1: Lag; lag_mul(&avmaim, &q12bmbs, 6u, &sub1);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, 6u + k, sub1[k]); }

  // subrel 2: ROM consistency 2 = index_increases_by_zero_or_one * q12bmbs
  var sub2: Lag; lag_mul(&iizoo, &q12bmbs, 6u, &sub2);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, 12u + k, sub2[k]); }

  // subrel 3: RAM consistency 1 = avmaim_read * q3bms
  var ivd: Lag; lag_from_mono3(mono_mul_gg(idz, value_delta), 6u, &ivd);
  var nngat1: Lag; lag_from_mono2(mono_add_scalar(nngat, FR_ONE), 6u, &nngat1);
  var avmaim_read: Lag; lag_mul(&ivd, &nngat1, 6u, &avmaim_read);
  var sub3: Lag; lag_mul(&avmaim_read, &q3bms, 6u, &sub3);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, 18u + k, sub3[k]); }

  // subrel 4: RAM consistency 2 = index_increases_by_zero_or_one * q3bms
  var sub4: Lag; lag_mul(&iizoo, &q3bms, 6u, &sub4);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, 24u + k, sub4[k]); }

  // subrel 5: RAM consistency 3 = next_gate_access_type_is_boolean * q3bms
  var ngatib: Lag; lag_from_mono3(ngatib_mono, 6u, &ngatib);
  var sub5: Lag; lag_mul(&ngatib, &q3bms, 6u, &sub5);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, 30u + k, sub5[k]); }

  // subrel 0: memory_identity
  //   ROM_cci = memory_record_check * q12       (deg 3)
  //   + RAM_timestamp_check * (q4*q1)           (deg 4)
  //   + memory_record_check * (qm*q1)           (deg 3)
  //   then * qmbs                               (deg 5)
  //   + RAM_consistency_check (access_check*q3bms, deg 4)
  var lmrc: Lag; lag_from_mono2(mrc, 6u, &lmrc);
  var lq12b: Lag; lag_from_mono3(q12_mono, 6u, &lq12b);
  var rom_cci: Lag; lag_mul(&lmrc, &lq12b, 6u, &rom_cci);
  var lrtci: Lag; lag_from_mono3(rtci_mono, 6u, &lrtci);
  var lq4q1: Lag; lag_from_mono3(mono_mul_gg(q4, q1), 6u, &lq4q1);
  var term_rtci: Lag; lag_mul(&lrtci, &lq4q1, 6u, &term_rtci);
  var lqmq1: Lag; lag_from_mono3(mono_mul_gg(qm, q1), 6u, &lqmq1);
  var term_mrc: Lag; lag_mul(&lmrc, &lqmq1, 6u, &term_mrc);
  var mid_a: Lag; lag_add(&rom_cci, &term_rtci, 6u, &mid_a);
  var mid: Lag; lag_add(&mid_a, &term_mrc, 6u, &mid);
  var mid_scaled: Lag; lag_mul(&mid, &lqmbs, 6u, &mid_scaled);
  var lacc: Lag; lag_from_mono3(access_check_mono, 6u, &lacc);
  var ram_cci: Lag; lag_mul(&lacc, &q3bms, 6u, &ram_cci);
  var sub0: Lag; lag_add(&mid_scaled, &ram_cci, 6u, &sub0);
  for (var k: u32 = 0u; k < 6u; k = k + 1u) { write_eval(row, k, sub0[k]); }
}
