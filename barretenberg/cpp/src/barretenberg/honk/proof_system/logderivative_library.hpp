// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/thread.hpp"

#include <span>
#include <typeinfo>

namespace bb {

/**
 * @brief Compute the inverse polynomial I(X) required for logderivative lookups
 * *
 * details
 * Inverse may be defined in terms of its values  on X_i = 0,1,...,n-1 as Z_perm[0] = 1 and for i = 1:n-1
 *                           1                              1
 * Inverse[i] = ∏ -------------------------- * ∏' --------------------------
 *                  relation::read_term(j)         relation::write_term(j)
 *
 * where ∏ := ∏_{j=0:relation::NUM_READ_TERMS-1} and ∏' := ∏'_{j=0:relation::NUM_WRITE_TERMS-1}
 *
 * If row [i] does not contain a lookup read gate or a write gate, Inverse[i] = 0
 * N.B. by "write gate" we mean; do the lookup table polynomials contain nonzero values at this row?
 * (in the ECCVM, the lookup table is not precomputed, so we have a concept of a "write gate", unlike when precomputed
 * lookup tables are used)
 *
 * The specific algebraic relations that define read terms and write terms are defined in Flavor::LookupRelation
 *
 * Note: tparam UseMultithreading exists because the AVM calls this fn in a multithreaded loop (no nested multithreading
 * allowed) but the ECCVM benefits from multithreading this fn
 */
template <typename FF, typename Relation, typename Polynomials, bool UseMultithreading = false>
void compute_logderivative_inverse(Polynomials& polynomials, auto& relation_parameters, const size_t circuit_size)
{
    using Accumulator = typename Relation::ValueAccumulator0;
    constexpr size_t READ_TERMS = Relation::READ_TERMS;
    constexpr size_t WRITE_TERMS = Relation::WRITE_TERMS;

    auto& inverse_polynomial = Relation::template get_inverse_polynomial(polynomials);
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
            bb::constexpr_for<0, READ_TERMS, 1>([&]<size_t read_index> {
                auto denominator_term =
                    Relation::template compute_read_term<Accumulator, read_index>(row, relation_parameters);
                denominator *= denominator_term;
            });
            bb::constexpr_for<0, WRITE_TERMS, 1>([&]<size_t write_index> {
                auto denominator_term =
                    Relation::template compute_write_term<Accumulator, write_index>(row, relation_parameters);
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
    if constexpr (UseMultithreading) {
        const size_t min_iterations_per_thread = 128;
        size_t num_threads = bb::calculate_num_threads_pow2(inverse_polynomial.size(), min_iterations_per_thread);
        const size_t rows_per_thread = inverse_polynomial.size() / num_threads;
        parallel_for(num_threads, [&](size_t thread_idx) {
            const size_t start = thread_idx * rows_per_thread;
            const size_t end = (thread_idx == num_threads - 1) ? circuit_size : (thread_idx + 1) * rows_per_thread;
            compute_inverses(start, end);
        });
    } else {
        {
            compute_inverses(0, inverse_polynomial.size());
        }
    }
}

/**
 * @brief Compute generic log-derivative lookup subrelation accumulation
 * @details The generic log-derivative lookup relation consistes of two subrelations. The first demonstrates that the
 * inverse polynomial I, defined via I_i =  1/[(read_term_i) * (write_term_i)], has been computed correctly. The second
 * establishes the correctness of the lookups themselves based on the log-derivative lookup argument. Note that the
 * latter subrelation is "linearly dependent" in the sense that it establishes that a sum across all rows of the
 * exectution trace is zero, rather than that some expression holds independently at each row. Accordingly, this
 * subrelation is not multiplied by a scaling factor at each accumulation step. The subrelation expressions are
 * respectively:
 *
 *  I_i * (read_term_i) * (write_term_i) - 1 = 0
 *
 * \sum_{i=0}^{n-1} [q_{logderiv_lookup} * I_i * write_term_i + read_count_i * I_i * read_term_i] = 0
 *
 * The explicit expressions for read_term and write_term are dependent upon the particular structure of the lookup being
 * performed and methods for computing them must be defined in the corresponding relation class.
 *
 * @tparam FF
 * @tparam Relation
 * @tparam ContainerOverSubrelations
 * @tparam AllEntities
 * @tparam Parameters
 * @param accumulator
 * @param in
 * @param params
 * @param scaling_factor
 */
template <typename FF, typename Relation, typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void accumulate_logderivative_lookup_subrelation_contributions(ContainerOverSubrelations& accumulator,
                                                               const AllEntities& in,
                                                               const Parameters& params,
                                                               const FF& scaling_factor)
{
    constexpr size_t READ_TERMS = Relation::READ_TERMS;
    constexpr size_t WRITE_TERMS = Relation::WRITE_TERMS;

    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    auto lookup_inverses = View(Relation::template get_inverse_polynomial(in));

    constexpr size_t NUM_TOTAL_TERMS = READ_TERMS + WRITE_TERMS;
    std::array<Accumulator, NUM_TOTAL_TERMS> lookup_terms;
    std::array<Accumulator, NUM_TOTAL_TERMS> denominator_accumulator;

    // The lookup relation = \sum_j (1 / read_term[j]) - \sum_k (read_counts[k] / write_term[k])
    // To get the inverses (1 / read_term[i]), (1 / write_term[i]), we have a commitment to the product of all inverses
    // i.e. lookup_inverse = \prod_j (1 / read_term[j]) * \prod_k (1 / write_term[k])
    // The purpose of this next section is to derive individual inverse terms using `lookup_inverses`
    // i.e. (1 / read_term[i]) = lookup_inverse * \prod_{j /ne i} (read_term[j]) * \prod_k (write_term[k])
    //      (1 / write_term[i]) = lookup_inverse * \prod_j (read_term[j]) * \prod_{k ne i} (write_term[k])
    bb::constexpr_for<0, READ_TERMS, 1>(
        [&]<size_t i>() { lookup_terms[i] = Relation::template compute_read_term<Accumulator, i>(in, params); });
    bb::constexpr_for<0, WRITE_TERMS, 1>([&]<size_t i>() {
        lookup_terms[i + READ_TERMS] = Relation::template compute_write_term<Accumulator, i>(in, params);
    });

    bb::constexpr_for<0, NUM_TOTAL_TERMS, 1>([&]<size_t i>() { denominator_accumulator[i] = lookup_terms[i]; });

    bb::constexpr_for<0, NUM_TOTAL_TERMS - 1, 1>(
        [&]<size_t i>() { denominator_accumulator[i + 1] *= denominator_accumulator[i]; });

    auto inverse_accumulator = Accumulator(lookup_inverses); // denominator_accumulator[NUM_TOTAL_TERMS - 1];

    const auto inverse_exists = Relation::template compute_inverse_exists<Accumulator>(in);

    // Note: the lookup_inverses are computed so that the value is 0 if !inverse_exists
    std::get<0>(accumulator) +=
        (denominator_accumulator[NUM_TOTAL_TERMS - 1] * lookup_inverses - inverse_exists) * scaling_factor;

    // After this algo, total degree of denominator_accumulator = NUM_TOTAL_TERMS
    for (size_t i = 0; i < NUM_TOTAL_TERMS - 1; ++i) {
        denominator_accumulator[NUM_TOTAL_TERMS - 1 - i] =
            denominator_accumulator[NUM_TOTAL_TERMS - 2 - i] * inverse_accumulator;
        inverse_accumulator = inverse_accumulator * lookup_terms[NUM_TOTAL_TERMS - 1 - i];
    }
    denominator_accumulator[0] = inverse_accumulator;

    // each predicate is degree-1
    // degree of relation at this point = NUM_TOTAL_TERMS + 1
    bb::constexpr_for<0, READ_TERMS, 1>([&]<size_t i>() {
        std::get<1>(accumulator) +=
            Relation::template compute_read_term_predicate<Accumulator, i>(in) * denominator_accumulator[i];
    });

    // each predicate is degree-1, `lookup_read_counts` is degree-1
    // degree of relation = NUM_TOTAL_TERMS + 2
    bb::constexpr_for<0, WRITE_TERMS, 1>([&]<size_t i>() {
        const auto p = Relation::template compute_write_term_predicate<Accumulator, i>(in);
        const auto lookup_read_count = Relation::template lookup_read_counts<Accumulator, i>(in);
        std::get<1>(accumulator) -= p * (denominator_accumulator[i + READ_TERMS] * lookup_read_count);
    });
}

/**
 * @brief Compute generic log-derivative set permutation subrelation accumulation
 * @details The generic log-derivative lookup relation consistes of two subrelations. The first demonstrates that the
 * inverse polynomial I, defined via I =  1/[(read_term) * (write_term)], has been computed correctly. The second
 * establishes the correctness of the permutation itself based on the log-derivative argument. Note that the
 * latter subrelation is "linearly dependent" in the sense that it establishes that a sum across all rows of the
 * execution trace is zero, rather than that some expression holds independently at each row. Accordingly, this
 * subrelation is not multiplied by a scaling factor at each accumulation step. The subrelation expressions are
 * respectively:
 *
 *  I * (read_term) * (write_term) - q_{permutation_enabler} = 0
 *
 * \sum_{i=0}^{n-1} [q_{write_enabler} * I * write_term +  q_{read_enabler} * I * read_term] = 0
 *
 * The explicit expressions for read_term and write_term are dependent upon the particular structure of the permutation
 * being performed and methods for computing them must be defined in the corresponding relation class. The entities
 * which are used to determine the use of permutation (is it enabled, is the first "read" set enabled, is the second
 * "write" set enabled) must be defined in the relation class.
 *
 * @tparam FF
 * @tparam Relation
 * @tparam ContainerOverSubrelations
 * @tparam AllEntities
 * @tparam Parameters
 * @param accumulator
 * @param in
 * @param params
 * @param scaling_factor
 */
template <typename FF, typename Relation, typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void accumulate_logderivative_permutation_subrelation_contributions(ContainerOverSubrelations& accumulator,
                                                                    const AllEntities& in,
                                                                    const Parameters& params,
                                                                    const FF& scaling_factor)
{
    constexpr size_t READ_TERMS = Relation::READ_TERMS;
    constexpr size_t WRITE_TERMS = Relation::WRITE_TERMS;

    // For now we only do simple permutations over tuples with 1 read and 1 write term
    static_assert(READ_TERMS == 1);
    static_assert(WRITE_TERMS == 1);

    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    auto permutation_inverses = View(Relation::template get_inverse_polynomial(in));

    constexpr size_t NUM_TOTAL_TERMS = 2;
    std::array<Accumulator, NUM_TOTAL_TERMS> permutation_terms;
    std::array<Accumulator, NUM_TOTAL_TERMS> denominator_accumulator;

    // The permutation relation =  1 / read_term - 1 / write_term
    // To get the inverses (1 / read_term), (1 / write_term), we have a commitment to the product ofinver ses
    // i.e. permutation_inverses =  (1 / read_term) * (1 / write_term)
    // The purpose of this next section is to derive individual inverse terms using `permutation_inverses`
    // i.e. (1 / read_term) = permutation_inverses * write_term
    //      (1 / write_term) = permutation_inverses * read_term
    permutation_terms[0] = Relation::template compute_read_term<Accumulator, 0>(in, params);
    permutation_terms[1] = Relation::template compute_write_term<Accumulator, 0>(in, params);

    bb::constexpr_for<0, NUM_TOTAL_TERMS, 1>([&]<size_t i>() { denominator_accumulator[i] = permutation_terms[i]; });

    bb::constexpr_for<0, NUM_TOTAL_TERMS - 1, 1>(
        [&]<size_t i>() { denominator_accumulator[i + 1] *= denominator_accumulator[i]; });

    auto inverse_accumulator = Accumulator(permutation_inverses); // denominator_accumulator[NUM_TOTAL_TERMS - 1];

    const auto inverse_exists = Relation::template compute_inverse_exists<Accumulator>(in);

    // Note: the lookup_inverses are computed so that the value is 0 if !inverse_exists
    std::get<0>(accumulator) +=
        (denominator_accumulator[NUM_TOTAL_TERMS - 1] * permutation_inverses - inverse_exists) * scaling_factor;

    // After this algo, total degree of denominator_accumulator = NUM_TOTAL_TERMS
    for (size_t i = 0; i < NUM_TOTAL_TERMS - 1; ++i) {
        denominator_accumulator[NUM_TOTAL_TERMS - 1 - i] =
            denominator_accumulator[NUM_TOTAL_TERMS - 2 - i] * inverse_accumulator;
        inverse_accumulator = inverse_accumulator * permutation_terms[NUM_TOTAL_TERMS - 1 - i];
    }
    denominator_accumulator[0] = inverse_accumulator;

    // each predicate is degree-1
    // degree of relation at this point = NUM_TOTAL_TERMS + 1
    std::get<1>(accumulator) +=
        Relation::template compute_read_term_predicate<Accumulator, 0>(in) * denominator_accumulator[0];

    // each predicate is degree-1
    // degree of relation = NUM_TOTAL_TERMS + 1
    std::get<1>(accumulator) -=
        Relation::template compute_write_term_predicate<Accumulator, 0>(in) * denominator_accumulator[1];
}

} // namespace bb
