#pragma once

#include "./runtime_states.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <cstddef>
#include <cstdint>

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
 */
template <typename Curve> class MsmSorter {

  public:
    using G1 = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;

    // Storage for a set of points to be sorted and reduced
    struct AdditionSequences {
        std::span<uint64_t> sequence_counts;
        std::span<G1> points;
        std::optional<std::span<Fq>> scratch_space;
    };

    struct ReducedMsmInputs {
        std::span<Fr> scalars;
        std::span<G1> points;
    };

    size_t num_unique_scalars = 0;
    std::vector<uint64_t> sequence_counts;
    std::vector<Fr> unique_scalars;
    std::vector<G1> updated_points;
    std::vector<size_t> index;
    std::vector<Fq> denominators;

    MsmSorter(const size_t num_scalars = 0)
    {
        sequence_counts.resize(num_scalars);
        unique_scalars.resize(num_scalars);
        updated_points.resize(num_scalars);
        index.resize(num_scalars);
        denominators.resize(num_scalars);
    }

    ReducedMsmInputs reduce_msm_inputs(std::span<Fr> scalars, std::span<G1> points);

    G1 affine_add_with_denominator(const G1&, const G1&, const Fq& denominator);

    void batch_compute_point_addition_slope_inverses(AdditionSequences& add_sequences);

    void batched_affine_add_in_place(AdditionSequences addition_sequences);

    AdditionSequences construct_addition_sequences(std::span<Fr> scalars, std::span<G1> points);
};

} // namespace bb
