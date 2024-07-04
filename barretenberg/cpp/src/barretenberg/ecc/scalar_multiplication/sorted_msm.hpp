#pragma once

#include "./runtime_states.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <cstddef>
#include <cstdint>

namespace bb {
template <typename Curve> class SortedMsmManager {
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

    size_t num_unique_scalars = 0;
    std::vector<uint64_t> sequence_counts;
    std::vector<Fr> unique_scalars;
    std::vector<G1> updated_points;

    SortedMsmManager(const size_t num_scalars = 0)
    {
        sequence_counts.resize(num_scalars);
        unique_scalars.resize(num_scalars);
        updated_points.resize(num_scalars);
    }

    G1 affine_add_with_denominator(const G1&, const G1&, const Fq& denominator);

    void compute_point_addition_denominators(AdditionSequences& add_sequences, std::span<Fq> denominators);

    void batched_affine_add_in_place(AdditionSequences addition_sequences);

    AdditionSequences generate_addition_sequences(std::span<Fr> scalars, std::span<G1> points);

    void reduce_msm_inputs(std::span<Fr> scalars, std::span<G1> points);
};

} // namespace bb
