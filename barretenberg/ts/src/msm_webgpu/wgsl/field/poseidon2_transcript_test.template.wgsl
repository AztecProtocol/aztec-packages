// GPU Fiat-Shamir for sumcheck: derive a round challenge from the round univariate
// on the GPU via Poseidon2, so the whole sumcheck stays resident in one command
// buffer (no per-round CPU round-trip to hash the transcript).
//
// Exact mirror of crypto/poseidon2 (t=4, d=5, R_F=8, R_P=56; sponge rate=3,
// capacity=1, IV=(len<<64)). The round challenge is
//   u_i = Poseidon2.hash([running, S_i[0..7]])
// over 9 field elements (so 3 duplex permutations), equivalent Poseidon2 work to the
// C++ transcript get_challenge. Then the gate-separator running product is advanced:
//   c_{i+1} = c_i * ((1-u_i) + u_i*beta_i) = c_i * (1 + u_i*(beta_i-1)).
// One thread (the sponge is sequential). All values Montgomery 8x u32. Round
// constants and the internal diagonal (Montgomery) are uploaded once.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}

alias State = array<array<u32, 8>, 4>;

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

// External MDS (matrix_multiplication_4x4): adds only.
fn p2_ext(s: ptr<function, State>) {
  let t0 = fr_add_f8((*s)[0], (*s)[1]);
  let t1 = fr_add_f8((*s)[2], (*s)[3]);
  var t2 = fr_add_f8((*s)[1], (*s)[1]); t2 = fr_add_f8(t2, t1);
  var t3 = fr_add_f8((*s)[3], (*s)[3]); t3 = fr_add_f8(t3, t0);
  var t4 = fr_add_f8(t1, t1); t4 = fr_add_f8(t4, t4); t4 = fr_add_f8(t4, t3);
  var t5 = fr_add_f8(t0, t0); t5 = fr_add_f8(t5, t5); t5 = fr_add_f8(t5, t2);
  let t6 = fr_add_f8(t3, t5);
  let t7 = fr_add_f8(t2, t4);
  (*s)[0] = t6; (*s)[1] = t5; (*s)[2] = t7; (*s)[3] = t4;
}

// Internal layer: s[i] = (D_i-1)*s[i] + sum(s).
fn p2_internal(s: ptr<function, State>) {
  let sum = fr_add_f8(fr_add_f8((*s)[0], (*s)[1]), fr_add_f8((*s)[2], (*s)[3]));
  (*s)[0] = fr_add_f8(montgomery_product_f8((*s)[0], ld_diag(0u)), sum);
  (*s)[1] = fr_add_f8(montgomery_product_f8((*s)[1], ld_diag(1u)), sum);
  (*s)[2] = fr_add_f8(montgomery_product_f8((*s)[2], ld_diag(2u)), sum);
  (*s)[3] = fr_add_f8(montgomery_product_f8((*s)[3], ld_diag(3u)), sum);
}

fn p2_add_rc_full(s: ptr<function, State>, round: u32) {
  (*s)[0] = fr_add_f8((*s)[0], ld_rc(round, 0u));
  (*s)[1] = fr_add_f8((*s)[1], ld_rc(round, 1u));
  (*s)[2] = fr_add_f8((*s)[2], ld_rc(round, 2u));
  (*s)[3] = fr_add_f8((*s)[3], ld_rc(round, 3u));
}
fn p2_sbox_full(s: ptr<function, State>) {
  (*s)[0] = p2_sbox((*s)[0]);
  (*s)[1] = p2_sbox((*s)[1]);
  (*s)[2] = p2_sbox((*s)[2]);
  (*s)[3] = p2_sbox((*s)[3]);
}

fn p2_permute(s: ptr<function, State>) {
  p2_ext(s);
  for (var i: u32 = 0u; i < p2p.rf_half; i = i + 1u) { p2_add_rc_full(s, i); p2_sbox_full(s); p2_ext(s); }
  for (var i: u32 = p2p.rf_half; i < p2p.p_end; i = i + 1u) {
    (*s)[0] = fr_add_f8((*s)[0], ld_rc(i, 0u));
    (*s)[0] = p2_sbox((*s)[0]);
    p2_internal(s);
  }
  for (var i: u32 = p2p.p_end; i < p2p.nr; i = i + 1u) { p2_add_rc_full(s, i); p2_sbox_full(s); p2_ext(s); }
}

@compute @workgroup_size(1)
fn poseidon2_transcript_main() {
  // Inputs to hash: [running, S_i[0], ..., S_i[7]] (9 field elements).
  let running = ld_run();
  var st: State;
  var zero: array<u32, 8>;
{{#f8_words}}
  zero[{{i}}] = 0u;
{{/f8_words}}
  st[0] = zero; st[1] = zero; st[2] = zero; st[3] = ld_sc(1u); // state[capacity] = iv

  // 9 inputs at rate 3 => 3 duplex permutations: caches [running,u0,u1],[u2,u3,u4],[u5,u6,u7].
  st[0] = fr_add_f8(st[0], running);    st[1] = fr_add_f8(st[1], ld_uni(0u)); st[2] = fr_add_f8(st[2], ld_uni(1u)); p2_permute(&st);
  st[0] = fr_add_f8(st[0], ld_uni(2u)); st[1] = fr_add_f8(st[1], ld_uni(3u)); st[2] = fr_add_f8(st[2], ld_uni(4u)); p2_permute(&st);
  st[0] = fr_add_f8(st[0], ld_uni(5u)); st[1] = fr_add_f8(st[1], ld_uni(6u)); st[2] = fr_add_f8(st[2], ld_uni(7u)); p2_permute(&st);

  let u = st[0]; // squeeze
  st_out(u);
  st_run(u); // running := u

  // c_{i+1} = c_i * (1 + u*(beta_i - 1))
  let one = get_r_f8();
  let beta = ld_sc(0u);
  let c = ld_c();
  let term = fr_add_f8(one, montgomery_product_f8(u, fr_sub_f8(beta, one)));
  st_c(montgomery_product_f8(c, term));
}
