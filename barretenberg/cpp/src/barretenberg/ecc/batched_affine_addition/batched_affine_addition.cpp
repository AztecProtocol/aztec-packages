// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include "barretenberg/common/zip_view.hpp"
#include <algorithm>
#include <execution>
#include <set>

namespace bb {

template <typename Curve>
std::vector<typename BatchedAffineAddition<Curve>::G1> BatchedAffineAddition<Curve>::add_in_place(
    const std::span<G1>& points, const std::vector<size_t>& sequence_counts)
{
    PROFILE_THIS_NAME("BatchedAffineAddition::add_in_place");
    // Instantiate scratch space for point addition denominators and their calculation
    std::vector<Fq> scratch_space_vector(points.size());
    std::span<Fq> scratch_space(scratch_space_vector);

    // Divide the work into groups of addition sequences to be reduced by each thread
    auto [addition_sequences_, sequence_tags] = construct_thread_data(points, sequence_counts, scratch_space);
    auto& addition_sequences = addition_sequences_;

    const size_t num_threads = addition_sequences.size();
    parallel_for(num_threads, [&](size_t thread_idx) { batched_affine_add_in_place(addition_sequences[thread_idx]); });

    // Construct a vector of the reduced points, accounting for sequences that may have been split across threads
    std::vector<G1> reduced_points;
    size_t prev_tag = std::numeric_limits<size_t>::max();
    for (auto [sequences, tags] : zip_view(addition_sequences, sequence_tags)) {
        // Extract the first num-sequence-counts many points from each add sequence
        for (size_t i = 0; i < sequences.sequence_counts.size(); ++i) {
            if (tags[i] == prev_tag) {
                reduced_points.back() = reduced_points.back() + sequences.points[i];
            } else {
                reduced_points.emplace_back(sequences.points[i]);
            }
            prev_tag = tags[i];
        }
    }

    return reduced_points;
}

template <typename Curve>
typename BatchedAffineAddition<Curve>::ThreadData BatchedAffineAddition<Curve>::construct_thread_data(
    const std::span<G1>& points, const std::vector<size_t>& sequence_counts, const std::span<Fq>& scratch_space)
{
    // Compute the endpoints of the sequences within the points array from the sequence counts
    std::vector<size_t> sequence_endpoints;
    size_t total_count = 0;
    for (const auto& count : sequence_counts) {
        total_count += count;
        sequence_endpoints.emplace_back(total_count);
    }

    if (points.size() != total_count) {
        info("Number of input points does not match sequence counts!");
        ASSERT(false);
    }

    // Determine the optimal number of threads for parallelization
    const size_t MIN_POINTS_PER_THREAD = 1 << 14; // heuristic; anecdotally optimal for practical cases
    const size_t total_num_points = points.size();
    const size_t optimal_threads = total_num_points / MIN_POINTS_PER_THREAD;
    const size_t num_threads = std::max(1UL, std::min(get_num_cpus(), optimal_threads));
    // Distribute the work as evenly as possible across threads
    const size_t base_thread_size = total_num_points / num_threads;
    const size_t leftover_size = total_num_points % num_threads;
    std::vector<size_t> thread_sizes(num_threads, base_thread_size);
    for (size_t i = 0; i < leftover_size; ++i) {
        thread_sizes[i]++;
    }

    // Construct the point spans for each thread according to the distribution determined above
    std::vector<std::span<G1>> thread_points;
    std::vector<std::span<Fq>> thread_scratch_space;
    std::vector<size_t> thread_endpoints;
    size_t point_index = 0;
    for (auto size : thread_sizes) {
        thread_points.push_back(points.subspan(point_index, size));
        thread_scratch_space.push_back(scratch_space.subspan(point_index, size));
        point_index += size;
        thread_endpoints.emplace_back(point_index);
    }

    // Construct the union of the thread and sequence endpoints by combining, sorting, then removing duplicates. This is
    // used to break the points into sequences for each thread while tracking tags so that sequences split across one of
    // more threads can be properly reconstructed.
    std::vector<size_t> all_endpoints;
    all_endpoints.reserve(thread_endpoints.size() + sequence_endpoints.size());
    all_endpoints.insert(all_endpoints.end(), thread_endpoints.begin(), thread_endpoints.end());
    all_endpoints.insert(all_endpoints.end(), sequence_endpoints.begin(), sequence_endpoints.end());
    std::sort(all_endpoints.begin(), all_endpoints.end());
    auto last = std::unique(all_endpoints.begin(), all_endpoints.end());
    all_endpoints.erase(last, all_endpoints.end());

    // Construct sequence counts and tags for each thread using the set of all thread and sequence endpoints
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

    // Construct the addition sequences for each thread
    std::vector<AdditionSequences> addition_sequences;
    for (size_t i = 0; i < num_threads; ++i) {
        addition_sequences.push_back(
            AdditionSequences{ thread_sequence_counts[i], thread_points[i], thread_scratch_space[i] });
    }

    return { addition_sequences, thread_sequence_tags };
}

template <typename Curve>
std::span<typename BatchedAffineAddition<Curve>::Fq> BatchedAffineAddition<
    Curve>::batch_compute_point_addition_slope_inverses(const AdditionSequences& add_sequences)
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

template class BatchedAffineAddition<curve::BN254>;
template class BatchedAffineAddition<curve::Grumpkin>;
} // namespace bb
