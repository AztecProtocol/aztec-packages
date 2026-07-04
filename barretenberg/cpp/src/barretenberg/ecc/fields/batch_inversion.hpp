#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/fields/vector_field_push_span.hpp"

#include <array>
#include <cstddef>

namespace bb {

// Given W field elements and the inverse of their product, return each element's own inverse using
// only multiplications (no further inversions). Inversion is expensive, so the caller inverts the
// product once and passes it in as `running_inv` (= 1 / (acc_lanes[0] * ... * acc_lanes[W-1])); this
// then recovers 1 / acc_lanes[k] for every k. It is the cross-lane step of batch_invert, where each
// acc_lanes[k] is one lane's accumulated product. Width-generic, so a SIMD target whose group size
// differs from 5 reuses it unchanged.
template <typename Field, size_t W>
inline std::array<Field, W> compute_lane_inverses(const std::array<Field, W>& acc_lanes, Field running_inv) noexcept
{
    // prefix[k] = acc_lanes[0] * ... * acc_lanes[k]; only prefix[0..W-2] are needed below.
    std::array<Field, W> prefix;
    prefix[0] = acc_lanes[0];
    for (size_t k = 1; k < W - 1; ++k) {
        prefix[k] = prefix[k - 1] * acc_lanes[k];
    }
    std::array<Field, W> inv_lanes;
    for (size_t k = W; k-- > 1;) { // k = W-1, W-2, ..., 1
        inv_lanes[k] = running_inv * prefix[k - 1];
        running_inv = running_inv * acc_lanes[k];
    }
    inv_lanes[0] = running_inv;
    return inv_lanes;
}

// Invert every element of `in` into `out` using exactly one field inversion (Montgomery's trick).
// This is the single sequential step in the affine-add pipeline; the prep and finish passes around it
// run over each element independently.
//
// Why one inversion suffices: each full VectorField holds W elements, one per lane, and the lanes are
// W independent product chains. A forward pass walks the VectorFields once, leaving each lane's total
// product in `acc`; the final fewer-than-W elements (the tail) accumulate their own product. All W
// lane products and the tail product fold into a single value, which is inverted once. The unwind
// then reverses this: compute_lane_inverses splits the inverse back across the W lanes, and a
// backward walk threads each lane's inverse through the VectorFields. The prefix products the
// backward walk needs were stashed in `out` during the forward pass, and are overwritten in place
// with the final inverses — so no extra scratch buffer is needed.
//
// Preconditions: `out` must NOT alias `in`, and out's backing must hold in.num_full_vectors()
// VectorFields. A zero element (which makes the whole product zero) aborts.
template <typename Params>
inline void batch_invert(const VectorFieldPushSpan<Params>& in, VectorFieldPushSpan<Params>& out) noexcept
{
    using Vec = VectorField<Params>;
    using Field = typename Vec::Field;
    constexpr size_t W = Vec::SIZE;

    BB_ASSERT(!in.aliases(out));

    // Forward prefix products: out[i] holds the running prefix; the returned accumulators are each
    // lane's product (bulk) and the tail's product.
    auto [acc, tail_acc] = map_accumulate<Direction::Forward>(
        in, out, Vec::broadcast(Field::one()), Field::one(), [](auto& a, const auto& in_e, auto& out_e) {
            out_e = a;
            a = a * in_e;
        });

    // Pivot: fold all W lane products and the tail product into one value and invert it once.
    const std::array<Field, W> acc_lanes = acc.to_array();
    Field bulk_product = acc_lanes[0];
    for (size_t j = 1; j < W; ++j) {
        bulk_product = bulk_product * acc_lanes[j];
    }
    const Field total = bulk_product * tail_acc;
    if (total.is_zero()) {
        throw_or_abort("batch_invert: attempted to invert zero");
    }
    const Field inv_total = total.invert();
    const Field inv_bulk_product = inv_total * tail_acc; // 1 / (product of all full-group elements)
    const Field inv_tail_acc = inv_total * bulk_product; // 1 / (tail product)
    const std::array<Field, W> lane_inv = compute_lane_inverses<Field, W>(acc_lanes, inv_bulk_product);

    // Backward: thread each lane's inverse back through out's stored prefixes.
    map_accumulate<Direction::Backward>(
        in, out, Vec(lane_inv), inv_tail_acc, [](auto& state, const auto& in_e, auto& out_e) {
            out_e = state * out_e;
            state = state * in_e;
        });
    // map_accumulate already adopted out's cursor from in, so out reports the same size() / tail().
}

} // namespace bb
