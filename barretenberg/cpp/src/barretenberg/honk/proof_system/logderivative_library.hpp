// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

// Generic log-derivative utilities for lookups and permutations.
// For the mathematical background, see relations/LOGUP_README.md

#pragma once

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/tuple.hpp"

#include <span>
#include <typeinfo>

namespace bb {

/**
 * @brief Compute the inverse polynomial I(X) required for logderivative lookups
 *
 * @details For \f$x \in H_N\f$, where \f$H_N\f$ is the hypercube of size N, we define the inverse polynomial
 * \f[
 *      I(x) = \prod_{j} \frac{1}{\text{lookup_term}_{j}(x)} \cdot \prod_{k} \frac{1}{\text{table_term}_{k}(x)}
 * \f]
 *
 * If a given row does not contain a lookup gate, the inverse polynomial is set to zero.
 *
 */
template <typename FF, typename Relation, typename Polynomials, bool IsAvm = false>
void compute_logderivative_inverse(Polynomials& polynomials, auto& relation_parameters, const size_t circuit_size)
{
    using Accumulator = typename Relation::ValueAccumulator0;
    constexpr size_t NUM_LOOKUP_TERMS = Relation::NUM_LOOKUP_TERMS;
    constexpr size_t NUM_TABLE_TERMS = Relation::NUM_TABLE_TERMS;

    auto& inverse_polynomial = Relation::get_inverse_polynomial(polynomials);
    const size_t offset = inverse_polynomial.start_index();
    const auto compute_inverses = [&](size_t start, size_t end) {
        for (size_t i = start; i < end; ++i) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/940): avoid get_row if possible.
            auto row = polynomials.get_row(i + offset);
            bool has_inverse = Relation::operation_exists_at_row(row);
            if (!has_inverse) {
                continue;
            }
            FF denominator = 1;
            bb::constexpr_for<0, NUM_LOOKUP_TERMS, 1>([&]<size_t lookup_index> {
                auto denominator_term =
                    Relation::template compute_lookup_term<Accumulator, lookup_index>(row, relation_parameters);
                denominator *= denominator_term;
            });
            bb::constexpr_for<0, NUM_TABLE_TERMS, 1>([&]<size_t table_index> {
                auto denominator_term =
                    Relation::template compute_table_term<Accumulator, table_index>(row, relation_parameters);
                denominator *= denominator_term;
            });
            inverse_polynomial.at(i) = denominator;
        }
        FF* ffstart = &inverse_polynomial.coeffs()[start];
        std::span<FF> to_invert(ffstart, end - start);
        // Compute inverse polynomial I in place by inverting the product at each row
        // Note: zeroes are ignored as they are not used anyway
        FF::batch_invert(to_invert);
    };
    size_t range_size = IsAvm ? inverse_polynomial.size() : circuit_size;
    parallel_for([&](const ThreadChunk& chunk) {
        auto range = chunk.range(range_size);
        if (!range.empty()) {
            size_t start = *range.begin();
            size_t end = start + range.size();
            compute_inverses(start, end);
        }
    });
}

/**
 * @brief Unified implementation of log-derivative subrelation accumulation
 *
 * @tparam FF
 * @tparam Relation
 * @tparam ContainerOverSubrelations
 * @tparam AllEntities
 * @tparam Parameters
 * @tparam IsPermutation If true, then the read counts used in the second subrelation are hard-coded to 1.
 * @param accumulator
 * @param in
 * @param params
 * @param scaling_factor
 */
template <typename FF,
          typename Relation,
          typename ContainerOverSubrelations,
          typename AllEntities,
          typename Parameters,
          bool IsPermutation>
