#pragma once

#include <array>
#include <span>

namespace bb {

/**
 * @brief Compute the Lagrange basis for interleaving challenges.
 * @details Given LOG_K challenges u_0, ..., u_{LOG_K-1}, computes BS = 2^LOG_K basis values
 *          L_j = product over bits of j: if bit_k=1 then u_k, else (1 - u_k).
 *          These are used by the verifier to combine BS individual sumcheck evaluations
 *          into one group evaluation.
 * @tparam BS Batch size (1, 2, or 4)
 */
template <size_t BS, typename FF>
static std::array<FF, BS> compute_interleaving_lagrange_basis(
    [[maybe_unused]] std::span<const FF> interleaving_challenges)
{
    if constexpr (BS == 1) {
        return { FF(1) };
    } else if constexpr (BS == 2) {
        const auto& u = interleaving_challenges[0];
        return { FF(1) - u, u };
    } else {
        static_assert(BS == 4, "Only BS=1, BS=2, and BS=4 are currently supported");
        const auto& u0 = interleaving_challenges[0];
        const auto& u1 = interleaving_challenges[1];
        auto one_minus_u0 = FF(1) - u0;
        auto one_minus_u1 = FF(1) - u1;
        return { one_minus_u0 * one_minus_u1, u0 * one_minus_u1, one_minus_u0 * u1, u0 * u1 };
    }
}

} // namespace bb
