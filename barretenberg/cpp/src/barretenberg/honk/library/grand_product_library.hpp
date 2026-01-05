// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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

/**
 * @brief Compute a grand product polynomial, `grand_product_polynomial`, which for historical reasons is sometimes also
 * called Z_perm(X). This polynomial will bear witness to some subset of: {copy constraints, multiset-equality, public
 * inputs}.
 *
 * @note The name Z_Perm(X) is historical, as the first use of the grand product polynomial was for the "permutation
 * argument", i.e., checking the correctness of copy-constraints. However, it may also be used for bare
 * multiset-equality checks (as it is in the ECCVM and in the Translator).
 *
 * @details
 * Z_perm is a shiftable multilinear polynomial and hence is specified by its values on the boolean hypercube. As it is
 * shiftable, Z_perm[0] == 0. Then it is specified by Z_perm[1] = 1 and the following iterative definition:
 *
 *                  relation::numerator(j)
 * Z_perm[i] = ∏ --------------------------------------------------------------------------------
 *                  relation::denominator(j)
 *
 * where ∏ := ∏_{j=0:i-1}
 *
 * (Note that Z_perm[1] may be thought of as the quotient of the empty product by the empty product, and hence setting
 * is 1 is consistent.)
 *
 * The specific algebraic relation used by Z_perm is
 *      * specified by Flavor::GrandProductRelations, for Flavor in {ECCVM, Translator}; and
 *      * specified by `UltraPermutationRelation` for Ultra (and Mega).
 * This inhomogenity is due to the fact that for Ultra/Mega, the grand product computation _also_ involves computing
 * `public_input_delta`, which doesn't as cleanly fit into the `compute_grand_products` pattern. (This latter is an
 * optimization having to do with public inputs.)
 *
 * The multilinear polynomial Z_perm is designed to take into account copy-constraints, multiset equality checks, and
 * public inputs. The formula is given as below. Here, the sigma polynomials (wires) encode the permutation (and, in the
 * more general case, multiset tags.)
 *
 *                  (w_1(j) + β⋅id_1(j) + γ) ⋅ (w_2(j) + β⋅id_2(j) + γ) ⋅ (w_3(j) + β⋅id_3(j) + γ)
 * Z_perm[i] = ∏ --------------------------------------------------------------------------------
 *                  (w_1(j) + β⋅σ_1(j) + γ) ⋅ (w_2(j) + β⋅σ_2(j) + γ) ⋅ (w_3(j) + β⋅σ_3(j) + γ)
 * where ∏ := ∏_{j=0:i-1} and id_i(X) = id(X) + n*(i-1); here n is also called the SEPARATOR.
 *
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
 * Step 2) Compute 2 length-n polynomials numerator = ∏ A(j), denominator = ∏ B(j)
 * Step 3) Compute Z_perm[i + 1] = numerator[i] / denominator[i]
 *
 * Note: Step (3) utilizes Montgomery batch inversion, performed at the end of Step (2).
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
    // OPTIMIZE(zac) we can re-use the permutation polynomial as the numerator polynomial. Reduces readability
    Polynomial numerator{ domain_size };
    Polynomial denominator{ domain_size };

    // Step (1)
    // Populate `numerator` and `denominator` with the algebra described by Relation
    parallel_for(thread_data.num_threads, [&](size_t thread_idx) {
        const size_t start = thread_data.start[thread_idx];
        const size_t end = thread_data.end[thread_idx];
        typename Flavor::AllValues row;
        for (size_t i = start; i < end; ++i) {
            // OPTIMIZE(https://github.com/AztecProtocol/barretenberg/issues/940):consider avoiding get_row if possible.
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

    // Step (3) Compute grand_product_polynomial[i] = numerator[i] / denominator[i]
    auto& grand_product_polynomial = GrandProdRelation::get_grand_product_polynomial(full_polynomials);
    // the `grand_product_polynomial` is shiftable, hence `start_index == 1`.
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
