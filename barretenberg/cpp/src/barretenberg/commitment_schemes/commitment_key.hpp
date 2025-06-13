// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

/**
 * @brief Provides interfaces for different 'CommitmentKey' classes.
 *
 * TODO(#218)(Mara): This class should handle any modification to the SRS (e.g compute pippenger point table) to
 * simplify the codebase.
 */

#include "barretenberg/common/op_count.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
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
    std::shared_ptr<srs::factories::Crs<Curve>> srs;
    size_t dyadic_size;

    CommitmentKey() = delete;

    /**
     * @brief Construct a new Kate Commitment Key object from existing SRS
     *
     * @param n
     * @param path
     *
     */
    CommitmentKey(const size_t num_points)
        : srs(srs::get_crs_factory<Curve>()->get_crs(get_num_needed_srs_points(num_points)))
        , dyadic_size(get_num_needed_srs_points(num_points))
    {}
    /**
     * @brief Uses the ProverSRS to create a commitment to p(X)
     *
     * @param polynomial a univariate polynomial p(X) = ∑ᵢ aᵢ⋅Xⁱ
     * @return Commitment computed as C = [p(x)] = ∑ᵢ aᵢ⋅Gᵢ
     */
    Commitment commit(PolynomialSpan<const Fr> polynomial)
    {
        // Note: this fn used to expand polynomials to the dyadic size,
        // due to a quirk in how our pippenger algo used to function.
        // The pippenger algo has been refactored and this is no longer an issue
        PROFILE_THIS_NAME("commit");
        std::span<const G1> point_table = srs->get_monomial_points();
        size_t consumed_srs = polynomial.start_index + polynomial.size();
        if (consumed_srs > srs->get_monomial_size()) {
            throw_or_abort(format("Attempting to commit to a polynomial that needs ",
                                  consumed_srs,
                                  " points with an SRS of size ",
                                  srs->get_monomial_size()));
        }

        G1 r = scalar_multiplication::pippenger_unsafe<Curve>(polynomial, point_table);
        Commitment point(r);
        return point;
    };

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
        PROFILE_THIS_NAME("commit");
        BB_ASSERT_LTE(polynomial.end_index(), srs->get_monomial_size(), "Polynomial size exceeds commitment key size.");
        BB_ASSERT_LTE(polynomial.end_index(), dyadic_size, "Polynomial size exceeds commitment key size.");

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
        points.reserve(total_num_scalars);
        for (const auto& [first, second] : active_ranges) {
            auto poly_start = &polynomial[first];
            // Pointer to the first element past the active range. Accessing `&polynomial[second]` directly can trigger
            // an assertion when `second == polynomial_size`, so we compute the pointer using `polynomial.data()`
            // to ensure safe range handling.
            auto poly_end = polynomial.data() + (second - polynomial.start_index);
            scalars.insert(scalars.end(), poly_start, poly_end);

            auto pts_start = &point_table[first];
            auto pts_end = &point_table[second];
            points.insert(points.end(), pts_start, pts_end);
        }

        // Call the version of pippenger which assumes all points are distinct
        G1 r = scalar_multiplication::pippenger_unsafe<Curve>({ 0, scalars }, points);
        return Commitment(r);
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
        PROFILE_THIS_NAME("commit");
        BB_ASSERT_LTE(polynomial.end_index(), srs->get_monomial_size(), "Polynomial size exceeds commitment key size.");

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
                points.emplace_back(point_table[i]);
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

    enum class CommitType { Default, Structured, Sparse, StructuredNonZeroComplement };

    Commitment commit_with_type(PolynomialSpan<const Fr> poly,
                                CommitType type,
                                const std::vector<std::pair<size_t, size_t>>& active_ranges = {},
                                size_t final_active_wire_idx = 0)
    {
        switch (type) {
        case CommitType::Structured:
        case CommitType::Sparse:
            return commit(poly);
        case CommitType::StructuredNonZeroComplement:
            return commit_structured_with_nonzero_complement(poly, active_ranges, final_active_wire_idx);
        case CommitType::Default:
        default:
            return commit(poly);
        }
    }
};

} // namespace bb