void _accumulate_logderivative_subrelation_contributions(ContainerOverSubrelations& accumulator,
                                                         const AllEntities& in,
                                                         const Parameters& params,
                                                         const FF& scaling_factor)
{
    constexpr size_t NUM_LOOKUP_TERMS = Relation::NUM_LOOKUP_TERMS;
    constexpr size_t NUM_TABLE_TERMS = Relation::NUM_TABLE_TERMS;

    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    auto lookup_inverses = View(Relation::get_inverse_polynomial(in));

    constexpr size_t NUM_TOTAL_TERMS = NUM_LOOKUP_TERMS + NUM_TABLE_TERMS;
    std::array<Accumulator, NUM_TOTAL_TERMS> lookup_terms;
    std::array<Accumulator, NUM_TOTAL_TERMS> denominator_accumulator;

    // The inverse polynomial gives us the produce of all the inverses, i.e.
    // lookup_inverse = \prod_j (1 / lookup_term[j]) * \prod_k (1 / table_term[k])
    // To obtain the inverses 1 / lookup_term[i], 1 / table_term[i], we multiply lookup_inverse by the product of all
    // terms except the one we want to invert. We perform this calculation via the following algorithm:
    // 1) Compute the successive products of all lookup terms and table terms
    // 2) Check that lookup_inverse is the inverse of the full product
    // 3) Iteratively compute the inverses as follows:
    //      (lookup_term_1 * .. * lookup_term_(i-1)) * lookup_inverse * (lookup_term_(i+1) * .. * table_term_m)

    // Collect all the terms in a single vector, first the lookup terms, then the table terms
    bb::constexpr_for<0, NUM_LOOKUP_TERMS, 1>(
        [&]<size_t i>() { lookup_terms[i] = Relation::template compute_lookup_term<Accumulator, i>(in, params); });
    bb::constexpr_for<0, NUM_TABLE_TERMS, 1>([&]<size_t i>() {
        lookup_terms[i + NUM_LOOKUP_TERMS] = Relation::template compute_table_term<Accumulator, i>(in, params);
    });

    // 1) Construct the successive products
    bb::constexpr_for<0, NUM_TOTAL_TERMS, 1>([&]<size_t i>() { denominator_accumulator[i] = lookup_terms[i]; });
    bb::constexpr_for<0, NUM_TOTAL_TERMS - 1, 1>(
        [&]<size_t i>() { denominator_accumulator[i + 1] *= denominator_accumulator[i]; });

    // 2) First subrelation: check that lookup_inverse is the inverse of the cumulative product if inverse_exists = 1
    auto inverse_accumulator = Accumulator(lookup_inverses);
    const auto inverse_exists = Relation::template compute_inverse_exists<Accumulator>(in);

    std::get<0>(accumulator) +=
        (denominator_accumulator[NUM_TOTAL_TERMS - 1] * lookup_inverses - inverse_exists) * scaling_factor;

    // 3) Iteratively compute the single inverses
    for (size_t i = NUM_TOTAL_TERMS - 1; i > 0; --i) {
        // Take the cumulative product up to the previous index and multiply by the current inverse accumulator
        denominator_accumulator[i] = denominator_accumulator[i - 1] * inverse_accumulator;
        // Multiply the inverse accumulator by the current term to remove it from the product of the inverses
        inverse_accumulator = inverse_accumulator * lookup_terms[i];
    }
    denominator_accumulator[0] = inverse_accumulator;

    // Second subrelation
    bb::constexpr_for<0, NUM_LOOKUP_TERMS, 1>([&]<size_t i>() {
        std::get<1>(accumulator) +=
            Relation::template get_lookup_term_predicate<Accumulator, i>(in) * denominator_accumulator[i];
    });

    if constexpr (IsPermutation) {
        bb::constexpr_for<0, NUM_TABLE_TERMS, 1>([&]<size_t i>() {
            const auto p = Relation::template get_table_term_predicate<Accumulator, i>(in);
            std::get<1>(accumulator) -= p * (denominator_accumulator[i + NUM_LOOKUP_TERMS]);
        });
    } else {
        bb::constexpr_for<0, NUM_TABLE_TERMS, 1>([&]<size_t i>() {
            const auto p = Relation::template get_table_term_predicate<Accumulator, i>(in);
            const auto lookup_read_count = Relation::template lookup_read_counts<Accumulator, i>(in);
            std::get<1>(accumulator) -= p * (denominator_accumulator[i + NUM_LOOKUP_TERMS] * lookup_read_count);
        });
    }
}
} // namespace bb
