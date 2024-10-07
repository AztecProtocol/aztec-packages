#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include <algorithm>
#include <execution>
#include <set>

namespace bb {

// WORKTODO repurpose this comment
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
 */

/**
 * @brief Batch compute inverses needed for a set of point addition sequences
 * @details Addition of points P_1, P_2 requires computation of a term of the form 1/(P_2.x - P_1.x). For efficiency,
 * these terms are computed all at once for a full set of addition sequences using batch inversion.
 *
 * @tparam Curve
 * @param add_sequences
 */
template <typename Curve>
std::span<typename BatchedAffineAddition<Curve>::Fq> BatchedAffineAddition<
    Curve>::batch_compute_point_addition_slope_inverses(AdditionSequences add_sequences)
{
    auto points = add_sequences.points;
    auto sequence_counts = add_sequences.sequence_counts;

    // Count the total number of point pairs to be added across all addition sequences
    size_t total_num_pairs{ 0 };
    for (auto& count : sequence_counts) {
        total_num_pairs += count >> 1;
    }

    // Define scratch space for batched inverse computations and eventual storage of denominators
    ASSERT(add_sequences.scratch_space.size() >= 2 * total_num_pairs);
    std::span<Fq> denominators = add_sequences.scratch_space.subspan(0, total_num_pairs);
    std::span<Fq> differences = add_sequences.scratch_space.subspan(total_num_pairs, 2 * total_num_pairs);

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
            differences[pair_idx] = diff;

            // Store and update the running product of differences at each stage
            denominators[pair_idx++] = accumulator;
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
        denominators[idx] *= inverse;
        inverse *= differences[idx];
    }

    return denominators;
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
    std::span<Fq> denominators = batch_compute_point_addition_slope_inverses(add_sequences);

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
        const uint32_t updated_sequence_count = static_cast<uint32_t>(num_pairs) + static_cast<uint32_t>(overflow);
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

template <typename Curve>
std::vector<typename AdditionManager<Curve>::G1> AdditionManager<Curve>::batched_affine_add_in_place_parallel(
    const std::span<G1>& points, [[maybe_unused]] std::vector<uint32_t>& sequence_endpoints)
{
    const size_t num_threads = 8;
    ASSERT(points.size() % num_threads == 0);

    // instantiate scratch space for point addition denominators their calculation
    std::vector<Fq> scratch_space_vector(points.size());
    std::span<Fq> scratch_space(scratch_space_vector);

    std::vector<AdditionSequences> sequences;
    size_t points_per_thread = points.size() / num_threads; // Points per thread
    size_t offset = 0;
    for (size_t i = 0; i < num_threads; ++i) {
        std::vector<size_t> seq_counts = { points_per_thread };
        std::span<G1> seq_points = points.subspan(offset, points_per_thread); // Subspan with index and length
        std::span<Fq> seq_scratch_space = scratch_space.subspan(offset, points_per_thread);
        sequences.push_back(AdditionSequences(seq_counts, seq_points, seq_scratch_space));
        offset += points_per_thread;
    }

    parallel_for(num_threads,
                 [&](size_t thread_idx) { AffineAdder::batched_affine_add_in_place(sequences[thread_idx]); });

    info("Reduced point = ", sequences[0].points[0]);

    std::vector<G1> reduced_points;
    for (const auto& seq : sequences) {
        // Extract the first num-sequence-counts many points from each add sequence
        for (size_t i = 0; i < seq.sequence_counts.size(); ++i) {
            reduced_points.emplace_back(seq.points[i]);
        }
    }

    return reduced_points;
}

template <typename Curve>
typename AdditionManager<Curve>::ThreadData AdditionManager<Curve>::strategize_threads(
    const std::span<G1>& points, const std::vector<size_t>& sequence_endpoints)
{
    // Assign the points across the available threads as evenly as possible
    const size_t total_num_points = points.size();
    const size_t num_threads = 3; // WORKTODO: actually determine this
    const size_t base_thread_size = total_num_points / num_threads;
    const size_t leftover_size = total_num_points % num_threads;
    std::vector<size_t> thread_sizes(num_threads, base_thread_size);
    for (size_t i = 0; i < leftover_size; ++i) {
        thread_sizes[i]++;
    }

    // Construct the thread endpoints and the thread_points according to the distribution determined above
    std::vector<std::span<G1>> thread_points;
    std::vector<size_t> thread_endpoints;
    size_t point_index = 0;
    for (auto size : thread_sizes) {
        thread_points.push_back(points.subspan(point_index, size));
        point_index += size;
        thread_endpoints.emplace_back(point_index);
    }

    for (const auto& end : thread_endpoints) {
        info("end: ", end);
    }
    for (const auto& points : thread_points) {
        info("points.size(): ", points.size());
    }

    // Construct the union of the thread and sequence endpoints by combining, sorting, then removing duplicates
    std::vector<size_t> all_endpoints;
    all_endpoints.reserve(thread_endpoints.size() + sequence_endpoints.size());
    all_endpoints.insert(all_endpoints.end(), thread_endpoints.begin(), thread_endpoints.end());
    all_endpoints.insert(all_endpoints.end(), sequence_endpoints.begin(), sequence_endpoints.end());
    std::sort(all_endpoints.begin(), all_endpoints.end());
    auto last = std::unique(all_endpoints.begin(), all_endpoints.end());
    all_endpoints.erase(last, all_endpoints.end());

    size_t prev_endpoint = 0;
    size_t thread_idx = 0;
    size_t sequence_idx = 0;
    std::vector<std::vector<size_t>> thread_sequence_counts(num_threads);
    std::vector<std::vector<size_t>> thread_sequence_tags(num_threads);
    for (auto& endpoint : all_endpoints) {
        size_t chunk_size = endpoint - prev_endpoint;
        thread_sequence_counts[thread_idx].emplace_back(chunk_size);
        thread_sequence_tags[thread_idx].emplace_back(sequence_idx);
        if (endpoint == thread_endpoints[thread_idx]) {
            thread_idx++;
        }
        if (endpoint == sequence_endpoints[sequence_idx]) {
            sequence_idx++;
        }
        prev_endpoint = endpoint;
    }

    if (thread_sequence_counts.size() != thread_points.size()) {
        info("Mismatch in sequence count construction!");
        ASSERT(false);
    }

    std::vector<AdditionSequences> addition_sequences;
    std::span<Fq> scratch_space(fake_scratch_space);
    for (size_t i = 0; i < num_threads; ++i) {
        addition_sequences.emplace_back(thread_sequence_counts[i], thread_points[i], scratch_space);
    }
    return { addition_sequences, thread_sequence_tags };
}

template class BatchedAffineAddition<curve::Grumpkin>;
template class BatchedAffineAddition<curve::BN254>;
template class AdditionManager<curve::Grumpkin>;
template class AdditionManager<curve::BN254>;
} // namespace bb
