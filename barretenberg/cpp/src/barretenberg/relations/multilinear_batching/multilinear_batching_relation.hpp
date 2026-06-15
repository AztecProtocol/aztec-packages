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
 * @details The prover supplies exactly NumClaims accumulator claims. The powers of the batching challenge γ enter as
 * public coefficients (`relation_parameters.multilinear_batching_challenges`, with the i-th polynomial weighted by
 * γ^i), so the sumcheck proves
 *
 *   Σ_i γ^i · P_i(r_i)       = Σ_x Σ_i γ^i · P_i(x)       · eq(x, r_i)
 *   Σ_i γ^i · P_i_shift(r_i) = Σ_x Σ_i γ^i · P_i_shift(x) · eq(x, r_i)
 *
 * and the sumcheck verifier batches the two identities with its standard alpha separator.
 */
template <typename FF_, size_t NumClaims> class MultilinearBatchingRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        3, // non-shifted accumulator contribution
        3, // shifted accumulator contribution
    };

    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { false, false };

    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        for (size_t idx = 0; idx < NumClaims; ++idx) {
            const bool should_skip =
                (in.non_shifted(idx).is_zero() && in.shifted(idx).is_zero()) || in.eq(idx).is_zero();
            if (!should_skip) {
                return false;
            }
        }
        return true;
    }

    template <typename ContainerOverSubrelations, typename AllEntities>
    static void accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const RelationParameters<FF>& relation_parameters = {},
                           [[maybe_unused]] const FF& scaling_factor = {})
    {
        static_assert(NumClaims <= RelationParameters<FF>::NUM_MULTILINEAR_BATCHING_CHALLENGES);
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;

        // The powers of the batching challenge γ are precomputed by the caller; the i-th polynomial is weighted by
        // γ^i = multilinear_batching_challenges[i].
        const auto& gamma_powers = relation_parameters.multilinear_batching_challenges;
        for (size_t idx = 0; idx < NumClaims; ++idx) {
            const auto eq = Accumulator(in.eq(idx)) * gamma_powers[idx];
            std::get<0>(evals) += Accumulator(in.non_shifted(idx)) * eq;
            std::get<1>(evals) += Accumulator(in.shifted(idx)) * eq;
        }
    };
};

template <typename FF, size_t NumClaims>
using MultilinearBatchingRelation = Relation<MultilinearBatchingRelationImpl<FF, NumClaims>>;

} // namespace bb
