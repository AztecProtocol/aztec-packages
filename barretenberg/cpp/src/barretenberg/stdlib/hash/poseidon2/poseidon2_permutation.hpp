#pragma once
#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/proof_system/arithmetization/gate_data.hpp"
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

    static State permutation(Builder* builder, const State& input)
    {
        // deep copy
        State current_state(input);
        NativeState current_native_state;
        for (size_t i = 0; i < t; ++i) {
            current_native_state[i] = current_state[i].get_value();
        }

        // Apply 1st linear layer
        NativePermutation::matrix_multiplication_external(current_native_state);
        initial_external_matrix_multiplication(builder, current_state);

        constexpr size_t rounds_f_beginning = rounds_f / 2;
        for (size_t i = 0; i < rounds_f_beginning; ++i) {
            poseidon2_external_gate_<FF> in{ current_state[0].witness_index,
                                             current_state[1].witness_index,
                                             current_state[2].witness_index,
                                             current_state[3].witness_index,
                                             i };
            builder->create_poseidon2_external_gate(in);
            // calculate the new witnesses
            NativePermutation::add_round_constants(current_native_state, round_constants[i]);
            NativePermutation::apply_sbox(current_native_state);
            NativePermutation::matrix_multiplication_external(current_native_state);
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = field_t<Builder>(builder, current_native_state[j]);
            }
        }

        const size_t p_end = rounds_f_beginning + rounds_p;
        for (size_t i = rounds_f_beginning; i < p_end; ++i) {
            poseidon2_internal_gate_<FF> in{ current_state[0].witness_index,
                                             current_state[1].witness_index,
                                             current_state[2].witness_index,
                                             current_state[3].witness_index,
                                             i };
            builder->create_poseidon2_internal_gate(in);
            current_native_state[0] += round_constants[i][0];
            NativePermutation::apply_single_sbox(current_native_state[0]);
            NativePermutation::matrix_multiplication_internal(current_native_state);
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = field_t<Builder>(builder, current_native_state[j]);
            }
        }

        for (size_t i = p_end; i < NUM_ROUNDS; ++i) {
            poseidon2_external_gate_<FF> in{ current_state[0].witness_index,
                                             current_state[1].witness_index,
                                             current_state[2].witness_index,
                                             current_state[3].witness_index,
                                             i };
            builder->create_poseidon2_external_gate(in);
            // calculate the new witnesses
            NativePermutation::add_round_constants(current_native_state, round_constants[i]);
            NativePermutation::apply_sbox(current_native_state);
            NativePermutation::matrix_multiplication_external(current_native_state);
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = field_t<Builder>(builder, current_native_state[j]);
            }
        }
        // need to add an extra row here to ensure that things check out
        poseidon2_end_gate_<FF> in{
            current_state[0].witness_index,
            current_state[1].witness_index,
            current_state[2].witness_index,
            current_state[3].witness_index,
        };
        builder->create_poseidon2_end_gate(in);
        return current_state;
    }

    static void initial_external_matrix_multiplication(Builder* builder, State& state)
    {
        // create the 6 gates for the initial matrix multiplication
        // gate 1: Compute tmp1 = state[0] + state[1] + 2 * state[3]
        FF tmp1 = state[0].get_value() + state[1].get_value() + FF(2) * state[3].get_value();
        uint32_t tmp1_idx = builder->add_variable(tmp1);

        builder->create_big_add_gate({
            .a = state[0].witness_index,
            .b = state[1].witness_index,
            .c = state[3].witness_index,
            .d = tmp1_idx,
            .a_scaling = 1,
            .b_scaling = 1,
            .c_scaling = 2,
            .d_scaling = -1,
            .const_scaling = 0,
        });

        // gate 2: Compute tmp2 = 2 * state[1] + state[2] + state[3]
        FF tmp2 = FF(2) * state[1].get_value() + state[2].get_value() + state[3].get_value();
        uint32_t tmp2_idx = builder->add_variable(tmp2);
        builder->create_big_add_gate({
            .a = state[1].witness_index,
            .b = state[2].witness_index,
            .c = state[3].witness_index,
            .d = tmp2_idx,
            .a_scaling = 2,
            .b_scaling = 1,
            .c_scaling = 1,
            .d_scaling = -1,
            .const_scaling = 0,
        });

        // gate 3: Compute v2 = 4 * state[0] + 4 * state[1] + tmp2
        FF v2 = FF(4) * state[0].get_value() + FF(4) * state[1].get_value() + tmp2;
        uint32_t v2_idx = builder->add_variable(v2);
        builder->create_big_add_gate({
            .a = state[0].witness_index,
            .b = state[1].witness_index,
            .c = tmp2_idx,
            .d = v2_idx,
            .a_scaling = 4,
            .b_scaling = 4,
            .c_scaling = 1,
            .d_scaling = -1,
            .const_scaling = 0,
        });

        // gate 4: Compute v1 = v2 + tmp1
        FF v1 = v2 + tmp1;
        uint32_t v1_idx = builder->add_variable(v1);
        builder->create_big_add_gate({
            .a = v2_idx,
            .b = tmp1_idx,
            .c = v1_idx,
            .d = builder->zero_idx,
            .a_scaling = 1,
            .b_scaling = 1,
            .c_scaling = -1,
            .d_scaling = 0,
            .const_scaling = 0,
        });

        // gate 5: Compute v4 = tmp1 + 4 * state[2] + 4 * state[3]
        FF v4 = tmp1 + FF(4) * state[2].get_value() + FF(4) * state[3].get_value();
        uint32_t v4_idx = builder->add_variable(v4);
        builder->create_big_add_gate({
            .a = tmp1_idx,
            .b = state[2].witness_index,
            .c = state[3].witness_index,
            .d = v4_idx,
            .a_scaling = 1,
            .b_scaling = 4,
            .c_scaling = 4,
            .d_scaling = -1,
            .const_scaling = 0,
        });

        // gate 6: Compute v3 = v4 + tmp2
        FF v3 = v4 + tmp2;
        uint32_t v3_idx = builder->add_variable(v3);
        builder->create_big_add_gate({
            .a = v4_idx,
            .b = tmp2_idx,
            .c = v3_idx,
            .d = builder->zero_idx,
            .a_scaling = 1,
            .b_scaling = 1,
            .c_scaling = -1,
            .d_scaling = 0,
            .const_scaling = 0,
        });

        state[0] = field_t<Builder>::from_witness_index(builder, v1_idx);
        state[1] = field_t<Builder>::from_witness_index(builder, v2_idx);
        state[2] = field_t<Builder>::from_witness_index(builder, v3_idx);
        state[3] = field_t<Builder>::from_witness_index(builder, v4_idx);
    }
};
} // namespace proof_system::plonk::stdlib