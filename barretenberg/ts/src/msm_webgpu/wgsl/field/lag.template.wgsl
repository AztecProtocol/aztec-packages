// Lagrange-basis working univariate (evaluations on the domain {0..L-1}) — the
// WGSL mirror of barretenberg's Univariate<FF,L> / the relation Accumulator.
//
// The MegaFlavor relations assemble their degree-1/degree-2 factors in the Mono
// (coefficient) basis, then — once a product would exceed degree 2 — promote to
// this Lagrange basis and continue with elementwise multiply/add (a degree-d
// poly is determined by its evals, so a pointwise product of L evals is the
// product polynomial's evals). Backed by a fixed 7-slot array
// (MAX_PARTIAL_RELATION_LENGTH = 7); each call uses the first L slots.
//
// All helpers write their result through a `ptr<function, Lag>` out-param rather
// than returning a `Lag` by value. A `Lag` is a nested fixed-size array
// (array<array<u32,8>,7>); returning or passing one by value miscompiles on the
// Tint -> Metal path (Apple Silicon), corrupting every result. Writing in place
// through a pointer sidesteps the copy entirely. Indexing a `Lag` to read one
// eval (a flat array<u32,8>) is fine — only the whole-nested-array copy is bad.
//
// Requires mono (Mono type) + field8 (fr_add_f8 / montgomery_product_f8).

alias Lag = array<array<u32, 8>, 7>;

// degree-1 Mono -> L Lagrange evals: P(k) = c0 + k*c1.
fn lag_from_mono2(m: Mono, L: u32, out: ptr<function, Lag>) {
  var prev = m.c0;
  (*out)[0] = prev;
  for (var k: u32 = 1u; k < L; k = k + 1u) {
    prev = fr_add_f8(prev, m.c1);
    (*out)[k] = prev;
  }
}

// degree-2 Mono (packed c1 = X-coeff + X^2-coeff) -> L Lagrange evals, via the
// second-difference recurrence (mirrors univariate.hpp's deg-2 constructor).
fn lag_from_mono3(m: Mono, L: u32, out: ptr<function, Lag>) {
  var prev = m.c0;
  var to_add = m.c1;
  let deriv = fr_add_f8(m.c2, m.c2);
  (*out)[0] = prev;
  for (var k: u32 = 1u; k < L - 1u; k = k + 1u) {
    prev = fr_add_f8(prev, to_add);
    (*out)[k] = prev;
    to_add = fr_add_f8(to_add, deriv);
  }
  prev = fr_add_f8(prev, to_add);
  (*out)[L - 1u] = prev;
}

fn lag_mul(a: ptr<function, Lag>, b: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  for (var k: u32 = 0u; k < L; k = k + 1u) { (*out)[k] = montgomery_product_f8((*a)[k], (*b)[k]); }
}
fn lag_add(a: ptr<function, Lag>, b: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  for (var k: u32 = 0u; k < L; k = k + 1u) { (*out)[k] = fr_add_f8((*a)[k], (*b)[k]); }
}
fn lag_sub(a: ptr<function, Lag>, b: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  for (var k: u32 = 0u; k < L; k = k + 1u) { (*out)[k] = fr_sub_f8((*a)[k], (*b)[k]); }
}
fn lag_neg(a: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  var z: array<u32, 8>;
  for (var k: u32 = 0u; k < L; k = k + 1u) { (*out)[k] = fr_sub_f8(z, (*a)[k]); }
}
