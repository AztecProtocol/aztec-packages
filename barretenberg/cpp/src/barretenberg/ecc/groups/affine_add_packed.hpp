#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/fields/batch_inversion.hpp"
#include "barretenberg/ecc/fields/vector_field_push_span.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <utility>

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
    batch_invert(s.dx, s.inv);

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
}

// Working buffers for batch_affine_double, one VectorFieldPushSpan each: the per-element denominators
// den = 2y, numerators num = 3x^2, and inverted denominators inv. All three must be distinct from one
// another and from the point spans, and inv must not alias den (batch_invert cannot invert in place).
template <typename Params> struct BatchAffineDoubleScratch {
    VectorFieldPushSpan<Params> den;
    VectorFieldPushSpan<Params> num;
    VectorFieldPushSpan<Params> inv;
};

// Inner kernel of the Stage 6b reduction's doubling pass, driven by batch_affine_double_indexed_packed.
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
    batch_invert(s.den, s.inv);

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
}

// The four indexed bucket-reduce kernels below (add/double × scalar/packed) compute the same affine
// arithmetic and differ ONLY in memory movement: the _scalar variants mutate the scattered SoA bucket
// slots in place (one field at a time), while the _packed variants gather the indexed operands into
// contiguous VectorFields, run the SIMD kernel above, and scatter the results back. The gather/scatter
// bridge only earns its cost when the arithmetic is SIMD-wide, so the caller runs _packed only on
// single-threaded WASM-SIMD MSMs and _scalar everywhere else (native, and multi-threaded WASM where
// SIMD-6b is gated off).

// Scalar SoA twin of batch_affine_add_indexed_packed (and of the AoS batch_affine_add_indexed_impl):
// buckets[pairs[k].first] += buckets[pairs[k].second] over a column view, with one field inversion for
// the whole batch (Montgomery's trick). This is the native path of the Stage 6b reduction; the WASM
// path is the packed wrapper. `scratch` holds num_pairs field elements. Same preconditions as the
// packed wrapper (clean pre-filtered pairs, distinct dsts disjoint from srcs).
template <typename Field>
inline void batch_affine_add_indexed_scalar(AffineColumnSpan<Field>& buckets,
                                            const std::pair<uint32_t, uint32_t>* pairs,
                                            size_t num_pairs,
                                            Field* scratch) noexcept
{
    if (num_pairs == 0) {
        return;
    }
    Field acc = Field::one();

    // Forward pass: build the batch-inversion product, treating dst as point 2, src as point 1.
    for_each_indexed_pair<Direction::Forward>(
        buckets, pairs, num_pairs, [&](Field& x_dst, Field& y_dst, const Field& x_src, const Field& y_src, size_t i) {
            scratch[i] = x_src + x_dst; // x1 + x2 (saved for the backward pass)
            x_dst -= x_src;             // x2 - x1 (denominator)
            y_dst -= y_src;             // y2 - y1 (numerator before scaling)
            y_dst *= acc;
            acc *= x_dst;
        });

    if (acc == Field::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_add_indexed_scalar");
    }
    acc = acc.invert();

    // Backward pass: complete each slope and write x3, y3 into the dst slot.
    for_each_indexed_pair<Direction::Backward>(
        buckets, pairs, num_pairs, [&](Field& x_dst, Field& y_dst, const Field& x_src, const Field& y_src, size_t i) {
            y_dst *= acc; // slope = (y2 - y1) / (x2 - x1)
            acc *= x_dst; // unwind the running inverse (x_dst still holds x2 - x1)
            x_dst = y_dst.sqr();
            x_dst -= scratch[i]; // x3 = slope^2 - (x1 + x2)
            Field temp = x_src - x_dst;
            temp *= y_dst;
            y_dst = temp - y_src; // y3 = slope * (x1 - x3) - y1
        });
}

