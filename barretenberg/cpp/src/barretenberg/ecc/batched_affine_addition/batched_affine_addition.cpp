#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include <algorithm>
#include <execution>

namespace bb {

/**
 * @brief Reduce MSM inputs such that the set of scalars contains no duplicates by summing points which share a scalar.
 * @details Since point addition is substantially cheaper than scalar multiplication, it is more efficient in some cases
 * to first sum all points which share a scalar then perform the MSM on the reduced set of inputs. This is achieved via
 * the following procedure:
 *
 * 1) Sort the input {points, scalars} by scalar in order to group points into 'addition sequences' i.e. sets of points
 * to be added together prior to performing the MSM.
 *
 * 2) For each sequence, perform pairwise addition on all points. (If the length of the sequence is odd, the unpaired
 * point is simply carried over to the next round). The inverses needed in the addition formula are batch computed in a
 * single go for all additions to be performed across all sequences in a given round.
 *
 * 3) Perform rounds of pair-wise addition until each sequence is reduced to a single point.
 *
 * @tparam Curve
 * @param scalars
 * @param points
 * @return BatchedAffineAddition<Curve>::ReducedMsmInputs
 */
// template <typename Curve>
// BatchedAffineAddition<Curve>::ReducedMsmInputs BatchedAffineAddition<Curve>::reduce_msm_inputs(
//     AdditionSequences add_sequences)
// {
//     // Perform rounds of pairwise addition until all sets of points sharing a scalar have been reduced to a single
//     point batched_affine_add_in_place(add_sequences);

//     // The reduced MSM inputs are the unique scalars and the reduced points
//     std::span<Fr> output_scalars(unique_scalars.data(), num_unique_scalars);
//     std::span<G1> output_points(updated_points.data(), num_unique_scalars);
//     return { output_scalars, output_points };
// }

/**
 * @brief Batch compute inverses needed for a set of point addition sequences
 * @details Addition of points P_1, P_2 requires computation of a term of the form 1/(P_2.x - P_1.x). For efficiency,
 * these terms are computed all at once for a full set of addition sequences using batch inversion.
 *
 * @tparam Curve
 * @param add_sequences
 */
template <typename Curve>
void BatchedAffineAddition<Curve>::batch_compute_point_addition_slope_inverses(AdditionSequences add_sequences)
{
    auto points = add_sequences.points;
    auto sequence_counts = add_sequences.sequence_counts;

    // Count the total number of point pairs to be added across all addition sequences
    size_t total_num_pairs{ 0 };
    for (auto& count : sequence_counts) {
        total_num_pairs += count >> 1;
    }

    // Define scratch space for batched inverse computations and eventual storage of denominators
    ASSERT(denominators.size() >= total_num_pairs);
    std::span<Fq> scratch_space(denominators.data(), total_num_pairs);
    std::vector<Fq> differences;
    differences.reserve(total_num_pairs);

    // Compute and store successive products of differences (x_2 - x_1)
    Fq accumulator = 1;
    size_t point_idx = 0;
    size_t pair_idx = 0;
    for (auto& count : sequence_counts) {
        const auto num_pairs = count >> 1;
        for (size_t j = 0; j < num_pairs; ++j) {
            ASSERT(pair_idx < total_num_pairs);
            const auto& x1 = points[point_idx++].x;
            const auto& x2 = points[point_idx++].x;

            // It is assumed that the input points are random and thus w/h/p do not share an x-coordinate
            ASSERT(x1 != x2);

            auto diff = x2 - x1;
            differences.emplace_back(diff);

            // Store and update the running product of differences at each stage
            scratch_space[pair_idx++] = accumulator;
            accumulator *= diff;
        }
        // If number of points in the sequence is odd, we skip the last one since it has no pair
        point_idx += (count & 0x01ULL);
    }

    // Invert the full product of differences
    Fq inverse = accumulator.invert();

    // Compute the individual point-pair addition denominators 1/(x2 - x1)
    for (size_t i = 0; i < total_num_pairs; ++i) {
        size_t idx = total_num_pairs - 1 - i;
        scratch_space[idx] *= inverse;
        inverse *= differences[idx];
    }
}

/**
 * @brief In-place summation to reduce a set of addition sequences to a single point for each sequence
 * @details At each round, the set of points in each addition sequence is roughly halved by performing pairwise
 * additions. For sequences with odd length, the unpaired point is simply carried over to the next round. For
 * efficiency, the inverses needed in the point addition slope \lambda are batch computed for the full set of pairwise
 * additions in each round. The method is called recursively until the sequences have all been reduced to a single
 * point.
 *
 * @tparam Curve
 * @param addition_sequences Set of points and counts indicating number of points in each addition chain
 */
template <typename Curve>
void BatchedAffineAddition<Curve>::batched_affine_add_in_place(AdditionSequences add_sequences)
{
    const size_t num_points = add_sequences.points.size();
    if (num_points == 0 || num_points == 1) { // nothing to do
        return;
    }

    // Batch compute terms of the form 1/(x2 -x1) for each pair to be added in this round
    batch_compute_point_addition_slope_inverses(add_sequences);

    auto points = add_sequences.points;
    auto sequence_counts = add_sequences.sequence_counts;

    // Compute pairwise in-place additions for all sequences with more than 1 point
    size_t point_idx = 0;        // index for points to be summed
    size_t result_point_idx = 0; // index for result points
    size_t pair_idx = 0;         // index into array of denominators for each pair
    bool more_additions = false;
    for (auto& count : sequence_counts) {
        const auto num_pairs = count >> 1;
        const bool overflow = static_cast<bool>(count & 0x01ULL);
        // Compute the sum of all pairs in the sequence and store the result in the same points array
        for (size_t j = 0; j < num_pairs; ++j) {
            const auto& point_1 = points[point_idx++];          // first summand
            const auto& point_2 = points[point_idx++];          // second summand
            const auto& denominator = denominators[pair_idx++]; // denominator needed in add formula
            auto& result = points[result_point_idx++];          // target for addition result

            result = affine_add_with_denominator(point_1, point_2, denominator);
        }
        // If the sequence had an odd number of points, simply carry the unpaired point over to the next round
        if (overflow) {
            points[result_point_idx++] = points[point_idx++];
        }

        // Update the sequence counts in place for the next round
        const uint64_t updated_sequence_count = static_cast<uint64_t>(num_pairs) + static_cast<uint64_t>(overflow);
        count = updated_sequence_count;

        // More additions are required if any sequence has not yet been reduced to a single point
        more_additions = more_additions || updated_sequence_count > 1;
    }

    // Recursively perform pairwise additions until all sequences have been reduced to a single point
    if (more_additions) {
        const size_t updated_point_count = result_point_idx;
        std::span<G1> updated_points(&points[0], updated_point_count);
        return batched_affine_add_in_place(
            AdditionSequences{ sequence_counts, updated_points, add_sequences.scratch_space });
    }
}

template class BatchedAffineAddition<curve::Grumpkin>;
template class BatchedAffineAddition<curve::BN254>;
} // namespace bb
