#pragma once

#include "./runtime_states.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <cstddef>
#include <cstdint>

namespace bb {

/**
 * @brief Reduce MSM inputs such that the set of scalars contains no duplicates by summing points which share a scalar.
 *
 * @warning This class is intended to reduce MSMs with EC points that are fully random, e.g. those from an SRS. It does
 * not necessarily handle the case where two adjacent points are equal or the inverse of one another (i.e. where x_i ==
 * x_{i+1})
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

    // Set of reduced MSM inputs where all scalars are unique
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
