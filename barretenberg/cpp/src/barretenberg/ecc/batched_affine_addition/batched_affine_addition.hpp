#pragma once

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
template <typename Curve> class BatchedAffineAddition {

  public:
    using G1 = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;

    // Storage for a set of points to be sorted and reduced
    struct AdditionSequences {
        std::vector<uint32_t> sequence_counts;
        std::span<G1> points;
        std::optional<std::span<Fq>> scratch_space;
    };

    // Set of reduced MSM inputs where all scalars are unique
    struct ReducedMsmInputs {
        std::span<Fr> scalars;
        std::span<G1> points;
    };

    size_t num_unique_scalars = 0;
    std::vector<Fq> denominators;

    BatchedAffineAddition(const size_t num_scalars)
    {
        // WORKTODO: definitely dont want to resize here! reserve where possible!
        // WORKTODO: some of these depend on stuff being allocated, e.g. denominators
        denominators.resize(num_scalars / 2);
    }

    // ReducedMsmInputs reduce_msm_inputs(AdditionSequences add_sequences);

    void batch_compute_point_addition_slope_inverses(AdditionSequences add_sequences);

    void batched_affine_add_in_place(AdditionSequences add_sequences);
    // void batched_affine_add_in_place_parallel(const std::span<G1>& points, std::vector<uint32_t>&
    // sequence_endpoints);

    /**
     * @brief Add two affine elements with the inverse in the slope term \lambda provided as input
     * @details The sum of two points (x1, y1), (x2, y2) is given by x3 = \lambda^2 - x1 - x2, y3 = \lambda*(x1 - x3) -
     * y1, where \lambda  = (y2 - y1)/(x2 - x1). When performing many additions at once, it is more efficient to batch
     * compute the inverse component of \lambda for each pair of points. This gives rise to the need for a method like
     * this one.
     *
     * @tparam Curve
     * @param point_1 (x1, y1)
     * @param point_2 (x2, y2)
     * @param denominator 1/(x2 - x1)
     * @return Curve::AffineElement
     */
    inline G1 affine_add_with_denominator(const G1& point_1, const G1& point_2, const Fq& denominator)
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
};

template <typename Curve> class AdditionManager {
    using G1 = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using AffineAdder = BatchedAffineAddition<Curve>;
    using AdditionSequences = AffineAdder::AdditionSequences;

  public:
    std::vector<G1> batched_affine_add_in_place_parallel(const std::span<G1>& points,
                                                         std::vector<uint32_t>& sequence_endpoints);
};

} // namespace bb
