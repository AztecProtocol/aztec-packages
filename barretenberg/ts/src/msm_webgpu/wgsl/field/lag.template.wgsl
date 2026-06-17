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

// degree-1 Mono -> L Lagrange evals: P(k) = c0 + k*c1. Unrolled over the fixed MAX
// (7) slots with a runtime `if (k < L)` guard — see the note on lag_from_mono3.
fn lag_from_mono2(m: Mono, L: u32, out: ptr<function, Lag>) {
  var prev = m.c0;
  (*out)[0] = prev;
  if (1u < L) { prev = fr_add_f8(prev, m.c1); (*out)[1] = prev; }
  if (2u < L) { prev = fr_add_f8(prev, m.c1); (*out)[2] = prev; }
  if (3u < L) { prev = fr_add_f8(prev, m.c1); (*out)[3] = prev; }
  if (4u < L) { prev = fr_add_f8(prev, m.c1); (*out)[4] = prev; }
  if (5u < L) { prev = fr_add_f8(prev, m.c1); (*out)[5] = prev; }
  if (6u < L) { prev = fr_add_f8(prev, m.c1); (*out)[6] = prev; }
}

// degree-2 Mono (packed c1 = X-coeff + X^2-coeff) -> L Lagrange evals, via the
// second-difference recurrence (mirrors univariate.hpp's deg-2 constructor).
//
// All lag_* helpers below are unrolled over the fixed MAX (7) slots with a runtime
// guard `if (k < L)` rather than a `for k < L` loop. The loop variant indexes the
// Lag with a *runtime* k, which forces the (address-taken) Lag into thread-local
// memory; the unrolled constant indices let the Tint->Metal compiler SROA an
// intermediate Lag into registers when none of its accesses are dynamic. Only
// individual `(*a)[k]` element reads/writes are used — never a whole-Lag copy,
// which would hit the nested-array by-value miscompile — so this is purely a
// register-allocation hint, semantically identical to the loop form.
//
// In lag_from_mono3 the original interior loop runs k in [1, L-1) then writes the
// last eval without advancing `to_add`; doing the advance uniformly for every k is
// equivalent because the final advance is dead (its result is never read).
fn lag_from_mono3(m: Mono, L: u32, out: ptr<function, Lag>) {
  var prev = m.c0;
  var to_add = m.c1;
  let deriv = fr_add_f8(m.c2, m.c2);
  (*out)[0] = prev;
  if (1u < L) { prev = fr_add_f8(prev, to_add); (*out)[1] = prev; to_add = fr_add_f8(to_add, deriv); }
  if (2u < L) { prev = fr_add_f8(prev, to_add); (*out)[2] = prev; to_add = fr_add_f8(to_add, deriv); }
  if (3u < L) { prev = fr_add_f8(prev, to_add); (*out)[3] = prev; to_add = fr_add_f8(to_add, deriv); }
  if (4u < L) { prev = fr_add_f8(prev, to_add); (*out)[4] = prev; to_add = fr_add_f8(to_add, deriv); }
  if (5u < L) { prev = fr_add_f8(prev, to_add); (*out)[5] = prev; to_add = fr_add_f8(to_add, deriv); }
  if (6u < L) { prev = fr_add_f8(prev, to_add); (*out)[6] = prev; }
}

