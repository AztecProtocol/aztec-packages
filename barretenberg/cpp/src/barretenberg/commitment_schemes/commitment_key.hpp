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
        PROFILE_THIS_NAME("commit");
        // We must have a power-of-2 SRS points *after* subtracting by start_index.
        size_t dyadic_poly_size = numeric::round_up_power_2(polynomial.size());
        // Because pippenger prefers a power-of-2 size, we must choose a starting index for the points so that we don't
        // exceed the dyadic_circuit_size. The actual start index of the points will be the smallest it can be so that
        // the window of points is a power of 2 and still contains the scalars. The best we can do is pick a start index
        // that ends at the end of the polynomial, which would be polynomial.end_index() - dyadic_poly_size. However,
        // our polynomial might defined too close to 0, so we set the start_index to 0 in that case.
        size_t actual_start_index =
            polynomial.end_index() > dyadic_poly_size ? polynomial.end_index() - dyadic_poly_size : 0;
        // The relative start index is the offset of the scalars from the start of the points window, i.e.
        // [actual_start_index, actual_start_index + dyadic_poly_size), so we subtract actual_start_index from the start
        // index.
        size_t relative_start_index = polynomial.start_index - actual_start_index;
        const size_t consumed_srs = actual_start_index + dyadic_poly_size;
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

        std::span<G1> point_table = srs->get_monomial_points().subspan(actual_start_index * 2);
        DEBUG_LOG_ALL(polynomial.span);
        Commitment point = scalar_multiplication::pippenger_unsafe_optimized_for_non_dyadic_polys<Curve>(
            { relative_start_index, polynomial.span }, point_table, pippenger_runtime_state);
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
        PROFILE_THIS_NAME("commit_sparse");
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
        return scalar_multiplication::pippenger_unsafe<Curve>({ 0, scalars }, points, pippenger_runtime_state);
    }

    /**
     * @brief Efficiently commit to a polynomial whose nonzero elements are arranged in discrete blocks
     * @details Given a set of ranges where the polynomial takes non-zero values, copy the non-zero inputs (scalars,
     * points) into contiguous memory and commit to them using the normal pippenger algorithm. Defaults to the
     * conventional commit method if the number of non-zero entries is beyond a threshold relative to the full
     * polynomial size.
     * @note The wire polynomials have the described form when a structured execution trace is in use.
     * @warning Method makes a copy of all {point, scalar} pairs that comprise the reduced input. May not be efficient
     * in terms of memory or computation for polynomials beyond a certain sparseness threshold.
     *
     * @param polynomial
     * @param active_ranges
     * @return Commitment
     */
    Commitment commit_structured(PolynomialSpan<const Fr> polynomial,
                                 const std::vector<std::pair<size_t, size_t>>& active_ranges,
                                 size_t final_active_wire_idx = 0)
    {
        PROFILE_THIS_NAME("commit_structured");
        ASSERT(polynomial.end_index() <= srs->get_monomial_size());

        // Percentage of nonzero coefficients beyond which we resort to the conventional commit method
        constexpr size_t NONZERO_THRESHOLD = 75;

        // Compute the number of non-zero coefficients in the polynomial
        size_t total_num_scalars = 0;
        for (const auto& [first, second] : active_ranges) {
            total_num_scalars += second - first;
        }

        // Compute "active" percentage of polynomial; resort to standard commit if appropriate
        size_t polynomial_size = final_active_wire_idx != 0 ? final_active_wire_idx : polynomial.size();
        size_t percentage_nonzero = total_num_scalars * 100 / polynomial_size;
        if (percentage_nonzero > NONZERO_THRESHOLD) {
            return commit(polynomial);
        }

        // Extract the precomputed point table (contains raw SRS points at even indices and the corresponding
        // endomorphism point (\beta*x, -y) at odd indices).
        std::span<G1> point_table = srs->get_monomial_points();

        std::vector<Fr> scalars;
        scalars.reserve(total_num_scalars);
        std::vector<G1> points;
        points.reserve(total_num_scalars * 2);
        for (const auto& [first, second] : active_ranges) {
            auto poly_start = &polynomial[first];
            auto poly_end = &polynomial[second];
            scalars.insert(scalars.end(), poly_start, poly_end);

            auto pts_start = &point_table[2 * first];
            auto pts_end = &point_table[2 * second];
            points.insert(points.end(), pts_start, pts_end);
        }

        // Call pippenger
        return scalar_multiplication::pippenger_unsafe<Curve>({ 0, scalars }, points, pippenger_runtime_state);
    }

    /**
     * @brief Efficiently commit to a polynomial with discrete blocks of arbitrary elements and constant elements
     * @details Similar to method commit_structured() except the complement to the "active" region cantains non-zero
     * constant values (which are assumed to differ between blocks). This is exactly the structure of the permutation
     * grand product polynomial z_perm when a structured execution trace is in use.
     * @warning Requires a copy of all {point, scalar} pairs (including endo points) corresponding to the primary blocks
     * and a copy of all of the points (without endo points) corresponding to their complement.
     *
     * @param polynomial
     * @param active_ranges
     * @return Commitment
     */
    Commitment commit_structured_with_nonzero_complement(PolynomialSpan<const Fr> polynomial,
                                                         const std::vector<std::pair<size_t, size_t>>& active_ranges,
                                                         size_t final_active_wire_idx = 0)
    {
        PROFILE_THIS_NAME("commit_structured_with_nonzero_complement");
        ASSERT(polynomial.end_index() <= srs->get_monomial_size());

        using BatchedAddition = BatchedAffineAddition<Curve>;

        // Percentage of constant coefficients below which we resort to the conventional commit method
        constexpr size_t CONSTANT_THRESHOLD = 50;

        // Compute the active range complement over which the polynomial is assumed to be constant within each range.
        // Note: the range from the end of the last active range to the end of the polynomial is excluded from the
        // complement since the polynomial is assumed to be zero there.
        std::vector<std::pair<size_t, size_t>> active_ranges_complement;
        // Also compute total number of scalars in the constant regions
        size_t total_num_complement_scalars = 0;
        for (size_t i = 0; i < active_ranges.size() - 1; ++i) {
            const size_t start = active_ranges[i].second;
            const size_t end = active_ranges[i + 1].first;
            if (end > start) {
                active_ranges_complement.emplace_back(start, end);
                total_num_complement_scalars += end - start;
            }
        }

        size_t polynomial_size = final_active_wire_idx != 0 ? final_active_wire_idx : polynomial.size();
        // Compute percentage of polynomial comprised of constant blocks; resort to standard commit if appropriate
        size_t percentage_constant = total_num_complement_scalars * 100 / polynomial_size;

        if (percentage_constant < CONSTANT_THRESHOLD) {
            return commit(polynomial);
        }

        // Extract the precomputed point table (contains raw SRS points at even indices and the corresponding
        // endomorphism point (\beta*x, -y) at odd indices).
        std::span<G1> point_table = srs->get_monomial_points();

        // Copy the raw SRS points (no endo points) corresponding to the constant regions into contiguous memory
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1131): Peak memory usage could be improved by
        // performing this copy and the subsequent summation as a precomputation prior to constructing the point table.
        std::vector<G1> points;

        points.reserve(total_num_complement_scalars);
        for (const auto& [start, end] : active_ranges_complement) {
            for (size_t i = start; i < end; i++) {
                points.emplace_back(point_table[2 * i]);
            }
        }

        // Populate the set of unique scalars with first coeff from each range (values assumed constant over each
        // range). Also store the number of points in each sequence to be summed
        std::vector<Fr> unique_scalars;
        std::vector<size_t> sequence_counts;
        for (const auto& range : active_ranges_complement) {
            unique_scalars.emplace_back(polynomial.span[range.first]);
            sequence_counts.emplace_back(range.second - range.first);
        }

        // Reduce each sequence to a single point
        auto reduced_points = BatchedAddition::add_in_place(points, sequence_counts);

        // Compute the full commitment as the sum of the "active" region commitment and the constant region contribution
        Commitment result = commit_structured(polynomial, active_ranges, final_active_wire_idx);

        for (auto [scalar, point] : zip_view(unique_scalars, reduced_points)) {
            result = result + point * scalar;
        }

        return result;
    }
};

} // namespace bb
