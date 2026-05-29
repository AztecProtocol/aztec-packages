// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_short_relation.hpp"
#include <type_traits>

namespace bb {

// Open-coded logderivative accumulation: the shared helper in logderivative_library.hpp constructs
// `UnivariateView<FF, RELATION_LENGTH>` directly over `in.lookup_inverses`, which buffer-overreads when entities
// are length-2 short edges. Inline the logic here so the only direct entity access uses ECCVMShortMonomialView.
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMLookupShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                  const AllEntities& in,
                                                  const Parameters& params,
                                                  const FF& scaling_factor)
{
    constexpr size_t NUM_LOOKUP_TERMS = Base::NUM_LOOKUP_TERMS;
    constexpr size_t NUM_TABLE_TERMS = Base::NUM_TABLE_TERMS;
    constexpr size_t NUM_TOTAL_TERMS = NUM_LOOKUP_TERMS + NUM_TABLE_TERMS;

    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using ShortView = ECCVMShortMonomialView<Accumulator>;
    using ShortTerm = std::
        conditional_t<std::is_same_v<ShortView, Accumulator>, Accumulator, UnivariateCoefficientBasis<FF, 2, false>>;

    const auto lookup_inverses_short = ShortView(Base::get_inverse_polynomial(in));
    const auto lookup_inverses = Accumulator(lookup_inverses_short);

    std::array<ShortTerm, NUM_TOTAL_TERMS> lookup_terms_short;
    std::array<Accumulator, NUM_TOTAL_TERMS> lookup_terms;
    std::array<Accumulator, NUM_TOTAL_TERMS> denominator_accumulator;

    bb::constexpr_for<0, NUM_LOOKUP_TERMS, 1>([&]<size_t i>() {
        lookup_terms_short[i] =
            ECCVMLookupShortRelationImpl<FF>::template compute_lookup_term_short<Accumulator, i>(in, params);
        lookup_terms[i] = Accumulator(lookup_terms_short[i]);
    });
    bb::constexpr_for<0, NUM_TABLE_TERMS, 1>([&]<size_t i>() {
        lookup_terms_short[i + NUM_LOOKUP_TERMS] =
            ECCVMLookupShortRelationImpl<FF>::template compute_table_term_short<Accumulator, i>(in, params);
        lookup_terms[i + NUM_LOOKUP_TERMS] = Accumulator(lookup_terms_short[i + NUM_LOOKUP_TERMS]);
    });

    static_assert(NUM_TOTAL_TERMS == 6);
    denominator_accumulator[0] = lookup_terms[0];
    denominator_accumulator[1] = Accumulator(lookup_terms_short[0] * lookup_terms_short[1]);
    denominator_accumulator[2] = denominator_accumulator[1] * lookup_terms[2];
    denominator_accumulator[3] =
        denominator_accumulator[1] * Accumulator(lookup_terms_short[2] * lookup_terms_short[3]);
    denominator_accumulator[4] = denominator_accumulator[3] * lookup_terms[4];
    denominator_accumulator[5] =
        denominator_accumulator[3] * Accumulator(lookup_terms_short[4] * lookup_terms_short[5]);

    auto inverse_accumulator = lookup_inverses;
    const auto inverse_exists_short =
        ECCVMLookupShortRelationImpl<FF>::template compute_inverse_exists_short<Accumulator>(in);

    std::get<0>(accumulator) +=
        denominator_accumulator[NUM_TOTAL_TERMS - 1] * Accumulator(lookup_inverses_short * scaling_factor) -
        Accumulator(inverse_exists_short * scaling_factor);

    for (size_t i = NUM_TOTAL_TERMS - 1; i > 0; --i) {
        denominator_accumulator[i] = denominator_accumulator[i - 1] * inverse_accumulator;
        inverse_accumulator = inverse_accumulator * lookup_terms[i];
    }
    denominator_accumulator[0] = inverse_accumulator;

    bb::constexpr_for<0, NUM_LOOKUP_TERMS, 1>([&]<size_t i>() {
        const auto lookup_predicate =
            ECCVMLookupShortRelationImpl<FF>::template get_lookup_term_predicate_short<Accumulator, i>(in);
        std::get<1>(accumulator) += Accumulator(lookup_predicate) * denominator_accumulator[i];
    });

    bb::constexpr_for<0, NUM_TABLE_TERMS, 1>([&]<size_t i>() {
        const auto table_predicate =
            ECCVMLookupShortRelationImpl<FF>::template get_table_term_predicate_short<Accumulator, i>(in);
        const auto read_count = ECCVMLookupShortRelationImpl<FF>::template lookup_read_counts_short<Accumulator, i>(in);
        auto to_subtract = Accumulator(table_predicate * read_count) * denominator_accumulator[i + NUM_LOOKUP_TERMS];
        std::get<1>(accumulator) -= to_subtract;
    });
}

} // namespace bb
