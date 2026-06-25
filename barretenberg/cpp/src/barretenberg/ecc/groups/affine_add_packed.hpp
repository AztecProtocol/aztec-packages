#pragma once

#include "barretenberg/ecc/fields/batch_inversion.hpp"
#include "barretenberg/ecc/fields/vector_field_push_span.hpp"

#include <cstddef>

namespace bb::group_elements {

// Scratch buffers for batch_affine_add, one VectorFieldPushSpan each: the per-element denominators
// dx = x2 - x1, numerators dy = y2 - y1, coordinate sums xsum = x1 + x2, and inverted denominators
// inv. All four must be distinct from one another and from the point spans, and inv must not alias dx
// (batch_invert cannot invert in place).
template <typename Params> struct BatchAffineAddScratch {
    VectorFieldPushSpan<Params> dx;
    VectorFieldPushSpan<Params> dy;
    VectorFieldPushSpan<Params> xsum;
    VectorFieldPushSpan<Params> inv;
};

// out[i] = lhs[i] + rhs[i] for every i, where each lhs[i] and rhs[i] are distinct, non-opposite affine
// points — the "unsafe" affine add (no points at infinity, no doubling). Three passes:
//
//   prep:         dx = x2 - x1, dy = y2 - y1, xsum = x1 + x2   (per element, via zip_for_each)
//   batch_invert: turn every dx into 1 / dx with a single field inversion
//   finish:       slope = dy / dx; x3 = slope^2 - xsum; y3 = slope * (x1 - x3) - y1
//
// lhs, rhs and out share one shape (same element count). finish forms x3 and y3 before writing either
// output, so out may alias lhs and/or rhs. The scratch spans must be distinct from everything. Equal
// x-coordinates (a zero dx) abort in batch_invert.
template <typename Params>
inline void batch_affine_add(const VectorAffineElementPushSpan<Params>& lhs,
                             const VectorAffineElementPushSpan<Params>& rhs,
                             VectorAffineElementPushSpan<Params>& out,
                             BatchAffineAddScratch<Params>& s) noexcept
{
    zip_for_each(lhs.x,
                 lhs.y,
                 rhs.x,
                 rhs.y,
                 s.dx,
                 s.dy,
                 s.xsum,
                 [](const auto& x1, const auto& y1, const auto& x2, const auto& y2, auto& dx, auto& dy, auto& xsum) {
                     dx = x2 - x1;
                     dy = y2 - y1;
                     xsum = x1 + x2;
                 });
    // give dx the element count that batch_invert will read. this is necessary because the `count` is only updated by
    // `push`, not by directly writing in the indexed slots, which is what is done by the above lambda.
    s.dx.adopt_cursor(lhs.x);
    // compute the inverses of dx and put them in inv
    batch_invert(s.dx, s.inv);

    // x3 and y3 are both computed before either output is written, so out may alias lhs / rhs.
    zip_for_each(
        lhs.x,
        lhs.y,
        s.dy,
        s.inv,
        s.xsum,
        out.x,
        out.y,
        [](const auto& x1, const auto& y1, const auto& dy, const auto& inv, const auto& xsum, auto& ox, auto& oy) {
            auto slope = dy * inv;
            auto x3 = slope * slope - xsum;
            auto y3 = slope * (x1 - x3) - y1;
            ox = x3;
            oy = y3;
        });
    out.adopt_cursor(lhs);
}

// Working buffers for batch_affine_double, one VectorFieldPushSpan each: the per-element denominators
// den = 2y, numerators num = 3x^2, and inverted denominators inv. All three must be distinct from one
// another and from the point spans, and inv must not alias den (batch_invert cannot invert in place).
template <typename Params> struct BatchAffineDoubleScratch {
    VectorFieldPushSpan<Params> den;
    VectorFieldPushSpan<Params> num;
    VectorFieldPushSpan<Params> inv;
};

// NOTE: not wired into the MSM yet — this is the kernel for the (future) Stage 6b doubling pass.
//
// out[i] = 2 * in[i] for every i, where each in[i] is a finite affine point with y != 0 — the
// "unsafe" affine doubling (no point at infinity, no y == 0). Three passes:
//
//   prep:         den = 2y, num = 3x^2                          (per element, via zip_for_each)
//   batch_invert: turn every den into 1 / den with a single field inversion
//   finish:       slope = num / den; x3 = slope^2 - 2x; y3 = slope * (x - x3) - y
//
// in and out share one shape (same element count). finish forms x3 and y3 before writing either
// output, so out may alias in. The scratch spans must be distinct from everything. A zero y (a zero
// denominator) aborts in batch_invert.
template <typename Params>
inline void batch_affine_double(const VectorAffineElementPushSpan<Params>& in,
                                VectorAffineElementPushSpan<Params>& out,
                                BatchAffineDoubleScratch<Params>& s) noexcept
{
    zip_for_each(in.x, in.y, s.den, s.num, [](const auto& x, const auto& y, auto& den, auto& num) {
        den = y + y;
        const auto xx = x * x;
        num = xx + xx + xx;
    });
    s.den.adopt_cursor(in.x); // give den the element count batch_invert reads

    batch_invert(s.den, s.inv);

    // x3 and y3 are both computed before either output is written, so out may alias in.
    zip_for_each(in.x,
                 in.y,
                 s.num,
                 s.inv,
                 out.x,
                 out.y,
                 [](const auto& x, const auto& y, const auto& num, const auto& inv, auto& ox, auto& oy) {
                     auto slope = num * inv;
                     auto x3 = slope * slope - (x + x);
                     auto y3 = slope * (x - x3) - y;
                     ox = x3;
                     oy = y3;
                 });
    out.adopt_cursor(in);
}

} // namespace bb::group_elements
