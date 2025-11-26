// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/debug_log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/flavor/flavor.hpp"

#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/trace_to_polynomials/trace_to_polynomials.hpp"
#include <typeinfo>

namespace bb {

// TODO(luke): This contains utilities for grand product computation and is not specific to the permutation grand
// product. Update comments accordingly.
/**
 * @brief Compute a permutation grand product polynomial Z_perm(X)
 *
 * @details
 * Z_perm may be defined in terms of its values  on X_i = 0,1,...,n-1 as Z_perm[0] = 1 and for i = 1:n-1
 *                  relation::numerator(j)
 * Z_perm[i] = ∏ --------------------------------------------------------------------------------
 *                  relation::denominator(j)
 *
 * where ∏ := ∏_{j=0:i-1}
 *
 * The specific algebraic relation used by Z_perm is defined by Flavor::GrandProductRelations
 *
 * For example, in Flavor::Standard the relation describes:
 *
 *                  (w_1(j) + β⋅id_1(j) + γ) ⋅ (w_2(j) + β⋅id_2(j) + γ) ⋅ (w_3(j) + β⋅id_3(j) + γ)
 * Z_perm[i] = ∏ --------------------------------------------------------------------------------
 *                  (w_1(j) + β⋅σ_1(j) + γ) ⋅ (w_2(j) + β⋅σ_2(j) + γ) ⋅ (w_3(j) + β⋅σ_3(j) + γ)
 * where ∏ := ∏_{j=0:i-1} and id_i(X) = id(X) + n*(i-1)
 *
 * For Flavor::Ultra both the UltraPermutation and Lookup grand products are computed by this method.
 *
 * The grand product is constructed over the course of three steps.
 *
 * For expositional simplicity, write Z_perm[i] as
 *
 *                A(j)
 * Z_perm[i] = ∏ --------------------------
 *                B(h)
 *
 * Step 1) Compute 2 length-n polynomials A, B
 * Step 2) Compute 2 length-n polynomials numerator = ∏ A(j), nenominator = ∏ B(j)
 * Step 3) Compute Z_perm[i + 1] = numerator[i] / denominator[i] (recall: Z_perm[0] = 1)
 *
 * Note: Step (3) utilizes Montgomery batch inversion to replace n-many inversions with
 *
 * @tparam Flavor
 * @tparam GrandProdRelation
 * @param full_polynomials
 * @param relation_parameters
 * @param size_override optional size of the domain; otherwise based on dyadic polynomial domain
 */
template <typename Flavor, typename GrandProdRelation>
void compute_grand_product(typename Flavor::ProverPolynomials& full_polynomials,
                           bb::RelationParameters<typename Flavor::FF>& relation_parameters,
                           size_t size_override = 0)
{
    BB_BENCH_NAME("compute_grand_product");

    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    using Accumulator = std::tuple_element_t<0, typename GrandProdRelation::SumcheckArrayOfValuesOverSubrelations>;

    // Set the domain over which the grand product must be computed. This may be less than the dyadic circuit size, e.g
    // the permutation grand product does not need to be computed beyond the index of the last active wire
    size_t domain_size = size_override == 0 ? full_polynomials.get_polynomial_size() : size_override;

    // The size of the iteration domain is one less than the number of domain size since the final value of the
    // grand product is constructed only in the relation and not explicitly in the polynomial
    const MultithreadData thread_data = calculate_thread_data(domain_size - 1);

    // Allocate numerator/denominator polynomials that will serve as scratch space
    // TODO(zac) we can re-use the permutation polynomial as the numerator polynomial. Reduces readability
    Polynomial numerator{ domain_size };
    Polynomial denominator{ domain_size };

    // Step (1)
    // Populate `numerator` and `denominator` with the algebra described by Relation
    parallel_for(thread_data.num_threads, [&](size_t thread_idx) {
        const size_t start = thread_data.start[thread_idx];
        const size_t end = thread_data.end[thread_idx];
        typename Flavor::AllValues row;
        for (size_t i = start; i < end; ++i) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/940):consider avoiding get_row if possible.
            if constexpr (IsUltraOrMegaHonk<Flavor>) {
                row = full_polynomials.get_row_for_permutation_arg(i);
            } else {
                row = full_polynomials.get_row(i);
            }
            numerator.at(i) =
                GrandProdRelation::template compute_grand_product_numerator<Accumulator>(row, relation_parameters);
            denominator.at(i) =
                GrandProdRelation::template compute_grand_product_denominator<Accumulator>(row, relation_parameters);
        }
    });

    DEBUG_LOG_ALL(numerator.coeffs());
    DEBUG_LOG_ALL(denominator.coeffs());

    // Step (2)
    // Compute the accumulating product of the numerator and denominator terms.
    // This step is split into three parts for efficient multithreading:
    // (i) compute ∏ A(j), ∏ B(j) subproducts for each thread
    // (ii) compute scaling factor required to convert each subproduct into a single running product
    // (ii) combine subproducts into a single running product
    //
    // For example, consider 4 threads and a size-8 numerator { a0, a1, a2, a3, a4, a5, a6, a7 }
    // (i)   Each thread computes 1 element of N = {{ a0, a0a1 }, { a2, a2a3 }, { a4, a4a5 }, { a6, a6a7 }}
    // (ii)  Take partial products P = { 1, a0a1, a2a3, a4a5 }
    // (iii) Each thread j computes N[i][j]*P[j]=
    //      {{a0,a0a1},{a0a1a2,a0a1a2a3},{a0a1a2a3a4,a0a1a2a3a4a5},{a0a1a2a3a4a5a6,a0a1a2a3a4a5a6a7}}
    std::vector<FF> partial_numerators(thread_data.num_threads);
    std::vector<FF> partial_denominators(thread_data.num_threads);

    parallel_for(thread_data.num_threads, [&](size_t thread_idx) {
        const size_t start = thread_data.start[thread_idx];
        const size_t end = thread_data.end[thread_idx];
        for (size_t i = start; i < end - 1; ++i) {
            numerator.at(i + 1) *= numerator[i];
            denominator.at(i + 1) *= denominator[i];
        }
        partial_numerators[thread_idx] = numerator[end - 1];
        partial_denominators[thread_idx] = denominator[end - 1];
    });

    DEBUG_LOG_ALL(partial_numerators);
    DEBUG_LOG_ALL(partial_denominators);

    parallel_for(thread_data.num_threads, [&](size_t thread_idx) {
        const size_t start = thread_data.start[thread_idx];
        const size_t end = thread_data.end[thread_idx];
        if (thread_idx > 0) {
            FF numerator_scaling = 1;
            FF denominator_scaling = 1;

            for (size_t j = 0; j < thread_idx; ++j) {
                numerator_scaling *= partial_numerators[j];
                denominator_scaling *= partial_denominators[j];
            }
            for (size_t i = start; i < end; ++i) {
                numerator.at(i) = numerator[i] * numerator_scaling;
                denominator.at(i) = denominator[i] * denominator_scaling;
            }
        }

        // Final step: invert denominator
        FF::batch_invert(std::span{ &denominator.data()[start], end - start });
    });

    DEBUG_LOG_ALL(numerator.coeffs());
    DEBUG_LOG_ALL(denominator.coeffs());

    // Step (3) Compute z_perm[i] = numerator[i] / denominator[i]
    auto& grand_product_polynomial = GrandProdRelation::get_grand_product_polynomial(full_polynomials);
    // the `grand_product_polynomial` (a.k.a. `z_perm`) is shiftable, hence `start_index == 1`.
    BB_ASSERT_EQ(grand_product_polynomial.start_index(), 1U);
    // Compute grand product values
    parallel_for(thread_data.num_threads, [&](size_t thread_idx) {
        const size_t start = thread_data.start[thread_idx];
        const size_t end = thread_data.end[thread_idx];
        for (size_t i = start; i < end; ++i) {
            grand_product_polynomial.at(i + 1) = numerator[i] * denominator[i];
        }
    });

    DEBUG_LOG_ALL(grand_product_polynomial.coeffs());
}

/**
 * @brief Compute the grand product corresponding to each grand-product relation defined in the Flavor
 *
 */
template <typename Flavor>
void compute_grand_products(typename Flavor::ProverPolynomials& full_polynomials,
                            bb::RelationParameters<typename Flavor::FF>& relation_parameters,
                            const size_t size_override = 0)
{
    using GrandProductRelations = typename Flavor::GrandProductRelations;

    constexpr size_t NUM_RELATIONS = std::tuple_size<GrandProductRelations>{};
    bb::constexpr_for<0, NUM_RELATIONS, 1>([&]<size_t i>() {
        using GrandProdRelation = typename std::tuple_element<i, GrandProductRelations>::type;

        compute_grand_product<Flavor, GrandProdRelation>(full_polynomials, relation_parameters, size_override);
    });
}

} // namespace bb
