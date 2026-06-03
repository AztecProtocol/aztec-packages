// Phase-2 step-1 test kernel: the short-monomial (Mono) arithmetic the sumcheck
// relations are built from, validated in isolation before any relation.
//
// Per thread, each entry point reads 9 Fr inputs (Montgomery, 8x u32 each):
//   a=(in0,in1)  b=(in2,in3)  c=(in4,in5)  d=(in6,in7)  s=in8
// treats a/b/c/d as Lagrange edges {v0,v1}, runs one Mono expression, promotes
// the result to 7 Lagrange evaluations (domain {0..6}) and writes them out.
// The host diffs those 7 evals against an independent CPU polynomial reference.
//
// Promotion mirrors univariate.hpp's coefficient-basis -> Lagrange constructors
// exactly (degree-1 lines 67-77, degree-2 lines 80-94): the degree-2 form
// consumes the PACKED c1 via the second-difference recurrence.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field8_funcs }}
{{> mono_funcs }}

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> in_buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

const OUT_LEN: u32 = 7u;

// Load the j-th Fr (j in 0..8) of thread `row`.
fn load_in(row: u32, j: u32) -> array<u32, 8> {
  let base = (row * 9u + j) * 8u;
  var v: array<u32, 8>;
{{#f8_words}}
  v[{{i}}] = in_buf[base + {{i}}u];
{{/f8_words}}
  return v;
}

fn write_eval(row: u32, k: u32, v: array<u32, 8>) {
  let base = (row * OUT_LEN + k) * 8u;
{{#f8_words}}
  out_buf[base + {{i}}u] = v[{{i}}];
{{/f8_words}}
}

// Degree-1 monomial -> 7 Lagrange evals: P(k) = c0 + k*c1.
fn store_len2(row: u32, m: Mono) {
  var prev = m.c0;
  write_eval(row, 0u, prev);
  for (var k: u32 = 1u; k < OUT_LEN; k = k + 1u) {
    prev = fr_add_f8(prev, m.c1);
    write_eval(row, k, prev);
  }
}

// Degree-2 monomial (PACKED c1) -> 7 Lagrange evals via second differences.
fn store_len3(row: u32, m: Mono) {
  var prev = m.c0;
  var to_add = m.c1;
  let deriv = fr_add_f8(m.c2, m.c2);
  write_eval(row, 0u, prev);
  for (var k: u32 = 1u; k < OUT_LEN - 1u; k = k + 1u) {
    prev = fr_add_f8(prev, to_add);
    write_eval(row, k, prev);
    to_add = fr_add_f8(to_add, deriv);
  }
  prev = fr_add_f8(prev, to_add);
  write_eval(row, OUT_LEN - 1u, prev);
}

fn edge(row: u32, j0: u32) -> Mono {
  return mono_from_edge(load_in(row, j0), load_in(row, j0 + 1u));
}

// from_edge + degree-1 promotion: linear poly through (0,a0),(1,a1).
@compute @workgroup_size({{ workgroup_size }})
fn mono_edge_promote(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  store_len2(row, edge(row, 0u));
}

// cached * cached : A(X) * B(X).
@compute @workgroup_size({{ workgroup_size }})
fn mono_mul_cc_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  store_len3(row, mono_mul_cc(edge(row, 0u), edge(row, 2u)));
}

// general * general : (A(X) - s) * (B(X) - s).  sub_scalar drops the cache.
@compute @workgroup_size({{ workgroup_size }})
fn mono_mul_gg_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  let s = load_in(row, 8u);
  let a = mono_sub_scalar(edge(row, 0u), s);
  let b = mono_sub_scalar(edge(row, 2u), s);
  store_len3(row, mono_mul_gg(a, b));
}

// cached square : A(X)^2.
@compute @workgroup_size({{ workgroup_size }})
fn mono_sqr_c_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  store_len3(row, mono_sqr_c(edge(row, 0u)));
}

// general square : (A(X) - s)^2.
@compute @workgroup_size({{ workgroup_size }})
fn mono_sqr_g_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  store_len3(row, mono_sqr_g(mono_sub_scalar(edge(row, 0u), load_in(row, 8u))));
}

// degree-2 sub : A*B - C*D.
@compute @workgroup_size({{ workgroup_size }})
fn mono_sub_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  let ab = mono_mul_cc(edge(row, 0u), edge(row, 2u));
  let cd = mono_mul_cc(edge(row, 4u), edge(row, 6u));
  store_len3(row, mono_sub(ab, cd));
}

// degree-2 add : A*B + C*D.
@compute @workgroup_size({{ workgroup_size }})
fn mono_add_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  let ab = mono_mul_cc(edge(row, 0u), edge(row, 2u));
  let cd = mono_mul_cc(edge(row, 4u), edge(row, 6u));
  store_len3(row, mono_add(ab, cd));
}

// scalar scale : (A*B) * s.
@compute @workgroup_size({{ workgroup_size }})
fn mono_scalar_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  store_len3(row, mono_mul_scalar(mono_mul_cc(edge(row, 0u), edge(row, 2u)), load_in(row, 8u)));
}

// scalar add to constant term : (A*B) + s.
@compute @workgroup_size({{ workgroup_size }})
fn mono_add_scalar_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  store_len3(row, mono_add_scalar(mono_mul_cc(edge(row, 0u), edge(row, 2u)), load_in(row, 8u)));
}

// negate : -(A*B).
@compute @workgroup_size({{ workgroup_size }})
fn mono_neg_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= params.n) { return; }
  store_len3(row, mono_neg(mono_mul_cc(edge(row, 0u), edge(row, 2u))));
}
