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
    using Fq = typename Curve::BaseField;

    // Storage for a set of points to be sorted and reduced
    struct AdditionSequences {
        std::span<uint64_t> sequence_counts;
        std::span<G1> points;
        std::optional<std::span<Fq>> scratch_space;
    };

    static G1 affine_add_with_denominator(const G1&, const G1&, const Fq& denominator);

    static void compute_point_addition_denominators(AdditionSequences& add_sequences, std::span<Fq> denominators);

    static void batched_affine_add_in_place(AdditionSequences addition_sequences);
};

} // namespace bb
