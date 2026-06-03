// Short-monomial (coefficient-basis) univariate arithmetic — the WGSL mirror
// of barretenberg's UnivariateCoefficientBasis (univariate_coefficient_basis.hpp)
// used by the MegaFlavor sumcheck relations under USE_SHORT_MONOMIALS=true.
//
// A `Mono` holds a degree-1 or degree-2 univariate as three Fr coefficients
// (8x u32 Montgomery each), matching the C++ std::array<Fr,3>:
//
//   degree-1, "cached"   (from an edge): c0=a0, c1=a1,            c2=a0+a1
//   degree-1, "general"  (after arith) : c0=a0, c1=a1,            c2 unused
//   degree-2             (a product)   : c0=a0, c1=a1+a2 (PACKED), c2=a2
//
// The degree-2 packing is deliberate (Karatsuba): for a product the middle
// coefficient is stored as (X-coeff + X^2-coeff), so the polynomial is
//   P(X) = c0 + (c1 - c2)*X + c2*X^2.
// The promotion recurrences (see the relation/test kernels) consume exactly
// this packing — never re-derive the bare X coefficient.
//
// "cached" (has_a0_plus_a1) is true ONLY for a fresh edge; any arithmetic
// result is "general". Pick the mul/sqr variant by the static cache state of
// each operand at the call site (WGSL has no templates — mirror the C++
// template flags by choosing the right function name).
//
// Requires field8 (fr_add_f8/fr_sub_f8/montgomery_product_f8). Fr ops are
// representation-agnostic (Montgomery), so a Mono of Montgomery coefficients
// stays in the Montgomery domain throughout.

struct Mono {
  c0: array<u32, 8>,
  c1: array<u32, 8>,
  c2: array<u32, 8>,
}

// Lagrange edge {v0, v1} -> degree-1 cached monomial: a0=v0, a1=v1-v0, a0+a1=v1.
fn mono_from_edge(v0: array<u32, 8>, v1: array<u32, 8>) -> Mono {
  return Mono(v0, fr_sub_f8(v1, v0), v1);
}

// === degree-1 * degree-1 -> degree-2 (Karatsuba, 3 muls). ===
// c0 = a0*b0 ; c2 = a1*b1 ; c1 = (a0+a1)*(b0+b1) - c0  (packed = X-coeff + X^2-coeff).
// Four variants by which operands carry the (a0+a1) cache in c2.
fn mono_mul_cc(a: Mono, b: Mono) -> Mono {   // both cached
  let c0 = montgomery_product_f8(a.c0, b.c0);
  let c2 = montgomery_product_f8(a.c1, b.c1);
  let c1 = fr_sub_f8(montgomery_product_f8(a.c2, b.c2), c0);
  return Mono(c0, c1, c2);
}
fn mono_mul_cg(a: Mono, b: Mono) -> Mono {   // a cached, b general
  let c0 = montgomery_product_f8(a.c0, b.c0);
  let c2 = montgomery_product_f8(a.c1, b.c1);
  let c1 = fr_sub_f8(montgomery_product_f8(a.c2, fr_add_f8(b.c0, b.c1)), c0);
  return Mono(c0, c1, c2);
}
fn mono_mul_gc(a: Mono, b: Mono) -> Mono {   // a general, b cached
  let c0 = montgomery_product_f8(a.c0, b.c0);
  let c2 = montgomery_product_f8(a.c1, b.c1);
  let c1 = fr_sub_f8(montgomery_product_f8(fr_add_f8(a.c0, a.c1), b.c2), c0);
  return Mono(c0, c1, c2);
}
fn mono_mul_gg(a: Mono, b: Mono) -> Mono {   // both general
  let c0 = montgomery_product_f8(a.c0, b.c0);
  let c2 = montgomery_product_f8(a.c1, b.c1);
  let c1 = fr_sub_f8(montgomery_product_f8(fr_add_f8(a.c0, a.c1), fr_add_f8(b.c0, b.c1)), c0);
  return Mono(c0, c1, c2);
}

