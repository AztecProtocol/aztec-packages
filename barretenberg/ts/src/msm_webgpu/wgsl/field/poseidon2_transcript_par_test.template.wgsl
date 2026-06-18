// Lane-parallel variant of poseidon2_transcript_test: identical math and bindings,
// but the t=4 Poseidon2 state is spread one-lane-per-thread (@workgroup_size(4))
// instead of a single serial thread. This attacks the single-largest single-
// submission GPU cost — the formerly @workgroup_size(1) transcript was 27.3% of
// single-submit GPU time (5.46 ms/round, one serial permutation chain per round).
//
// Parallel structure: the state lives in workgroup memory so the cross-lane layers
// see all four lanes. The 8 full rounds (add_rc, s-box x^5, external MDS) and the
// internal layer's 4 diagonal multiplies run one lane per thread. The 56 partial
// rounds keep their s-box on lane 0 (inherently serial — that chain runs on thread 0
// while 1-3 wait at the barrier), but the internal mixing still parallelizes. The
// result u_i and the gate-separator c-update are computed on lane 0.
//
// Bindings, IV/sponge layout, and round-structure uniform are identical to the
// serial kernel, so the host side (poseidon2_gpu.ts / single_submit.ts) only swaps
// the generator and dispatches the same single workgroup. Correctness is checked by
// the poseidon2 suite, which runs both kernels against the CPU Poseidon2 reference.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}

@group(0) @binding(0) var<storage, read> univariate: array<u32>;     // 8 Fr (this round's univariate)
@group(0) @binding(1) var<storage, read> rc: array<u32>;             // 64*4 Fr (round constants, Montgomery)
@group(0) @binding(2) var<storage, read> diag: array<u32>;           // 4 Fr (D_i - 1, Montgomery)
@group(0) @binding(3) var<storage, read_write> run_buf: array<u32>;  // 1 Fr: running transcript scalar, updated
@group(0) @binding(4) var<storage, read_write> c_buf: array<u32>;    // 1 Fr: gate-separator c_i -> c_{i+1}
@group(0) @binding(5) var<storage, read_write> out_chal: array<u32>; // 1 Fr (u_i, for fold)
@group(0) @binding(6) var<storage, read> scalars: array<u32>;        // [beta_i, iv] Fr (iv = mont(len<<64))

// Round-structure bounds passed as a uniform (not literals) ON PURPOSE: with literal
// bounds the Metal optimizer unrolls the 56-iteration partial-round loop and inlines
// the full montgomery_product chain into one function, overflowing the shader
// compiler (XPC_ERROR_CONNECTION_INTERRUPTED). Runtime bounds keep the loops rolled.
struct P2Params { rf_half: u32, p_end: u32, nr: u32, pad: u32 } // {4, 60, 64, 0}
@group(0) @binding(7) var<uniform> p2p: P2Params;

// The 4-lane Poseidon2 state, shared so the cross-lane MDS / internal layers see all
// four lanes. Each thread owns lane `lid = local_invocation_id.x`.
var<workgroup> st: array<array<u32, 8>, 4>;

