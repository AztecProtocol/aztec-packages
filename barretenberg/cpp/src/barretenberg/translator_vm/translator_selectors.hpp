#pragma once
#include "barretenberg/common/assert.hpp"
#include <array>
#include <cstddef>
#include <span>

namespace bb {

/**
 * @brief Evaluates the 10 structured Translator precomputed selectors at a sumcheck challenge point.
 *
 * @details All Translator selectors except ordered_extra_range_constraints_numerator are multilinear
 * polynomials over {0,1}^d whose support forms subcubes or small unions of subcubes. Their evaluations
 * at the sumcheck challenge u = (u_0, ..., u_{d-1}) can be computed in O(d) field operations, using the
 * key property that the sum of multilinear Lagrange basis polynomials over a free subcube equals 1.
 *
 * Bit ordering: row index ℓ = ℓ_0 + 2·ℓ_1 + ... + 2^{d-1}·ℓ_{d-1} (bit 0 = LSB).
 * Bits 0..M-1 encode the position within a mini-circuit block; bits M..D-1 encode the block index.
 *
 * @tparam FF The finite field type.
 * @tparam LOG_MINI_CIRCUIT_SIZE Log2 of the mini-circuit size (e.g. 13 for current Translator).
 */
template <typename FF, size_t LOG_MINI_CIRCUIT_SIZE> struct TranslatorSelectorEvaluations {
    // Derived circuit geometry
    static constexpr size_t LOG_CONCAT_GROUP_SIZE = 4; // log2(16)
    static constexpr size_t LOG_N = LOG_MINI_CIRCUIT_SIZE + LOG_CONCAT_GROUP_SIZE;

    // Row layout constants (structural, not size-dependent)
    static constexpr size_t RESULT_ROW = 8;
    static constexpr size_t NUM_MASKED_ROWS_END = 4;
    static constexpr size_t RANDOMNESS_START = 2;
    static constexpr size_t CONCATENATION_GROUP_SIZE = 1UL << LOG_CONCAT_GROUP_SIZE;
    static constexpr size_t MAX_RANDOM_VALUES_PER_ORDERED = CONCATENATION_GROUP_SIZE * NUM_MASKED_ROWS_END;

    // Bit positions used in the subcube decompositions
    static constexpr size_t LOG_NUM_MASKED = 2;                                      // log2(NUM_MASKED_ROWS_END)
    static constexpr size_t LOG_RESULT_ROW = 3;                                      // log2(RESULT_ROW)
    static constexpr size_t LOG_RANDOMNESS_START = 1;                                // log2(RANDOMNESS_START)
    static constexpr size_t LOG_MAX_RANDOM = LOG_CONCAT_GROUP_SIZE + LOG_NUM_MASKED; // log2(64) = 6

    static_assert((1UL << LOG_NUM_MASKED) == NUM_MASKED_ROWS_END);
    static_assert((1UL << LOG_RESULT_ROW) == RESULT_ROW);
    static_assert((1UL << LOG_RANDOMNESS_START) == RANDOMNESS_START);
    static_assert(LOG_NUM_MASKED < LOG_RESULT_ROW, "NUM_MASKED_ROWS_END must be smaller than RESULT_ROW");
    static_assert(LOG_RESULT_ROW < LOG_MINI_CIRCUIT_SIZE);
    static_assert(LOG_MINI_CIRCUIT_SIZE > LOG_MAX_RANDOM, "Mini circuit must be larger than max random region");

    // The 10 selector evaluations (order matches PrecomputedEntities in translator_flavor.hpp,
    // skipping ordered_extra_range_constraints_numerator which cannot be efficiently computed)
    FF lagrange_first;
    FF lagrange_last;
    FF lagrange_odd_in_minicircuit;
    FF lagrange_even_in_minicircuit;
    FF lagrange_result_row;
    FF lagrange_last_in_minicircuit;
    FF lagrange_masking;
    FF lagrange_mini_masking;
    FF lagrange_real_last;
    FF lagrange_ordered_masking;

    /**
     * @brief Compute evaluations of all 10 structured selectors at the sumcheck challenge.
     *
     * @param u Sumcheck challenge (u_0, ..., u_{LOG_N-1}). Size must equal LOG_N.
     * @return TranslatorSelectorEvaluations with all 10 fields populated.
     */
    static TranslatorSelectorEvaluations compute(std::span<const FF> u)
    {
        // Notation (see class docstring for bit ordering):
        //   D = LOG_N            (total number of sumcheck variables)
        //   M = LOG_MINI_CIRCUIT_SIZE (bits 0..M-1 = intra-block position)
        //   m = LOG_NUM_MASKED   = 2  (last 2^m rows of each block are masking rows)
        //   r = LOG_RESULT_ROW   = 3  (result row = 2^r)
        //   s = LOG_RANDOMNESS_START = 1
        //   R = LOG_MAX_RANDOM   = 6  (last 2^R rows of circuit reserved for ordered masking)
        constexpr size_t D = LOG_N;
        constexpr size_t M = LOG_MINI_CIRCUIT_SIZE;
        constexpr size_t m = LOG_NUM_MASKED;
        constexpr size_t r = LOG_RESULT_ROW;
        constexpr size_t s = LOG_RANDOMNESS_START;
        constexpr size_t R = LOG_MAX_RANDOM;

        BB_ASSERT(u.size() == D);

        TranslatorSelectorEvaluations evals;

        // c[k] = 1 - u[k] (complementary challenge values)
        std::array<FF, D> c;
        for (size_t k = 0; k < D; k++) {
            c[k] = FF(1) - u[k];
        }

        // ---- Reusable partial products (built from smaller to larger, no inversions) ----

        // Products of u[k]:
        //   u_mp1_M1  = ∏_{k=m+1}^{M-1} u[k]  (bits above masking, within mini-circuit)
        //   u_m_M1    = ∏_{k=m}^{M-1}   u[k]  (full masking subcube indicator)
        //   u_Rp1_D1  = ∏_{k=R+1}^{D-1} u[k]  (bits above max-random)
        //   u_R_D1    = ∏_{k=R}^{D-1}   u[k]  (ordered masking subcube indicator)
        //   u_0_R1    = ∏_{k=0}^{R-1}   u[k]  (low bits below max-random)
        //   u_0_m1    = ∏_{k=0}^{m-1}   u[k]  (low masking bits)
        FF u_mp1_M1 = FF(1);
        for (size_t k = m + 1; k < M; k++) {
            u_mp1_M1 *= u[k];
        }
        FF u_m_M1 = u[m] * u_mp1_M1;

        FF u_Rp1_D1 = FF(1);
        for (size_t k = R + 1; k < D; k++) {
            u_Rp1_D1 *= u[k];
        }
        FF u_R_D1 = u[R] * u_Rp1_D1;

        FF u_0_R1 = FF(1);
        for (size_t k = 0; k < R; k++) {
            u_0_R1 *= u[k];
        }

        FF u_0_m1 = FF(1);
        for (size_t k = 0; k < m; k++) {
            u_0_m1 *= u[k];
        }

        // Products of c[k] = (1 - u[k]):
        //   c_rp1_M1 = ∏_{k=r+1}^{M-1} c[k]
        //   c_r_M1   = ∏_{k=r}^{M-1}   c[k]  (even/odd excluded-below indicator)
        //   c_M_D1   = ∏_{k=M}^{D-1}   c[k]  (block-0 indicator for top bits)
        //   c_r_D1   = ∏_{k=r}^{D-1}   c[k]
        //   c_0_r1   = ∏_{k=0}^{r-1}   c[k]
        //   c_s_r1   = ∏_{k=s}^{r-1}   c[k]  (gap between randomness start and result row)
        FF c_rp1_M1 = FF(1);
        for (size_t k = r + 1; k < M; k++) {
            c_rp1_M1 *= c[k];
        }
        FF c_r_M1 = c[r] * c_rp1_M1;

        FF c_M_D1 = FF(1);
        for (size_t k = M; k < D; k++) {
            c_M_D1 *= c[k];
        }

        FF c_r_D1 = c_r_M1 * c_M_D1;

        FF c_0_r1 = FF(1);
        for (size_t k = 0; k < r; k++) {
            c_0_r1 *= c[k];
        }

        FF c_s_r1 = FF(1);
        for (size_t k = s; k < r; k++) {
            c_s_r1 *= c[k];
        }

        // ---- Single-point Lagrange bases ----

        // lagrange_first: row 0 (all bits 0)
        //   eval = ∏_{k=0}^{D-1} (1 - u_k)
        evals.lagrange_first = c_0_r1 * c_r_D1;

        // lagrange_last: row 2^D - 1 (all bits 1)
        //   eval = ∏_{k=0}^{D-1} u_k
        evals.lagrange_last = u_0_R1 * u_R_D1;

        // lagrange_result_row: row 2^r (only bit r set)
        //   eval = u_r · ∏_{k≠r} (1 - u_k)
        evals.lagrange_result_row = c_0_r1 * u[r] * c_rp1_M1 * c_M_D1;

        // lagrange_last_in_minicircuit: row 2^M - 2^m - 1 (bits 0..m-1=1, bit m=0, bits m+1..M-1=1, bits M..D-1=0)
        evals.lagrange_last_in_minicircuit = u_0_m1 * c[m] * u_mp1_M1 * c_M_D1;

        // lagrange_real_last: row 2^D - 2^R - 1 (bits 0..R-1=1, bit R=0, bits R+1..D-1=1)
        evals.lagrange_real_last = u_0_R1 * c[R] * u_Rp1_D1;

        // ---- Subcube indicators ----

        // lagrange_ordered_masking: rows with bits R..D-1 = 1, bits 0..R-1 free
        //   = ∏_{k=R}^{D-1} u_k
        evals.lagrange_ordered_masking = u_R_D1;

        // lagrange_masking: rows with bits m..M-1 = 1, bits 0..m-1 and M..D-1 free
        //   = ∏_{k=m}^{M-1} u_k
        evals.lagrange_masking = u_m_M1;

        // ---- Mini-masking (two disjoint blocks in block 0) ----

        // lagrange_mini_masking: rows [RANDOMNESS_START .. RESULT_ROW-1] ∪ [MINI-NUM_MASKED .. MINI-1], block 0
        //
        //   Part 1: rows [2^s .. 2^r - 1] = {rows [0,2^r-1]} minus {rows [0,2^s-1]}
        //     Row set [0, 2^r-1] has bits r..D-1 = 0 → sum = ∏_{k=r}^{D-1}(1-u_k) = c_r_D1
        //     Row set [0, 2^s-1] has bits s..D-1 = 0 → sum = ∏_{k=s}^{D-1}(1-u_k) = c_s_r1 · c_r_D1
        //     Difference = c_r_D1 · (1 - c_s_r1)
        FF part1 = c_r_D1 * (FF(1) - c_s_r1);

        //   Part 2: rows [2^M - 2^m .. 2^M - 1] in block 0
        //     Subcube: bits m..M-1 = 1, bits 0..m-1 free, bits M..D-1 = 0
        //     = ∏_{k=m}^{M-1} u_k · ∏_{k=M}^{D-1}(1-u_k)
        FF part2 = u_m_M1 * c_M_D1;

        evals.lagrange_mini_masking = part1 + part2;

        // ---- Even/odd alternating selectors ----

        // lagrange_even_in_minicircuit: 1 at even rows in [RESULT_ROW, MINI-NUM_MASKED-2], block 0
        //   Condition: bit 0 = 0, bits M..D-1 = 0, half-index j ∈ [2^(r-1), 2^(M-1) - 2^(m-1) - 1]
        //
        //   The full half-index range [0, 2^(M-1)-1] sums to 1. We subtract the excluded ends:
        //   - Excluded below: j < 2^(r-1) → original bits r..M-1 = 0 → sum = ∏_{k=r}^{M-1}(1-u_k) = c_r_M1
        //   - Excluded above: j >= 2^(M-1) - 2^(m-1) → original bits m..M-1 = 1 → sum = ∏_{k=m}^{M-1} u_k = u_m_M1
        //
        //   eval = (1-u_0) · ∏_{k=M}^{D-1}(1-u_k) · (1 - c_r_M1 - u_m_M1)
        FF inner_even_odd = FF(1) - c_r_M1 - u_m_M1;

        evals.lagrange_even_in_minicircuit = c[0] * c_M_D1 * inner_even_odd;

        // lagrange_odd_in_minicircuit: same structure with bit 0 = 1
        evals.lagrange_odd_in_minicircuit = u[0] * c_M_D1 * inner_even_odd;

        return evals;
    }

    /**
     * @brief Write all 10 computed evaluations into any entity struct with matching named fields.
     * @details Works for AllValues, AllEntities<FF>, PrecomputedEntities<FF>, native or stdlib.
     */
    template <typename Entities> void populate(Entities& target) const
    {
        target.lagrange_first = lagrange_first;
        target.lagrange_last = lagrange_last;
        target.lagrange_odd_in_minicircuit = lagrange_odd_in_minicircuit;
        target.lagrange_even_in_minicircuit = lagrange_even_in_minicircuit;
        target.lagrange_result_row = lagrange_result_row;
        target.lagrange_last_in_minicircuit = lagrange_last_in_minicircuit;
        target.lagrange_masking = lagrange_masking;
        target.lagrange_mini_masking = lagrange_mini_masking;
        target.lagrange_real_last = lagrange_real_last;
        target.lagrange_ordered_masking = lagrange_ordered_masking;
    }
};

} // namespace bb