// === degree-1 squared -> degree-2. ===
// c0 = a0^2 ; c2 = a1^2 ; c1 = 2*a0*a1 + a1^2 (= (a0+a1+a0)*a1).
fn mono_sqr_c(a: Mono) -> Mono {   // cached: reuse c2 = a0+a1
  let c0 = montgomery_product_f8(a.c0, a.c0);
  let c2 = montgomery_product_f8(a.c1, a.c1);
  let c1 = montgomery_product_f8(fr_add_f8(a.c2, a.c0), a.c1);
  return Mono(c0, c1, c2);
}
fn mono_sqr_g(a: Mono) -> Mono {   // general
  let c0 = montgomery_product_f8(a.c0, a.c0);
  let c2 = montgomery_product_f8(a.c1, a.c1);
  var t = montgomery_product_f8(a.c0, a.c1);
  t = fr_add_f8(t, t);
  let c1 = fr_add_f8(t, c2);
  return Mono(c0, c1, c2);
}

// === same-degree add / sub (all three coefficients). ===
// Correct for deg2 +/- deg2, and for deg1 +/- deg1 when the result is consumed
// as degree-1 (its c2 is then irrelevant). For mixed-degree combinations the
// degree-2 operand's c2 must be preserved alone — use a dedicated variant.
fn mono_add(a: Mono, b: Mono) -> Mono {
  return Mono(fr_add_f8(a.c0, b.c0), fr_add_f8(a.c1, b.c1), fr_add_f8(a.c2, b.c2));
}
fn mono_sub(a: Mono, b: Mono) -> Mono {
  return Mono(fr_sub_f8(a.c0, b.c0), fr_sub_f8(a.c1, b.c1), fr_sub_f8(a.c2, b.c2));
}
fn mono_neg(a: Mono) -> Mono {
  var z: array<u32, 8>;
  return Mono(fr_sub_f8(z, a.c0), fr_sub_f8(z, a.c1), fr_sub_f8(z, a.c2));
}

// Add a degree-1 monomial `b` into a degree-2 monomial `a`, touching only the
// constant and linear terms — `a`'s c2 (its X^2 coeff) is preserved, since a
// degree-1 operand has no X^2 term. Mirrors the C++ UnivariateCoefficientBasis
// operator+ for (domain_end=3, other_domain_end=2). Use this instead of mono_add
// when folding a degree-1 term into a degree-2 accumulator — mono_add would add
// b's c2 (for a deg-1 b that is its stale (a0+a1) cache), corrupting the result.
fn mono_add_lin(a: Mono, b: Mono) -> Mono {
  return Mono(fr_add_f8(a.c0, b.c0), fr_add_f8(a.c1, b.c1), a.c2);
}

// Subtract a degree-1 monomial `b` from a degree-2 monomial `a`, touching only
// the constant and linear terms — the sub counterpart of mono_add_lin. `a`'s c2
// (its X^2 coeff) is preserved.
fn mono_sub_lin(a: Mono, b: Mono) -> Mono {
  return Mono(fr_sub_f8(a.c0, b.c0), fr_sub_f8(a.c1, b.c1), a.c2);
}

// === monomial-scalar ops. ===
// add/sub touch only the constant term (c0); scale touches every coefficient.
fn mono_add_scalar(a: Mono, s: array<u32, 8>) -> Mono {
  return Mono(fr_add_f8(a.c0, s), a.c1, a.c2);
}
fn mono_sub_scalar(a: Mono, s: array<u32, 8>) -> Mono {
  return Mono(fr_sub_f8(a.c0, s), a.c1, a.c2);
}
fn mono_mul_scalar(a: Mono, s: array<u32, 8>) -> Mono {
  return Mono(montgomery_product_f8(a.c0, s), montgomery_product_f8(a.c1, s), montgomery_product_f8(a.c2, s));
}
