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
 * @tparam BS Batch size (must be a power of 2)
 */
template <size_t BS, typename FF>
static std::array<FF, BS> compute_interleaving_lagrange_basis(
    [[maybe_unused]] std::span<const FF> interleaving_challenges) // [[maybe_unused]]: unused when BS==1
{
    static_assert(BS > 0 && (BS & (BS - 1)) == 0, "BS must be a power of 2");
    if constexpr (BS == 1) {
        return { FF(1) };
    } else {
        // General case: L_j = product over bits k of j: if bit_k=1 then u_k, else (1 - u_k)
        constexpr size_t LOG_K = []() {
            size_t v = BS, k = 0;
            while (v > 1) {
                v >>= 1;
                k++;
            }
            return k;
        }();
        std::array<FF, BS> result;
        for (size_t j = 0; j < BS; j++) {
            FF val(1);
            for (size_t k = 0; k < LOG_K; k++) {
                val *= ((j >> k) & 1) ? interleaving_challenges[k] : (FF(1) - interleaving_challenges[k]);
            }
            result[j] = val;
        }
        return result;
    }
}

} // namespace bb
