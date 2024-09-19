#pragma once

/**
 * @brief Provides interfaces for different 'CommitmentKey' classes.
 *
 * TODO(#218)(Mara): This class should handle any modification to the SRS (e.g compute pippenger point table) to
 * simplify the codebase.
 */

#include "barretenberg/common/debug_log.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
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
        // with our polynomial spann.
        std::span<G1> point_table = srs->get_monomial_points().subspan(polynomial.start_index * 2);

        // Define structures needed to multithread the extraction of non-zero inputs
        const size_t num_threads = poly_size >= get_num_cpus_pow2() ? get_num_cpus_pow2() : 1;
        const size_t block_size = poly_size / num_threads;
        std::vector<std::vector<Fr>> thread_scalars(num_threads);
        std::vector<std::vector<G1>> thread_points(num_threads);

        // Loop over all polynomial coefficients and keep {point, scalar} pairs for which scalar != 0
        parallel_for(num_threads, [&](size_t thread_idx) {
            const size_t start = thread_idx * block_size;
            const size_t end = (thread_idx + 1) * block_size;

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
        points.reserve(num_nonzero_scalars);
        for (size_t idx = 0; idx < num_threads; ++idx) {
            scalars.insert(scalars.end(), thread_scalars[idx].begin(), thread_scalars[idx].end());
            points.insert(points.end(), thread_points[idx].begin(), thread_points[idx].end());
        }

        // Call the version of pippenger which assumes all points are distinct
        return scalar_multiplication::pippenger_unsafe<Curve>(scalars, points, pippenger_runtime_state);
    }
};

} // namespace bb
