// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "poseidon2_params.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

namespace bb::crypto {

/**
 * @brief Applies the Poseidon2 permutation function from https://eprint.iacr.org/2023/323.
 * @details This algorithm was implemented using https://github.com/HorizenLabs/poseidon2 as a reference.
 *
 * @tparam Params
 */
template <typename Params> class Poseidon2Permutation {
  public:
    // t = sponge permutation size (in field elements)
    // t = rate + capacity
    // capacity = 1 field element (256 bits)
    // rate = number of field elements that can be compressed per permutation
    static constexpr size_t t = Params::t;
    // number of full sbox rounds
    static constexpr size_t rounds_f = Params::rounds_f;
    // number of partial sbox rounds
    static constexpr size_t rounds_p = Params::rounds_p;
    static constexpr size_t NUM_ROUNDS = Params::rounds_f + Params::rounds_p;

    using FF = typename Params::FF;
    using State = std::array<FF, t>;
    using RoundConstants = std::array<FF, t>;
    using MatrixDiagonal = std::array<FF, t>;
    using RoundConstantsContainer = std::array<RoundConstants, NUM_ROUNDS>;

    static constexpr MatrixDiagonal internal_matrix_diagonal_minus_one = Params::internal_matrix_diagonal_minus_one;
    static constexpr RoundConstantsContainer round_constants = Params::round_constants;
    // D_0, the first diagonal entry of the internal matrix
    static constexpr FF internal_matrix_diagonal_0 = internal_matrix_diagonal_minus_one[0] + FF(1);

    static constexpr void matrix_multiplication_4x4(State& input)
    {
        /**
         * hardcoded algorithm that evaluates matrix multiplication using the following MDS matrix:
         * /         \
         * | 5 7 1 3 |
         * | 4 6 1 1 |
         * | 1 3 5 7 |
         * | 1 1 4 6 |
         * \         /
         *
         * Algorithm is taken directly from the Poseidon2 paper.
         */
        auto t0 = input[0] + input[1]; // A + B
        auto t1 = input[2] + input[3]; // C + D
        auto t2 = input[1] + input[1]; // 2B
        t2 += t1;                      // 2B + C + D
        auto t3 = input[3] + input[3]; // 2D
        t3 += t0;                      // 2D + A + B
        auto t4 = t1 + t1;
        t4 += t4;
        t4 += t3; // A + B + 4C + 6D
        auto t5 = t0 + t0;
        t5 += t5;
        t5 += t2;          // 4A + 6B + C + D
        auto t6 = t3 + t5; // 5A + 7B + C + 3D
        auto t7 = t2 + t4; // A + 3B + 5C + 7D
        input[0] = t6;
        input[1] = t5;
        input[2] = t7;
        input[3] = t4;
    }

    static constexpr void add_round_constants(State& input, const RoundConstants& rc)
    {
        for (size_t i = 0; i < t; ++i) {
            input[i] += rc[i];
        }
    }

    static constexpr void matrix_multiplication_internal(State& input)
    {
        // for t = 4
        // Computes: result[i] = (D_i - 1) * input[i] + sum = D_i * input[i] + (sum of other elements)
        // where D_i are the actual diagonal values and internal_matrix_diagonal_minus_one[i] = D_i - 1.
        // result[0] is formed as D_0 * input[0] + (input[1] + input[2] + input[3]) so that it depends on input[0]
        // through a single multiplication and addition.
        static_assert(t == 4, "Only t=4 is supported");
        FF sum_rest = input[1] + input[2];
        sum_rest += input[3];
        const FF sum = input[0] + sum_rest;
        const FF scaled_0 = input[0] * internal_matrix_diagonal_0;
        const FF scaled_1 = input[1] * internal_matrix_diagonal_minus_one[1];
        const FF scaled_2 = input[2] * internal_matrix_diagonal_minus_one[2];
        const FF scaled_3 = input[3] * internal_matrix_diagonal_minus_one[3];
        input[0] = scaled_0 + sum_rest;
        input[1] = scaled_1 + sum;
        input[2] = scaled_2 + sum;
        input[3] = scaled_3 + sum;
    }

    static constexpr void matrix_multiplication_external(State& input)
    {
        static_assert(t == 4, "Only t=4 is supported");
        matrix_multiplication_4x4(input);
    }

    /**
     * @brief S-box: x -> x^5
     *
     * @details For a given field, `d` is the smallest element of `p` such that gdc(d, p - 1) = 1 (excluding 1) For
     * bn254/grumpkin, d = 5
     */
    static constexpr void apply_single_sbox(FF& input)
    {
        auto x2 = input.sqr();
        x2.self_sqr(); // x2 -> x4
        input *= x2;
    }

    static constexpr void apply_sbox(State& input)
    {
        // The four S-boxes are evaluated stage by stage so that their independent multiplications interleave.
        static_assert(t == 4, "Only t=4 is supported");
        FF x4_0 = input[0].sqr();
        FF x4_1 = input[1].sqr();
        FF x4_2 = input[2].sqr();
        FF x4_3 = input[3].sqr();
        x4_0.self_sqr();
        x4_1.self_sqr();
        x4_2.self_sqr();
        x4_3.self_sqr();
        input[0] *= x4_0;
        input[1] *= x4_1;
        input[2] *= x4_2;
        input[3] *= x4_3;
    }

    /**
     * @brief One external round on a state held in locals: add round constants, S-box layer, external matrix.
     */
    static constexpr void external_round(FF& s0, FF& s1, FF& s2, FF& s3, const RoundConstants& rc)
    {
        State state{ s0, s1, s2, s3 };
        add_round_constants(state, rc);
        apply_sbox(state);
        matrix_multiplication_external(state);
        s0 = state[0];
        s1 = state[1];
        s2 = state[2];
        s3 = state[3];
    }

    /**
     * @brief In-place Poseidon2 permutation from https://eprint.iacr.org/2023/323.
     * @details The permutation consists of one initial linear layer, then a set of external rounds, a set of internal
     * rounds, and a set of external rounds.
     *
     * The internal rounds compute the same values as `apply_single_sbox` followed by `matrix_multiplication_internal`,
     * arranged to shorten the dependency chain through state[0]. With sb = (state[0] + c)^5 and
     * t = state[1] + state[2] + state[3], the internal matrix gives
     *   state[0] <- D_0 * sb + t
     *   state[i] <- (D_i - 1) * state[i] + (sb + t)   for i = 1, 2, 3
     * so only the S-box and one multiplication by D_0 lie on the round-to-round critical path; the three other
     * diagonal multiplications are issued between the S-box steps, where they overlap with it.
     */
    static constexpr void permutation_inplace(State& state)
    {
        static_assert(t == 4, "Only t=4 is supported");
        // Apply 1st linear layer
        matrix_multiplication_external(state);

        FF s0 = state[0];
        FF s1 = state[1];
        FF s2 = state[2];
        FF s3 = state[3];

        // First set of external rounds
        constexpr size_t rounds_f_beginning = rounds_f / 2;
        for (size_t i = 0; i < rounds_f_beginning; ++i) {
            external_round(s0, s1, s2, s3, round_constants[i]);
        }

        // Internal rounds
        constexpr size_t p_end = rounds_f_beginning + rounds_p;
        for (size_t i = rounds_f_beginning; i < p_end; ++i) {
            const FF u = s0 + round_constants[i][0];
            FF u_4 = u.sqr();
            FF sum_rest = s1 + s2;
            sum_rest += s3;
            const FF s1_scaled = s1 * internal_matrix_diagonal_minus_one[1];
            u_4.self_sqr();
            const FF s2_scaled = s2 * internal_matrix_diagonal_minus_one[2];
            const FF sb = u * u_4;
            const FF s3_scaled = s3 * internal_matrix_diagonal_minus_one[3];
            const FF sum = sb + sum_rest;
            s0 = sb * internal_matrix_diagonal_0;
            s0 += sum_rest;
            s1 = s1_scaled + sum;
            s2 = s2_scaled + sum;
            s3 = s3_scaled + sum;
        }

        // Remaining external rounds
        for (size_t i = p_end; i < NUM_ROUNDS; ++i) {
            external_round(s0, s1, s2, s3, round_constants[i]);
        }

        state[0] = s0;
        state[1] = s1;
        state[2] = s2;
        state[3] = s3;
    }

    /**
     * @brief Native form of Poseidon2 permutation (returns new state).
     */
    static constexpr State permutation(const State& input)
    {
        State result(input);
        permutation_inplace(result);
        return result;
    }
};
} // namespace bb::crypto