fn lag_mul(a: ptr<function, Lag>, b: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  (*out)[0] = montgomery_product_f8((*a)[0], (*b)[0]);
  if (1u < L) { (*out)[1] = montgomery_product_f8((*a)[1], (*b)[1]); }
  if (2u < L) { (*out)[2] = montgomery_product_f8((*a)[2], (*b)[2]); }
  if (3u < L) { (*out)[3] = montgomery_product_f8((*a)[3], (*b)[3]); }
  if (4u < L) { (*out)[4] = montgomery_product_f8((*a)[4], (*b)[4]); }
  if (5u < L) { (*out)[5] = montgomery_product_f8((*a)[5], (*b)[5]); }
  if (6u < L) { (*out)[6] = montgomery_product_f8((*a)[6], (*b)[6]); }
}
fn lag_sqr(a: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  (*out)[0] = montgomery_product_f8((*a)[0], (*a)[0]);
  if (1u < L) { (*out)[1] = montgomery_product_f8((*a)[1], (*a)[1]); }
  if (2u < L) { (*out)[2] = montgomery_product_f8((*a)[2], (*a)[2]); }
  if (3u < L) { (*out)[3] = montgomery_product_f8((*a)[3], (*a)[3]); }
  if (4u < L) { (*out)[4] = montgomery_product_f8((*a)[4], (*a)[4]); }
  if (5u < L) { (*out)[5] = montgomery_product_f8((*a)[5], (*a)[5]); }
  if (6u < L) { (*out)[6] = montgomery_product_f8((*a)[6], (*a)[6]); }
}
fn lag_scale(a: ptr<function, Lag>, s: array<u32, 8>, L: u32, out: ptr<function, Lag>) {
  (*out)[0] = montgomery_product_f8((*a)[0], s);
  if (1u < L) { (*out)[1] = montgomery_product_f8((*a)[1], s); }
  if (2u < L) { (*out)[2] = montgomery_product_f8((*a)[2], s); }
  if (3u < L) { (*out)[3] = montgomery_product_f8((*a)[3], s); }
  if (4u < L) { (*out)[4] = montgomery_product_f8((*a)[4], s); }
  if (5u < L) { (*out)[5] = montgomery_product_f8((*a)[5], s); }
  if (6u < L) { (*out)[6] = montgomery_product_f8((*a)[6], s); }
}
fn lag_add(a: ptr<function, Lag>, b: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  (*out)[0] = fr_add_f8((*a)[0], (*b)[0]);
  if (1u < L) { (*out)[1] = fr_add_f8((*a)[1], (*b)[1]); }
  if (2u < L) { (*out)[2] = fr_add_f8((*a)[2], (*b)[2]); }
  if (3u < L) { (*out)[3] = fr_add_f8((*a)[3], (*b)[3]); }
  if (4u < L) { (*out)[4] = fr_add_f8((*a)[4], (*b)[4]); }
  if (5u < L) { (*out)[5] = fr_add_f8((*a)[5], (*b)[5]); }
  if (6u < L) { (*out)[6] = fr_add_f8((*a)[6], (*b)[6]); }
}
fn lag_sub(a: ptr<function, Lag>, b: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  (*out)[0] = fr_sub_f8((*a)[0], (*b)[0]);
  if (1u < L) { (*out)[1] = fr_sub_f8((*a)[1], (*b)[1]); }
  if (2u < L) { (*out)[2] = fr_sub_f8((*a)[2], (*b)[2]); }
  if (3u < L) { (*out)[3] = fr_sub_f8((*a)[3], (*b)[3]); }
  if (4u < L) { (*out)[4] = fr_sub_f8((*a)[4], (*b)[4]); }
  if (5u < L) { (*out)[5] = fr_sub_f8((*a)[5], (*b)[5]); }
  if (6u < L) { (*out)[6] = fr_sub_f8((*a)[6], (*b)[6]); }
}
fn lag_neg(a: ptr<function, Lag>, L: u32, out: ptr<function, Lag>) {
  var z: array<u32, 8>;
  (*out)[0] = fr_sub_f8(z, (*a)[0]);
  if (1u < L) { (*out)[1] = fr_sub_f8(z, (*a)[1]); }
  if (2u < L) { (*out)[2] = fr_sub_f8(z, (*a)[2]); }
  if (3u < L) { (*out)[3] = fr_sub_f8(z, (*a)[3]); }
  if (4u < L) { (*out)[4] = fr_sub_f8(z, (*a)[4]); }
  if (5u < L) { (*out)[5] = fr_sub_f8(z, (*a)[5]); }
  if (6u < L) { (*out)[6] = fr_sub_f8(z, (*a)[6]); }
}

// Extend a degree-<=5 univariate known at evals {0..5} (L=6) to add the eval at X=6,
// producing the L=7 representation — EXACT for degree <= 5, and ADDS/SUBS ONLY (no
// montgomery muls). Uses the Newton forward-difference table: for a degree-d poly the
// d-th difference is constant, so P(6) = P(5) + D1[4] + D2[3] + D3[2] + D4[1] + D5[0].
// Lets a degree-5 chain (e.g. the Poseidon x^5 sbox + its combination) run at L=6, with
// the L=7 lift applied once, just before the final degree-1 gate-scalar multiply.
fn lag_extend6(a: ptr<function, Lag>, out: ptr<function, Lag>) {
  (*out)[0] = (*a)[0];
  (*out)[1] = (*a)[1];
  (*out)[2] = (*a)[2];
  (*out)[3] = (*a)[3];
  (*out)[4] = (*a)[4];
  (*out)[5] = (*a)[5];
  let e1_0 = fr_sub_f8((*a)[1], (*a)[0]);
  let e1_1 = fr_sub_f8((*a)[2], (*a)[1]);
  let e1_2 = fr_sub_f8((*a)[3], (*a)[2]);
  let e1_3 = fr_sub_f8((*a)[4], (*a)[3]);
  let e1_4 = fr_sub_f8((*a)[5], (*a)[4]);
  let e2_0 = fr_sub_f8(e1_1, e1_0);
  let e2_1 = fr_sub_f8(e1_2, e1_1);
  let e2_2 = fr_sub_f8(e1_3, e1_2);
  let e2_3 = fr_sub_f8(e1_4, e1_3);
  let e3_0 = fr_sub_f8(e2_1, e2_0);
  let e3_1 = fr_sub_f8(e2_2, e2_1);
  let e3_2 = fr_sub_f8(e2_3, e2_2);
  let e4_0 = fr_sub_f8(e3_1, e3_0);
  let e4_1 = fr_sub_f8(e3_2, e3_1);
  let e5_0 = fr_sub_f8(e4_1, e4_0);
  var r = (*a)[5];
  r = fr_add_f8(r, e1_4);
  r = fr_add_f8(r, e2_3);
  r = fr_add_f8(r, e3_2);
  r = fr_add_f8(r, e4_1);
  r = fr_add_f8(r, e5_0);
  (*out)[6] = r;
}
