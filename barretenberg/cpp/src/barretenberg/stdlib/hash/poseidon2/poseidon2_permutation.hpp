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
    static State permutation(const State& input)
    {
        Builder* ctx = input[0].get_context();
        assert(ctx != nullptr);
        // deep copy
        State current_state(input);
        NativeState current_native_state;
        for (size_t i = 0; i < t; ++i) {
            current_native_state[i] = current_state[i].get_value();
        }

        // Apply 1st linear layer
        NativePermutation::matrix_multiplication_external(current_native_state);
        initial_external_matrix_multiplication(current_state);

        constexpr size_t rounds_f_beginning = rounds_f / 2;
        for (size_t i = 0; i < rounds_f_beginning; ++i) {
            poseidon2_external_gate_<FF> in{ current_state[0].witness_index,
                                             current_state[1].witness_index,
                                             current_state[2].witness_index,
                                             current_state[3].witness_index,
                                             i };
            ctx->create_poseidon2_external_gate(in);
            // calculate the new witnesses
            NativePermutation::add_round_constants(current_native_state, round_constants[i]);
            NativePermutation::apply_sbox(current_native_state);
            NativePermutation::matrix_multiplication_external(current_native_state);
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = field_t<Builder>(ctx, current_native_state[j]);
            }
        }

        const size_t p_end = rounds_f_beginning + rounds_p;
        for (size_t i = rounds_f_beginning; i < p_end; ++i) {
            poseidon2_internal_gate_<FF> in{ current_state[0].witness_index,
                                             current_state[1].witness_index,
                                             current_state[2].witness_index,
                                             current_state[3].witness_index,
                                             i };
            ctx->create_poseidon2_internal_gate(in);
            current_native_state[0] += round_constants[i][0];
            NativePermutation::apply_single_sbox(current_native_state[0]);
            NativePermutation::matrix_multiplication_internal(current_native_state);
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = field_t<Builder>(ctx, current_native_state[j]);
            }
        }

        for (size_t i = p_end; i < NUM_ROUNDS; ++i) {
            poseidon2_external_gate_<FF> in{ current_state[0].witness_index,
                                             current_state[1].witness_index,
                                             current_state[2].witness_index,
                                             current_state[3].witness_index,
                                             i };
            ctx->create_poseidon2_external_gate(in);
            // calculate the new witnesses
            NativePermutation::add_round_constants(current_native_state, round_constants[i]);
            NativePermutation::apply_sbox(current_native_state);
            NativePermutation::matrix_multiplication_external(current_native_state);
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = field_t<Builder>(ctx, current_native_state[j]);
            }
        }
        // need to add an extra row here to ensure that things check out
        poseidon2_end_gate_<FF> in{
            current_state[0].witness_index,
            current_state[1].witness_index,
            current_state[2].witness_index,
            current_state[3].witness_index,
        };
        ctx->create_poseidon2_end_gate(in);
        return current_state;
    }

    static void initial_external_matrix_multiplication(State& state)
    {
        Builder* ctx = state[0].get_context();
        assert(ctx != nullptr);

        // create the 6 gates for the initial matrix multiplication
        // gate 1: Compute tmp1 = state[0] + state[1] + 2 * state[3]
        field_t<Builder> tmp1{ ctx, state[0].get_value() + state[1].get_value() + 2 * state[3].get_value() };
        add_quad_<FF> in{
            .a = state[0].witness_index,
            .b = state[1].witness_index,
            .c = state[3].witness_index,
            .d = tmp1,
            .a_scaling = 1,
            .b_scaling = 1,
            .c_scaling = 2,
            .d_scaling = -1,
            .const_scaling = 0,
        };
        ctx->create_add_quad_gate(in);

        // gate 2: Compute tmp2 = 2 * state[1] + state[2] + state[3]
        field_t<Builder> tmp2{ ctx, 2 * state[1].get_value() + state[2].get_value() + state[3].get_value() };
        in = {
            .a = state[1].witness_index,
            .b = state[2].witness_index,
            .c = state[3].witness_index,
            .d = tmp2,
            .a_scaling = 2,
            .b_scaling = 1,
            .c_scaling = 1,
            .d_scaling = -1,
            .const_scaling = 0,
        };
        ctx->create_add_quad_gate(in);

        // gate 3: Compute v2 = 4 * state[0] + 4 * state[1] + tmp2
        field_t<Builder> v2{ ctx, 4 * state[0].get_value() + 4 * state[1].get_value() + tmp2.get_value() };
        in = {
            .a = state[0].witness_index,
            .b = state[1].witness_index,
            .c = tmp2,
            .d = v2,
            .a_scaling = 4,
            .b_scaling = 4,
            .c_scaling = 1,
            .d_scaling = -1,
            .const_scaling = 0,
        };
        ctx->create_add_quad_gate(in);

        // gate 4: Compute v1 = v2 + tmp1
        field_t<Builder> v1{ ctx, v2.get_value() + tmp1.get_value() };
        in = {
            .a = v2,
            .b = tmp1,
            .c = v1,
            .d = ctx->zero_idx,
            .a_scaling = 1,
            .b_scaling = 1,
            .c_scaling = -1,
            .d_scaling = 0,
            .const_scaling = 0,
        };
        ctx->create_add_quad_gate(in);

        // gate 5: Compute v4 = tmp1 + 4 * state[2] + 4 * state[3]
        field_t<Builder> v4{ ctx, tmp1.get_value() + 4 * state[2].get_value() + 4 * state[3].get_value() };
        in = {
            .a = tmp1,
            .b = state[2].witness_index,
            .c = state[3].witness_index,
            .d = v4,
            .a_scaling = 1,
            .b_scaling = 4,
            .c_scaling = 4,
            .d_scaling = -1,
            .const_scaling = 0,
        };
        ctx->create_add_quad_gate(in);

        // gate 6: Compute v3 = v4 + tmp2
        field_t<Builder> v3{ ctx, v4.get_value() + tmp2.get_value() };
        in = {
            .a = v4,
            .b = tmp2,
            .c = v3,
            .d = ctx->zero_idx,
            .a_scaling = 1,
            .b_scaling = 1,
            .c_scaling = -1,
            .d_scaling = 0,
            .const_scaling = 0,
        };
        ctx->create_add_quad_gate(in);

        state[0] = v1;
        state[1] = v2;
        state[2] = v3;
        state[3] = v4;
    }
};
} // namespace proof_system::plonk::stdlib