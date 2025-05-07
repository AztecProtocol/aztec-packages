#pragma once

#ifdef STARKNET_GARAGA_FLAVORS
#include <array>
#include <cstddef>
#include <cstdint>

namespace bb::starknet::crypto {

template <typename Params> class PoseidonPermutation {
  public:
    static constexpr size_t t = Params::t;
    static constexpr size_t d = Params::d;
    static constexpr size_t sbox_size = Params::sbox_size;
    static constexpr size_t rounds_f = Params::rounds_f;
    static constexpr size_t rounds_p = Params::rounds_p;
    static constexpr size_t NUM_ROUNDS = Params::rounds_f + Params::rounds_p;

    using FF = typename Params::FF;
    using State = std::array<FF, t>;
    using RoundConstants = std::array<FF, t>;
    using MatrixDiagonal = std::array<FF, t>;
    using RoundConstantsContainer = std::array<RoundConstants, NUM_ROUNDS>;

    static constexpr MatrixDiagonal internal_matrix_diagonal = Params::internal_matrix_diagonal;
    static constexpr RoundConstantsContainer round_constants = Params::round_constants;

    static constexpr void add_round_constants(State& input, const RoundConstants& rc)
    {
        for (size_t i = 0; i < t; ++i) {
            input[i] += rc[i];
        }
    }

    static constexpr void matrix_multiplication_internal(State& input)
    {
        auto sum = input[0];
        for (size_t i = 1; i < t; ++i) {
            sum += input[i];
        }
        for (size_t i = 0; i < t; ++i) {
            input[i] *= internal_matrix_diagonal[i];
            input[i] += sum;
        }
    }

    static constexpr void apply_single_sbox(FF& input)
    {
        static_assert(d == 3);
        auto xx = input.sqr();
        input *= xx;
    }

    static constexpr void apply_sbox(State& input)
    {
        for (auto& in : input) {
            apply_single_sbox(in);
        }
    }

    static constexpr State permutation(const State& input)
    {
        State current_state(input);

        constexpr size_t rounds_f_beginning = rounds_f / 2;
        for (size_t i = 0; i < rounds_f_beginning; ++i) {
            add_round_constants(current_state, round_constants[i]);
            apply_sbox(current_state);
            matrix_multiplication_internal(current_state);
        }

        const size_t p_end = rounds_f_beginning + rounds_p;
        for (size_t i = rounds_f_beginning; i < p_end; ++i) {
            current_state[2] += round_constants[i][2];
            apply_single_sbox(current_state[2]);
            matrix_multiplication_internal(current_state);
        }

        for (size_t i = p_end; i < NUM_ROUNDS; ++i) {
            add_round_constants(current_state, round_constants[i]);
            apply_sbox(current_state);
            matrix_multiplication_internal(current_state);
        }

        return current_state;
    }
};

} // namespace bb::starknet::crypto
#endif
