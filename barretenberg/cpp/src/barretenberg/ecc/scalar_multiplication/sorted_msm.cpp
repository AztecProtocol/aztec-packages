#include "barretenberg/ecc/scalar_multiplication/sorted_msm.hpp"

namespace bb {

template <typename Curve> void SortedMsmManager<Curve>::reduce_msm_inputs(std::span<Fr> scalars, std::span<G1> points)
{
    // generate the addition sequences
    AdditionSequences addition_sequences = generate_addition_sequences(scalars, points);

    // call batched affine add in place until the sequences have been fully reduced
    batched_affine_add_in_place(addition_sequences);

    // the reduced inputs are the unique scalrs and the reduced points
}

template <typename Curve>
SortedMsmManager<Curve>::AdditionSequences SortedMsmManager<Curve>::generate_addition_sequences(std::span<Fr> scalars,
                                                                                                std::span<G1> points)
{
    const size_t num_points = points.size();
    std::iota(index.begin(), index.end(), 0);
    std::sort(index.begin(), index.end(), [&](size_t idx_1, size_t idx_2) { return scalars[idx_1] < scalars[idx_2]; });

    unique_scalars[0] = scalars[index[0]];
    updated_points[0] = points[index[0]];
    size_t seq_idx = 0;
    sequence_counts[seq_idx] = 1;
    for (size_t i = 1; i < scalars.size(); ++i) {
        const Fr& current_scalar = scalars[index[i]];
        const Fr& prev_scalar = scalars[index[i - 1]];

        if (current_scalar == prev_scalar) {
            sequence_counts[seq_idx]++;
        } else {
            seq_idx++;
            sequence_counts[seq_idx]++;
            unique_scalars[seq_idx] = current_scalar;
        }

        updated_points[i] = points[index[i]];
    }

    num_unique_scalars = seq_idx + 1;

    std::span<uint64_t> seq_counts(sequence_counts.data(), num_unique_scalars);
    std::span<G1> sorted_points(updated_points.data(), num_points);
    return AdditionSequences{ seq_counts, sorted_points, {} };
}

template <typename Curve>
void SortedMsmManager<Curve>::compute_point_addition_denominators(AdditionSequences& add_sequences)
{
    auto points = add_sequences.points;
    auto sequence_counts = add_sequences.sequence_counts;

    // Count the total number of pairs across all addition sequences
    size_t total_num_pairs{ 0 };
    for (auto& count : sequence_counts) {
        total_num_pairs += count >> 1;
    }

    std::span<Fq> scratch_space(denominators.data(), total_num_pairs);
    std::vector<Fq> differences;
    differences.resize(total_num_pairs);

    Fq accumulator = 1;
    size_t point_idx = 0;
    size_t pair_idx = 0;
    for (auto& count : sequence_counts) {
        const size_t num_pairs = count >> 1;
        for (size_t j = 0; j < num_pairs; ++j) {
            const auto& x1 = points[point_idx++].x;
            const auto& x2 = points[point_idx++].x;

            // WORKTODO: what is the risk of a collision here?
            ASSERT(x1 != x2);

            auto diff = x2 - x1;
            differences[pair_idx] = diff;

            scratch_space[pair_idx++] = accumulator;
            accumulator *= diff;
        }
        // If number of points in the sequence is odd, we skip the last one since it has no pair
        point_idx += (count & 0x01ULL);
    }

    Fq inverse = accumulator.invert();

    // Compute the point addition denominators 1/(x2 - x1) in place
    for (size_t i = 0; i < total_num_pairs; ++i) {
        size_t idx = total_num_pairs - 1 - i;
        scratch_space[idx] *= inverse;
        inverse *= differences[idx];
    }
}

template <typename Curve>
typename Curve::AffineElement SortedMsmManager<Curve>::affine_add_with_denominator(const G1& point_1,
                                                                                   const G1& point_2,
                                                                                   const Fq& denominator)
{
    const auto& x1 = point_1.x;
    const auto& y1 = point_1.y;
    const auto& x2 = point_2.x;
    const auto& y2 = point_2.y;

    const Fq lambda = denominator * (y2 - y1);
    Fq x3 = lambda.sqr() - x2 - x1;
    Fq y3 = lambda * (x1 - x3) - y1;
    return { x3, y3 };
}

template <typename Curve>
void SortedMsmManager<Curve>::batched_affine_add_in_place(AdditionSequences addition_sequences)
{
    const size_t num_points = addition_sequences.points.size();
    if (num_points == 0 || num_points == 1) { // nothing to do
        return;
    }

    compute_point_addition_denominators(addition_sequences);

    auto points = addition_sequences.points;
    auto sequence_counts = addition_sequences.sequence_counts;

    size_t point_idx = 0;
    size_t result_point_idx = 0;
    size_t pair_idx = 0;
    bool more_additions = false;
    for (auto& count : sequence_counts) {
        const size_t num_pairs = count >> 1;
        const bool overflow = static_cast<bool>(count & 0x01ULL);
        // Compute the sum of all pairs in the sequence and store the result in the points array
        for (size_t j = 0; j < num_pairs; ++j) {
            const auto& point_1 = points[point_idx++];          // first summand
            const auto& point_2 = points[point_idx++];          // second summand
            const auto& denominator = denominators[pair_idx++]; // denominator needed in add formula
            auto& result = points[result_point_idx++];          // target for addition result

            result = affine_add_with_denominator(point_1, point_2, denominator);
        }
        if (overflow) {
            points[result_point_idx++] = points[point_idx++];
        }
        const uint64_t updated_sequence_count = static_cast<uint64_t>(num_pairs) + static_cast<uint64_t>(overflow);
        count = updated_sequence_count;

        more_additions = more_additions || (updated_sequence_count > 1);
    }

    if (more_additions) {
        const size_t updated_point_count = result_point_idx;
        std::span<G1> updated_points(&points[0], updated_point_count);
        return batched_affine_add_in_place(
            AdditionSequences{ sequence_counts, updated_points, addition_sequences.scratch_space });
    }
}

template class SortedMsmManager<curve::Grumpkin>;
template class SortedMsmManager<curve::BN254>;
} // namespace bb