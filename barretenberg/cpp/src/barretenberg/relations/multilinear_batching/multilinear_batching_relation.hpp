// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class MultilinearBatchingRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        3, // primary arithmetic sub-relation
        3, // secondary arithmetic sub-relation
        3, // tertiary arithmetic sub-relation
        3, // quaternary arithmetic sub-relation
    };

    static constexpr std::array<bool, 4> SUBRELATION_LINEARLY_INDEPENDENT = { false, false, false, false };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.w_non_shifted_accumulator.is_zero() && in.w_non_shifted_instance.is_zero() &&
                in.w_shifted_accumulator.is_zero() && in.w_shifted_instance.is_zero()) ||
               (in.w_evaluations_accumulator.is_zero() && in.w_evaluations_instance.is_zero());
    }

    /**
     * @brief Expression for the Multilinear Batching gate.
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& evals,
                                  const AllEntities& in,
                                  const Parameters&,
                                  const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;

        auto w_non_shifted_accumulator = Accumulator(in.w_non_shifted_accumulator);
        auto w_non_shifted_instance = Accumulator(in.w_non_shifted_instance);
        auto w_evaluations_accumulator = Accumulator(in.w_evaluations_accumulator);
        auto w_evaluations_instance = Accumulator(in.w_evaluations_instance);
        auto w_shifted_accumulator = Accumulator(in.w_shifted_accumulator);
        auto w_shifted_instance = Accumulator(in.w_shifted_instance);

        std::get<0>(evals) += (w_non_shifted_accumulator * w_evaluations_accumulator) * scaling_factor;
        std::get<1>(evals) += (w_non_shifted_instance * w_evaluations_instance) * scaling_factor;
        std::get<2>(evals) += (w_shifted_accumulator * w_evaluations_accumulator) * scaling_factor;
        std::get<3>(evals) += (w_shifted_instance * w_evaluations_instance) * scaling_factor;
    };
};

template <typename FF> using MultilinearBatchingRelation = Relation<MultilinearBatchingRelationImpl<FF>>;
} // namespace bb
