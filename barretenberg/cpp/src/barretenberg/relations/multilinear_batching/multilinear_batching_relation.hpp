// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Relation for the multilinear batching sumcheck.
 *
 * @details The prover supplies up to MaxNumClaims accumulator claims, already scaled by a Fiat-Shamir slot batching
 * challenge. The sumcheck proves
 *
 *   Σ_i γ^i · P_i(r_i)       = Σ_x Σ_i (γ^i · P_i(x))       · eq(x, r_i)
 *   Σ_i γ^i · P_i_shift(r_i) = Σ_x Σ_i (γ^i · P_i_shift(x)) · eq(x, r_i)
 *
 * and the sumcheck verifier batches the two identities with its standard alpha separator.
 */
template <typename FF_, size_t MaxNumClaims> class MultilinearBatchingRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        3, // non-shifted accumulator contribution
        3, // shifted accumulator contribution
    };

    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { false, false };

    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        for (size_t idx = 0; idx < MaxNumClaims; ++idx) {
            if (!(in.non_shifted(idx).is_zero() && in.shifted(idx).is_zero()) && !in.eq(idx).is_zero()) {
                return false;
            }
        }
        return true;
    }

    template <typename ContainerOverSubrelations, typename AllEntities>
    static void accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           [[maybe_unused]] const RelationParameters<FF>& relation_parameters = {},
                           [[maybe_unused]] const FF& scaling_factor = {})
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;

        for (size_t idx = 0; idx < MaxNumClaims; ++idx) {
            if constexpr (!requires { typename FF::Builder; }) {
                if ((in.non_shifted(idx).is_zero() && in.shifted(idx).is_zero()) || in.eq(idx).is_zero()) {
                    continue;
                }
            }
            const auto eq = Accumulator(in.eq(idx));
            std::get<0>(evals) += Accumulator(in.non_shifted(idx)) * eq;
            std::get<1>(evals) += Accumulator(in.shifted(idx)) * eq;
        }
    };
};

template <typename FF, size_t MaxNumClaims>
using MultilinearBatchingRelation = Relation<MultilinearBatchingRelationImpl<FF, MaxNumClaims>>;

} // namespace bb