// Scalar SoA twin of batch_affine_double_indexed_packed: buckets[indices[k]] = 2 * buckets[indices[k]]
// over a column view, one field inversion for the whole batch. Native path of the Stage 6b doublings.
template <typename Field>
inline void batch_affine_double_indexed_scalar(AffineColumnSpan<Field>& buckets,
                                               const uint32_t* indices,
                                               size_t num_points,
                                               Field* scratch) noexcept
{
    if (num_points == 0) {
        return;
    }
    Field acc = Field::one();

    for_each_indexed_point<Direction::Forward>(buckets, indices, num_points, [&](Field& x, Field& y, size_t i) {
        scratch[i] = x.sqr();
        scratch[i] = scratch[i] + scratch[i] + scratch[i]; // 3 x^2
        scratch[i] *= acc;
        acc *= (y + y); // 2y
    });

    if (acc == Field::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_double_indexed_scalar");
    }
    acc = acc.invert();

    for_each_indexed_point<Direction::Backward>(buckets, indices, num_points, [&](Field& x, Field& y, size_t i) {
        scratch[i] *= acc; // slope = 3x^2 / 2y
        acc *= (y + y);
        const Field tx = x;
        x = scratch[i].sqr() - (x + x); // x3 = slope^2 - 2x
        y = scratch[i] * (tx - x) - y;  // y3 = slope * (x - x3) - y
    });
}

// buckets[pairs[k].first] += buckets[pairs[k].second] for every pair, with `buckets` a column (SoA)
// view: gather the two operand points by index into packed VectorFields, run batch_affine_add, scatter
// each sum back to its dst index. The WASM-SIMD replacement for the scalar batch_affine_add_indexed_impl
// — same contract, but the field arithmetic runs W elements at a time and the column layout lets the
// gather/scatter share one index array per coordinate.
//
// Preconditions (identical to the scalar impl, guaranteed by the caller's try_filter_pair): every
// referenced bucket is a finite point, each pair's two points have distinct x (dx != 0, so no doubling
// or inverse), the dst indices pairs[*].first are distinct, and the dst set is disjoint from the src
// set. gather_from reads all operands before scatter_to writes anything, so the in-place mutation is
// hazard-free regardless of overlap.
//
// lhs / rhs / out are caller-owned scratch coordinate spans (out may share lhs's backing); the wrapper
// reset()s and refills them. Their capacity bounds the chunk size — a num_pairs larger than capacity is
// processed in capacity-sized chunks, one batch_affine_add (hence one field inversion) per chunk.
template <typename Params>
inline void batch_affine_add_indexed_packed(AffineColumnSpan<typename VectorField<Params>::Field>& buckets,
                                            const std::pair<uint32_t, uint32_t>* pairs,
                                            size_t num_pairs,
                                            VectorAffineElementPushSpan<Params>& lhs,
                                            VectorAffineElementPushSpan<Params>& rhs,
                                            VectorAffineElementPushSpan<Params>& out,
                                            BatchAffineAddScratch<Params>& scratch) noexcept
{
    if (num_pairs == 0) {
        return;
    }
    const size_t capacity = lhs.capacity();
    BB_ASSERT(capacity > 0);

    for (size_t span_base = 0; span_base < num_pairs; span_base += capacity) {
        const size_t chunk = std::min(capacity, num_pairs - span_base);
        lhs.gather_from(buckets, [&](size_t k) { return pairs[span_base + k].first; }, chunk);
        rhs.gather_from(buckets, [&](size_t k) { return pairs[span_base + k].second; }, chunk);
        batch_affine_add(lhs, rhs, out, scratch);
        out.scatter_to(buckets, [&](size_t k) { return pairs[span_base + k].first; });
    }
}

// buckets[indices[k]] = 2 * buckets[indices[k]] for every index, with `buckets` a column (SoA) view:
// gather each point by index into a packed VectorField, run batch_affine_double, scatter the result
// back. The WASM-SIMD replacement for the scalar batch_affine_double_indexed_impl.
//
// Preconditions (identical to the scalar impl): every referenced bucket is a finite point with y != 0,
// and `indices` contains no duplicates. Same chunking and scratch-ownership rules as
// batch_affine_add_indexed_packed.
template <typename Params>
inline void batch_affine_double_indexed_packed(AffineColumnSpan<typename VectorField<Params>::Field>& buckets,
                                               const uint32_t* indices,
                                               size_t num_points,
                                               VectorAffineElementPushSpan<Params>& in,
                                               VectorAffineElementPushSpan<Params>& out,
                                               BatchAffineDoubleScratch<Params>& scratch) noexcept
{
    if (num_points == 0) {
        return;
    }
    const size_t capacity = in.capacity();
    BB_ASSERT(capacity > 0);

    for (size_t span_base = 0; span_base < num_points; span_base += capacity) {
        const size_t chunk = std::min(capacity, num_points - span_base);
        in.gather_from(buckets, [&](size_t k) { return indices[span_base + k]; }, chunk);
        batch_affine_double(in, out, scratch);
        out.scatter_to(buckets, [&](size_t k) { return indices[span_base + k]; });
    }
}

} // namespace bb::group_elements
