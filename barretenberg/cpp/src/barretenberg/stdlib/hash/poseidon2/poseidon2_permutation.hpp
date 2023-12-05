#pragma once
#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace proof_system::plonk::stdlib {

using namespace proof_system;
template <typename Params, typename Builder> class Poseidon2Permutation {
  public:
    using NativePermutation = crypto::Poseidon2Permutation<Params>;
    // t = sponge permutation size (in field elements)
    // t = rate + capacity
    // capacity = 1 field element (256 bits)
    // rate = number of field elements that can be compressed per permutation
    static constexpr size_t t = Params::t;
    // d = degree of s-box polynomials. For a given field, `d` is the smallest element of `p` such that gdc(d, p - 1) =
    // 1 (excluding 1) For bn254/grumpkin, d = 5
    static constexpr size_t d = Params::d;
    // sbox size = number of bits in p
    static constexpr size_t sbox_size = Params::sbox_size;
    // number of full sbox rounds
    static constexpr size_t rounds_f = Params::rounds_f;
    // number of partial sbox rounds
    static constexpr size_t rounds_p = Params::rounds_p;
    static constexpr size_t NUM_ROUNDS = Params::rounds_f + Params::rounds_p;

    using FF = typename Params::FF;
    using State = std::array<field_t<Builder>, t>;
    using NativeState = std::array<FF, t>;

    using RoundConstants = std::array<FF, t>;
    using RoundConstantsContainer = std::array<RoundConstants, NUM_ROUNDS>;
    static constexpr RoundConstantsContainer round_constants = Params::round_constants;
    static State permutation(const State& input)
    {
        // deep copy
        State current_state(input);
        NativeState current_native_state;
        for (size_t i = 0; i < t; ++i) {
            current_native_state[i] = current_state[i].get_value();
        }

        // Apply 1st linear layer
        NativePermutation::matrix_multiplication_external(current_native_state);

        constexpr size_t rounds_f_beginning = rounds_f / 2;
        for (size_t i = 0; i < rounds_f_beginning; ++i) {
            // calculate the new witnesses
            NativePermutation::add_round_constants(current_native_state, round_constants[i]);
            NativePermutation::apply_sbox(current_native_state);
            NativePermutation::matrix_multiplication_external(current_native_state);
        }

        const size_t p_end = rounds_f_beginning + rounds_p;
        for (size_t i = rounds_f_beginning; i < p_end; ++i) {
            current_native_state[0] += round_constants[i][0];
            NativePermutation::apply_single_sbox(current_native_state[0]);
            NativePermutation::matrix_multiplication_internal(current_native_state);
        }

        for (size_t i = p_end; i < NUM_ROUNDS; ++i) {
            NativePermutation::add_round_constants(current_native_state, round_constants[i]);
            NativePermutation::apply_sbox(current_native_state);
            NativePermutation::matrix_multiplication_external(current_native_state);
        }
        return current_state;
    }
};
} // namespace proof_system::plonk::stdlib