fn ld_uni(idx: u32) -> array<u32, 8> {
  let b = idx * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = univariate[b + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_rc(round: u32, k: u32) -> array<u32, 8> {
  let b = (round * 4u + k) * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = rc[b + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_diag(k: u32) -> array<u32, 8> {
  let b = k * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = diag[b + {{i}}u];
{{/f8_words}}
  return v;
}
fn ld_run() -> array<u32, 8> {
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = run_buf[{{i}}u];
{{/f8_words}}
  return v;
}
fn ld_c() -> array<u32, 8> {
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = c_buf[{{i}}u];
{{/f8_words}}
  return v;
}
fn ld_sc(idx: u32) -> array<u32, 8> {
  let b = idx * 8u; var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = scalars[b + {{i}}u];
{{/f8_words}}
  return v;
}
fn st_run(v: array<u32, 8>) {
{{#f8_words}}
  run_buf[{{i}}u] = v[{{i}}];
{{/f8_words}}
}
fn st_c(v: array<u32, 8>) {
{{#f8_words}}
  c_buf[{{i}}u] = v[{{i}}];
{{/f8_words}}
}
fn st_out(v: array<u32, 8>) {
{{#f8_words}}
  out_chal[{{i}}u] = v[{{i}}];
{{/f8_words}}
}

// S-box x^5.
fn p2_sbox(x: array<u32, 8>) -> array<u32, 8> {
  let x2 = montgomery_product_f8(x, x);
  let x4 = montgomery_product_f8(x2, x2);
  return montgomery_product_f8(x, x4);
}

// External MDS (matrix_multiplication_4x4): adds only. Each thread reads all four
// lanes (visible post-barrier), recomputes the shared intermediates t0..t7 (cheap
// adds), selects its lane's output, then all four write back under barriers.
fn p2_ext(lid: u32) {
  let s0 = st[0]; let s1 = st[1]; let s2 = st[2]; let s3 = st[3];
  let t0 = fr_add_f8(s0, s1);
  let t1 = fr_add_f8(s2, s3);
  var t2 = fr_add_f8(s1, s1); t2 = fr_add_f8(t2, t1);
  var t3 = fr_add_f8(s3, s3); t3 = fr_add_f8(t3, t0);
  var t4 = fr_add_f8(t1, t1); t4 = fr_add_f8(t4, t4); t4 = fr_add_f8(t4, t3);
  var t5 = fr_add_f8(t0, t0); t5 = fr_add_f8(t5, t5); t5 = fr_add_f8(t5, t2);
  let t6 = fr_add_f8(t3, t5);
  let t7 = fr_add_f8(t2, t4);
  var outv = t6;
  if (lid == 1u) { outv = t5; } else if (lid == 2u) { outv = t7; } else if (lid == 3u) { outv = t4; }
  workgroupBarrier();
  st[lid] = outv;
  workgroupBarrier();
}

// Internal layer: s[i] = (D_i-1)*s[i] + sum(s). The sum is shared; each thread does
// its own diagonal multiply.
fn p2_internal(lid: u32) {
  let sum = fr_add_f8(fr_add_f8(st[0], st[1]), fr_add_f8(st[2], st[3]));
  let mine = st[lid];
  let newv = fr_add_f8(montgomery_product_f8(mine, ld_diag(lid)), sum);
  workgroupBarrier();
  st[lid] = newv;
  workgroupBarrier();
}

fn p2_add_rc_full(lid: u32, round: u32) {
  st[lid] = fr_add_f8(st[lid], ld_rc(round, lid));
  workgroupBarrier();
}
fn p2_sbox_full(lid: u32) {
  st[lid] = p2_sbox(st[lid]);
  workgroupBarrier();
}

fn p2_permute(lid: u32) {
  p2_ext(lid);
  for (var i: u32 = 0u; i < p2p.rf_half; i = i + 1u) { p2_add_rc_full(lid, i); p2_sbox_full(lid); p2_ext(lid); }
  for (var i: u32 = p2p.rf_half; i < p2p.p_end; i = i + 1u) {
    // Partial round: rc-add + s-box on lane 0 only (the serial chain); internal mixes all.
    if (lid == 0u) {
      var v = fr_add_f8(st[0], ld_rc(i, 0u));
      v = p2_sbox(v);
      st[0] = v;
    }
    workgroupBarrier();
    p2_internal(lid);
  }
  for (var i: u32 = p2p.p_end; i < p2p.nr; i = i + 1u) { p2_add_rc_full(lid, i); p2_sbox_full(lid); p2_ext(lid); }
}

@compute @workgroup_size(4)
fn poseidon2_transcript_par_main(@builtin(local_invocation_id) lid3: vec3<u32>) {
  let lid = lid3.x;

  // Initialize the sponge: state[0..2] = 0, state[capacity=3] = iv.
  var zero: array<u32, 8>;
{{#f8_words}}
  zero[{{i}}] = 0u;
{{/f8_words}}
  if (lid == 3u) { st[3] = ld_sc(1u); } else { st[lid] = zero; }
  workgroupBarrier();

  // 9 inputs at rate 3 => 3 duplex permutations, absorbing [running,u0,u1],
  // [u2,u3,u4],[u5,u6,u7] into lanes 0,1,2 (lane 3 is capacity).
  if (lid == 0u) { st[0] = fr_add_f8(st[0], ld_run()); }
  else if (lid == 1u) { st[1] = fr_add_f8(st[1], ld_uni(0u)); }
  else if (lid == 2u) { st[2] = fr_add_f8(st[2], ld_uni(1u)); }
  workgroupBarrier();
  p2_permute(lid);

  if (lid == 0u) { st[0] = fr_add_f8(st[0], ld_uni(2u)); }
  else if (lid == 1u) { st[1] = fr_add_f8(st[1], ld_uni(3u)); }
  else if (lid == 2u) { st[2] = fr_add_f8(st[2], ld_uni(4u)); }
  workgroupBarrier();
  p2_permute(lid);

  if (lid == 0u) { st[0] = fr_add_f8(st[0], ld_uni(5u)); }
  else if (lid == 1u) { st[1] = fr_add_f8(st[1], ld_uni(6u)); }
  else if (lid == 2u) { st[2] = fr_add_f8(st[2], ld_uni(7u)); }
  workgroupBarrier();
  p2_permute(lid);

  // Squeeze st[0] and advance the transcript + gate-separator product on lane 0.
  if (lid == 0u) {
    let u = st[0];
    st_out(u);
    st_run(u); // running := u
    // c_{i+1} = c_i * (1 + u*(beta_i - 1))
    let one = get_r_f8();
    let beta = ld_sc(0u);
    let c = ld_c();
    let term = fr_add_f8(one, montgomery_product_f8(u, fr_sub_f8(beta, one)));
    st_c(montgomery_product_f8(c, term));
  }
}
