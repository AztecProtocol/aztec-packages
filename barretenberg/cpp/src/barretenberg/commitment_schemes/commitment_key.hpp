#pragma once

/**
 * @brief Provides interfaces for different 'CommitmentKey' classes.
 *
 * TODO(#218)(Mara): This class should handle any modification to the SRS (e.g compute pippenger point table) to
 * simplify the codebase.
 */

#include "barretenberg/common/debug_log.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/ecc/scalar_multiplication/sorted_msm.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <cstddef>
#include <memory>
#include <string_view>

namespace bb {

/**
 * @brief CommitmentKey object over a pairing group 𝔾₁.
 *
 * @details Commitments are computed as C = [p(x)] = ∑ᵢ aᵢ⋅Gᵢ where Gᵢ is the i-th element of the SRS. For BN254,
 * the SRS is given as a list of 𝔾₁ points { [xʲ]₁ }ⱼ where 'x' is unknown. For Grumpkin, they are random points. The
 * SRS stored in the commitment key is after applying the pippenger_point_table thus being double the size of what is
 * loaded from path.
 */
template <class Curve> class CommitmentKey {

    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using G1 = typename Curve::AffineElement;
    static constexpr size_t EXTRA_SRS_POINTS_FOR_ECCVM_IPA = 1;

    static size_t get_num_needed_srs_points(size_t num_points)
    {
        // NOTE 1: Currently we must round up internal space for points as our pippenger algorithm (specifically,
        // pippenger_unsafe_optimized_for_non_dyadic_polys) will use next power of 2. This is used to simplify the
        // recursive halving scheme. We do, however allow the polynomial to not be fully formed. Pippenger internally
        // will pad 0s into the runtime state.
        // NOTE 2: We then add one for ECCVM to provide for IPA verification
        return numeric::round_up_power_2(num_points) + EXTRA_SRS_POINTS_FOR_ECCVM_IPA;
    }

  public:
    scalar_multiplication::pippenger_runtime_state<Curve> pippenger_runtime_state;
    std::shared_ptr<srs::factories::CrsFactory<Curve>> crs_factory;
    std::shared_ptr<srs::factories::ProverCrs<Curve>> srs;

    CommitmentKey() = delete;

    /**
     * @brief Construct a new Kate Commitment Key object from existing SRS
     *
     * @param n
     * @param path
     *
     */
    CommitmentKey(const size_t num_points)
        : pippenger_runtime_state(get_num_needed_srs_points(num_points))
        , crs_factory(srs::get_crs_factory<Curve>())
        , srs(crs_factory->get_prover_crs(get_num_needed_srs_points(num_points)))
    {}

    // Note: This constructor is to be used only by Plonk; For Honk the srs lives in the CommitmentKey
    CommitmentKey(const size_t num_points, std::shared_ptr<srs::factories::ProverCrs<Curve>> prover_crs)
        : pippenger_runtime_state(num_points)
        , srs(prover_crs)
    {}

    /**
     * @brief Uses the ProverSRS to create a commitment to p(X)
     *
     * @param polynomial a univariate polynomial p(X) = ∑ᵢ aᵢ⋅Xⁱ
     * @return Commitment computed as C = [p(x)] = ∑ᵢ aᵢ⋅Gᵢ
     */
    Commitment commit(PolynomialSpan<const Fr> polynomial)
    {
        BB_OP_COUNT_TIME();
        // We must have a power-of-2 SRS points *after* subtracting by start_index.
        const size_t consumed_srs = numeric::round_up_power_2(polynomial.size()) + polynomial.start_index;
        auto srs = srs::get_crs_factory<Curve>()->get_prover_crs(consumed_srs);
        // We only need the
        if (consumed_srs > srs->get_monomial_size()) {
            throw_or_abort(format("Attempting to commit to a polynomial that needs ",
                                  consumed_srs,
                                  " points with an SRS of size ",
                                  srs->get_monomial_size()));
        }

        // Extract the precomputed point table (contains raw SRS points at even indices and the corresponding
        // endomorphism point (\beta*x, -y) at odd indices). We offset by polynomial.start_index * 2 to align
        // with our polynomial span.
        std::span<G1> point_table = srs->get_monomial_points().subspan(polynomial.start_index * 2);
        DEBUG_LOG_ALL(polynomial.span);
        Commitment point = scalar_multiplication::pippenger_unsafe_optimized_for_non_dyadic_polys<Curve>(
            polynomial.span, point_table, pippenger_runtime_state);
        DEBUG_LOG(point);
        return point;
    };

    /**
     * @brief Efficiently commit to a sparse polynomial
     * @details Iterate through the {point, scalar} pairs that define the inputs to the commitment MSM, maintain (copy)
     * only those for which the scalar is nonzero, then perform the MSM on the reduced inputs.
     * @warning Method makes a copy of all {point, scalar} pairs that comprise the reduced input. Will not be efficient
     * in terms of memory or computation for polynomials beyond a certain sparseness threshold.
     *
     * @param polynomial
     * @return Commitment
     */
    Commitment commit_sparse(PolynomialSpan<const Fr> polynomial)
    {
        BB_OP_COUNT_TIME();
        const size_t poly_size = polynomial.size();
        ASSERT(polynomial.end_index() <= srs->get_monomial_size());

        // Extract the precomputed point table (contains raw SRS points at even indices and the corresponding
        // endomorphism point (\beta*x, -y) at odd indices). We offset by polynomial.start_index * 2 to align
        // with our polynomial span.
        std::span<G1> point_table = srs->get_monomial_points().subspan(polynomial.start_index * 2);

        // Define structures needed to multithread the extraction of non-zero inputs
        const size_t num_threads = calculate_num_threads(poly_size);
        const size_t block_size = (poly_size + num_threads - 1) / num_threads; // round up
        std::vector<std::vector<Fr>> thread_scalars(num_threads);
        std::vector<std::vector<G1>> thread_points(num_threads);

        // Loop over all polynomial coefficients and keep {point, scalar} pairs for which scalar != 0
        parallel_for(num_threads, [&](size_t thread_idx) {
            const size_t start = thread_idx * block_size;
            const size_t end = std::min(poly_size, (thread_idx + 1) * block_size);

            for (size_t idx = start; idx < end; ++idx) {

                const Fr& scalar = polynomial.span[idx];

                if (!scalar.is_zero()) {
                    thread_scalars[thread_idx].emplace_back(scalar);
                    // Save both the raw srs point and the precomputed endomorphism point from the point table
                    ASSERT(idx * 2 + 1 < point_table.size());
                    const G1& point = point_table[idx * 2];
                    const G1& endo_point = point_table[idx * 2 + 1];
                    thread_points[thread_idx].emplace_back(point);
                    thread_points[thread_idx].emplace_back(endo_point);
                }
            }
        });

        // Compute total number of non-trivial input pairs
        size_t num_nonzero_scalars = 0;
        for (auto& scalars : thread_scalars) {
            num_nonzero_scalars += scalars.size();
        }

        // Reconstruct the full input to the pippenger from the individual threads
        std::vector<Fr> scalars;
        std::vector<G1> points;
        scalars.reserve(num_nonzero_scalars);
        points.reserve(2 * num_nonzero_scalars); //  2x accounts for endomorphism points
        for (size_t idx = 0; idx < num_threads; ++idx) {
            scalars.insert(scalars.end(), thread_scalars[idx].begin(), thread_scalars[idx].end());
            points.insert(points.end(), thread_points[idx].begin(), thread_points[idx].end());
        }

        // Call the version of pippenger which assumes all points are distinct
        return scalar_multiplication::pippenger_unsafe<Curve>(scalars, points, pippenger_runtime_state);
    }

    struct RangeEndpoints {
        std::vector<std::pair<uint32_t, uint32_t>> scalar_endpoints;
        std::vector<std::pair<uint32_t, uint32_t>> point_endpoints;
        uint32_t total_num_scalars = 0;
    };

    RangeEndpoints compute_range_endpoints(const std::vector<uint32_t>& structured_sizes,
                                           const std::vector<uint32_t>& actual_sizes,
                                           bool complement = false)
    {
        // Construct the endpoints of the ranges of active scalar regions
        const size_t num_blocks = structured_sizes.size();
        std::vector<std::pair<uint32_t, uint32_t>> scalar_endpoints;
        scalar_endpoints.reserve(num_blocks);
        uint32_t total_num_scalars = 0;
        uint32_t start_idx = 0;
        uint32_t end_idx = 0;
        if (complement) {
            for (const auto& [block_size, actual_size] : zip_view(structured_sizes, actual_sizes)) {
                start_idx = end_idx + actual_size;
                end_idx += block_size;
                scalar_endpoints.emplace_back(start_idx, end_idx);
                total_num_scalars += (end_idx - start_idx);
            }
        } else {
            for (const auto& [block_size, actual_size] : zip_view(structured_sizes, actual_sizes)) {
                end_idx = start_idx + actual_size;
                scalar_endpoints.emplace_back(start_idx, end_idx);
                start_idx += block_size;
                total_num_scalars += (end_idx - start_idx);
            }
        }

        // Accounting for endomorphism points, the corresponding ranges for the active region points are obtained by
        // simply doubling the corresponding endpoints for the scalars
        std::vector<std::pair<uint32_t, uint32_t>> point_endpoints;
        point_endpoints.reserve(num_blocks);
        for (const auto& range : scalar_endpoints) {
            point_endpoints.emplace_back(2 * range.first, 2 * range.second);
        }

        return { scalar_endpoints, point_endpoints, total_num_scalars };
    }

    /**
     * @brief Efficiently commit to a polynomial whose nonzero elements are arranged in discrete blocks
     * @details Given a set of fixed structured block sizes and a set of actual block sizes, reconstruct the non-zero
     * inputs in contiguous memory and commit to them using the normal pippenger algorithm.
     * @warning Method makes a copy of all {point, scalar} pairs that comprise the reduced input. May not be efficient
     * in terms of memory or computation for polynomials beyond a certain sparseness threshold.
     *
     * @param polynomial
     * @param structured_sizes Structured size of the blocks from which the polynomial is comprised
     * @param actual_sizes The size of the block of non-zero elements in the corresponding fixed size block
     * @return Commitment
     */
    Commitment commit_structured(PolynomialSpan<const Fr> polynomial,
                                 const std::vector<uint32_t>& structured_sizes,
                                 const std::vector<uint32_t>& actual_sizes)
    {
        BB_OP_COUNT_TIME();
        ASSERT(polynomial.end_index() <= srs->get_monomial_size());

        // Construct the endpoints describing the ranges of nonzero elements in the input polynomial
        auto [scalar_endpoints, point_endpoints, total_num_scalars] =
            compute_range_endpoints(structured_sizes, actual_sizes);

        // Extract the precomputed point table (contains raw SRS points at even indices and the corresponding
        // endomorphism point (\beta*x, -y) at odd indices). We offset by polynomial.start_index * 2 to align
        // with our polynomial span.
        std::span<G1> point_table = srs->get_monomial_points().subspan(polynomial.start_index * 2);

        std::vector<Fr> scalars;
        std::vector<G1> points;
        scalars.reserve(total_num_scalars);
        points.reserve(total_num_scalars * 2);
        for (const auto& range : scalar_endpoints) {
            auto start_it = polynomial.span.begin() + static_cast<std::ptrdiff_t>(range.first);
            auto end_it = polynomial.span.begin() + static_cast<std::ptrdiff_t>(range.second);
            scalars.insert(scalars.end(), start_it, end_it);
        }
        for (const auto& range : point_endpoints) {
            auto start_it = point_table.begin() + static_cast<std::ptrdiff_t>(range.first);
            auto end_it = point_table.begin() + static_cast<std::ptrdiff_t>(range.second);
            points.insert(points.end(), start_it, end_it);
        }

        // Call pippenger
        return scalar_multiplication::pippenger_unsafe<Curve>(scalars, points, pippenger_runtime_state);
    }

    Commitment commit_structured_with_nonzero_constant_blocks(PolynomialSpan<const Fr> polynomial,
                                                              const std::vector<uint32_t>& structured_sizes,
                                                              const std::vector<uint32_t>& actual_sizes)
    {
        BB_OP_COUNT_TIME();
        using AdditionManager = AdditionManager<Curve>;

        ASSERT(polynomial.end_index() <= srs->get_monomial_size());

        Commitment active_region_contribution = commit_structured(polynomial, structured_sizes, actual_sizes);

        // Extract the precomputed point table (contains raw SRS points at even indices and the corresponding
        // endomorphism point (\beta*x, -y) at odd indices). We offset by polynomial.start_index * 2 to align
        // with our polynomial span.
        std::span<G1> point_table = srs->get_monomial_points().subspan(polynomial.start_index * 2);

        // Construct the endpoints describing the ranges of constant nonzero elements in the input polynomial
        auto [scalar_endpoints, point_endpoints, total_num_scalars] =
            compute_range_endpoints(structured_sizes, actual_sizes, /*complement=*/true);

        // Copy the raw SRS points corresponding to the constant regions into contiguous memory
        std::vector<G1> points;
        points.reserve(total_num_scalars);
        for (const auto& range : point_endpoints) {
            for (size_t i = range.first; i < range.second; i += 2) {
                points.emplace_back(point_table[i]);
            }
        }

        // Compute the number of points in each sequence to be summed
        std::vector<size_t> sequence_counts;
        for (const auto& range : scalar_endpoints) {
            sequence_counts.emplace_back(range.second - range.first);
        }

        // Reduce each sequence to a single point
        AdditionManager add_manager;
        auto reduced_points = add_manager.batched_affine_add_in_place_parallel(points, sequence_counts);

        // Populate the set of unique scalars with first coeff from each range (values assumed constant over each range)
        std::vector<Fr> unique_scalars;
        unique_scalars.reserve(structured_sizes.size());
        for (auto range : scalar_endpoints) {
            unique_scalars.emplace_back(polynomial[range.first]);
        }

        // Directly compute the full commitment given the reduced inputs
        Commitment result = active_region_contribution;
        for (auto [scalar, point] : zip_view(unique_scalars, reduced_points)) {
            result = result + point * scalar;
        }

        return result;
    }
};

} // namespace bb
