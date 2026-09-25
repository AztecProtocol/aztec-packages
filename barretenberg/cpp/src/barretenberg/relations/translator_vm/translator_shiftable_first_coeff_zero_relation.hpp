#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class TranslatorShiftableFirstCoeffZeroRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    // degree(lagrange_first * wire) = 2, so length = 3
    static constexpr size_t RELATION_LENGTH = 3;

    static constexpr std::array<size_t, 18> SUBRELATION_PARTIAL_LENGTHS{
        3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
    };

    /**
     * @brief Anchors the first value of the ordered-range and non-range main wires to zero.
     *
     * @details The main wires occupy separate blocks of one concatenated commitment. PCS shiftability pins only
     * the first block's first value.
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulators,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor);
};

template <typename FF>
using TranslatorShiftableFirstCoeffZeroRelation = Relation<TranslatorShiftableFirstCoeffZeroRelationImpl<FF>>;

} // namespace bb
