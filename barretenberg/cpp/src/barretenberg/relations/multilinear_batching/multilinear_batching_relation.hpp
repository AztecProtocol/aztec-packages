// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Multilinear batching relations for HyperNova claim batching.
 * @details See: chonk/README.md#batching-claims-into-accumulator
 *
 * Relation for accumulator contribution to the multilinear batching sumcheck.
 *
 * @details In HyperNova, we batch polynomial evaluation claims from the accumulator and instance
 * into a new combined claim. This is done via a sumcheck that verifies:
 *
 *   target_sum = acc_non_shifted
 *              + α · acc_shifted
 *              + α² · Σᵢ(ρᵢ · inst_unshifted_evalᵢ)
 *              + α³ · Σᵢ(σᵢ · inst_shifted_evalᵢ)
 *
 * where ρᵢ and σᵢ are per-polynomial batching challenges, and each evaluation is weighted
 * by eq(r, u) to "select" the correct evaluation point.
 *
 * This relation contributes the accumulator terms:
 *   - Subrelation 0: batched_unshifted_accumulator * eq_accumulator (non-shifted contribution)
 *   - Subrelation 1: batched_shifted_accumulator * eq_accumulator (shifted contribution)
 *
 * The eq_accumulator polynomial encodes eq(u, r_acc) which "selects" the accumulator's
 * evaluation point. The verifier checks this polynomial matches the expected eq evaluation.
 */
template <typename FF_> class MultilinearBatchingAccumulatorRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        3, // non-shifted accumulator contribution
        3, // shifted accumulator contribution
    };

    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { false, false };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.batched_unshifted_accumulator.is_zero() && in.batched_shifted_accumulator.is_zero()) ||
               (in.eq_accumulator.is_zero());
    }

    /**
     * @brief Accumulate the accumulator's contribution to the batching sumcheck.
     * @details Computes: batched_unshifted * eq + batched_shifted * eq
     */
    template <typename ContainerOverSubrelations, typename AllEntities>
    inline static void accumulate(ContainerOverSubrelations& evals,
                                  const AllEntities& in,
                                  [[maybe_unused]] const RelationParameters<FF>& relation_parameters = {},
                                  [[maybe_unused]] const FF& scaling_factor = {})
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;

        auto batched_unshifted_acc = Accumulator(in.batched_unshifted_accumulator);
        auto eq_acc = Accumulator(in.eq_accumulator);
        auto batched_shifted_acc = Accumulator(in.batched_shifted_accumulator);

        std::get<0>(evals) += (batched_unshifted_acc * eq_acc);
        std::get<1>(evals) += (batched_shifted_acc * eq_acc);
    };
};
/**
 * @brief Relation for instance contribution to the multilinear batching sumcheck.
 *
 * @details Analogous to MultilinearBatchingAccumulatorRelationImpl but for the incoming instance.
 * Contributes the instance terms to the batching sumcheck:
 *   - Subrelation 0: batched_unshifted_instance * eq_instance (non-shifted contribution)
 *   - Subrelation 1: batched_shifted_instance * eq_instance (shifted contribution)
 *
 * The eq_instance polynomial encodes eq(u, r_inst) which "selects" the instance's
 * evaluation point. The verifier checks this polynomial matches the expected eq evaluation.
 */
template <typename FF_> class MultilinearBatchingInstanceRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        3, // non-shifted instance contribution
        3, // shifted instance contribution
    };

    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { false, false };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     */
    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        return (in.batched_unshifted_accumulator.is_zero() && in.batched_unshifted_instance.is_zero() &&
                in.batched_shifted_accumulator.is_zero() && in.batched_shifted_instance.is_zero()) ||
               (in.eq_accumulator.is_zero() && in.eq_instance.is_zero());
    }

    /**
     * @brief Accumulate the instance's contribution to the batching sumcheck.
     * @details Computes: batched_unshifted * eq + batched_shifted * eq
     */
    template <typename ContainerOverSubrelations, typename AllEntities>
    static void accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           [[maybe_unused]] const RelationParameters<FF>& relation_parameters = {},
                           [[maybe_unused]] const FF& scaling_factor = {})
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;

        auto batched_unshifted_inst = Accumulator(in.batched_unshifted_instance);
        auto eq_inst = Accumulator(in.eq_instance);
        auto batched_shifted_inst = Accumulator(in.batched_shifted_instance);

        std::get<0>(evals) += (batched_unshifted_inst * eq_inst);
        std::get<1>(evals) += (batched_shifted_inst * eq_inst);
    };
};

template <typename FF>
using MultilinearBatchingInstanceRelation = Relation<MultilinearBatchingInstanceRelationImpl<FF>>;
template <typename FF>
using MultilinearBatchingAccumulatorRelation = Relation<MultilinearBatchingAccumulatorRelationImpl<FF>>;
} // namespace bb
