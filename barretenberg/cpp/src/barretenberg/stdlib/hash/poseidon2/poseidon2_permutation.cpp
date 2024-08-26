#include "poseidon2_permutation.hpp"

#include "barretenberg/plonk_honk_shared/arithmetization/gate_data.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb::stdlib {

/**
 * @brief Circuit form of Poseidon2 permutation from https://eprint.iacr.org/2023/323 for MegaCircuitBuilder.
 * @details The permutation consists of one initial linear layer, then a set of external rounds, a set of internal
 * rounds, and a set of external rounds.
 * @param builder
 * @param input
 * @return State
 */
template <typename Params, typename Builder>
typename Poseidon2Permutation<Params, Builder>::State Poseidon2Permutation<Params, Builder>::permutation(
    Builder* builder, const typename Poseidon2Permutation<Params, Builder>::State& input)
    requires(!IsSimulator<Builder>)
{
    // deep copy
    State current_state(input);
    NativeState current_native_state;
    for (size_t i = 0; i < t; ++i) {
        current_native_state[i] = current_state[i].get_value();
    }

    // Apply 1st linear layer
    NativePermutation::matrix_multiplication_external(current_native_state);
    matrix_multiplication_external(builder, current_state);

    // First set of external rounds
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
            current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
        }
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/879): dummy gate required since the last external gate
    // from above otherwise expects to read into the first internal gate which is sorted out of sequence
    builder->create_dummy_gate(builder->blocks.poseidon_external,
                               current_state[0].witness_index,
                               current_state[1].witness_index,
                               current_state[2].witness_index,
                               current_state[3].witness_index);

    // Internal rounds
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
            current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
        }
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/879): dummy gate required since the last internal gate
    // otherwise expects to read into the next external gate which is sorted out of sequence
    builder->create_dummy_gate(builder->blocks.poseidon_internal,
                               current_state[0].witness_index,
                               current_state[1].witness_index,
                               current_state[2].witness_index,
                               current_state[3].witness_index);

    // Remaining external rounds
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
            current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
        }
    }
    // The Poseidon2 permutation is 64 rounds, but needs to be a block of 65 rows, since the result of
    // applying a round of Poseidon2 is stored in the next row (the shifted row). As a result, we need this end row to
    // compare with the result from the 64th round of Poseidon2. Note that it does not activate any selectors since it
    // only serves as a comparison through the shifted wires.
    builder->create_dummy_gate(builder->blocks.poseidon_external,
                               current_state[0].witness_index,
                               current_state[1].witness_index,
                               current_state[2].witness_index,
                               current_state[3].witness_index);
    return current_state;
}

/**
 * @brief Circuit form of Poseidon2 permutation from https://eprint.iacr.org/2023/323 for UltraCircuitBuilder.
 * @details The permutation consists of one initial linear layer, then a set of external rounds, a set of internal
 * rounds, and a set of external rounds.
 * @param builder
 * @param input
 * @return State
 */
template <typename Params, typename Builder>
typename Poseidon2Permutation<Params, Builder>::State Poseidon2Permutation<Params, Builder>::permutation(
    Builder* builder, const typename Poseidon2Permutation<Params, Builder>::State& input)
    requires IsSimulator<Builder>
{
    // deep copy
    State current_state(input);

    // Apply 1st linear layer
    matrix_multiplication_external(builder, current_state);

    // First set of external rounds
    constexpr size_t rounds_f_beginning = rounds_f / 2;
    for (size_t i = 0; i < rounds_f_beginning; ++i) {
        add_round_constants(current_state, round_constants[i]);
        apply_sbox(current_state);
        matrix_multiplication_external(builder, current_state);
    }

    // Internal rounds
    const size_t p_end = rounds_f_beginning + rounds_p;
    for (size_t i = rounds_f_beginning; i < p_end; ++i) {
        current_state[0] += round_constants[i][0];
        apply_single_sbox(current_state[0]);
        matrix_multiplication_internal(current_state);
    }

    // Remaining external rounds
    for (size_t i = p_end; i < NUM_ROUNDS; ++i) {
        add_round_constants(current_state, round_constants[i]);
        apply_sbox(current_state);
        matrix_multiplication_external(builder, current_state);
    }
    return current_state;
}

template <typename Params, typename Builder>
void Poseidon2Permutation<Params, Builder>::add_round_constants(
    State& input, const typename Poseidon2Permutation<Params, Builder>::RoundConstants& rc)
    requires IsSimulator<Builder>

{
    for (size_t i = 0; i < t; ++i) {
        input[i] += rc[i];
    }
}

template <typename Params, typename Builder>
void Poseidon2Permutation<Params, Builder>::apply_sbox(State& input)
    requires IsSimulator<Builder>
{
    for (auto& in : input) {
        apply_single_sbox(in);
    }
}

template <typename Params, typename Builder>
void Poseidon2Permutation<Params, Builder>::apply_single_sbox(field_t<Builder>& input)
    requires IsSimulator<Builder>
{
    // hardcoded assumption that d = 5. should fix this or not make d configurable
    auto xx = input.sqr();
    auto xxxx = xx.sqr();
    input *= xxxx;
}

template <typename Params, typename Builder>
void Poseidon2Permutation<Params, Builder>::matrix_multiplication_internal(State& input)
    requires IsSimulator<Builder>
{
    // for t = 4
    auto sum = input[0];
    for (size_t i = 1; i < t; ++i) {
        sum += input[i];
    }
    for (size_t i = 0; i < t; ++i) {
        input[i] *= Params::internal_matrix_diagonal[i]; // internal_matrix_diagonal[i];
        input[i] += sum;
    }
}

/**
 * @brief Separate function to do just the first linear layer (equivalent to external matrix mul).
 * @details We use 6 arithmetic gates to implement:
 *          gate 1: Compute tmp1 = state[0] + state[1] + 2 * state[3]
 *          gate 2: Compute tmp2 = 2 * state[1] + state[2] + state[3]
 *          gate 3: Compute v2 = 4 * state[0] + 4 * state[1] + tmp2
 *          gate 4: Compute v1 = v2 + tmp1
 *          gate 5: Compute v4 = tmp1 + 4 * state[2] + 4 * state[3]
 *          gate 6: Compute v3 = v4 + tmp2
 *          output state is [v1, v2, v3, v4]
 * @param builder
 * @param state
 */
template <typename Params, typename Builder>
void Poseidon2Permutation<Params, Builder>::matrix_multiplication_external(
    Builder* builder, typename Poseidon2Permutation<Params, Builder>::State& state)
{
    // create the 6 gates for the initial matrix multiplication
    // gate 1: Compute tmp1 = state[0] + state[1] + 2 * state[3]
    field_t<Builder> tmp1 =
        witness_t<Builder>(builder, state[0].get_value() + state[1].get_value() + FF(2) * state[3].get_value());
    builder->create_big_add_gate({
        .a = state[0].witness_index,
        .b = state[1].witness_index,
        .c = state[3].witness_index,
        .d = tmp1.witness_index,
        .a_scaling = 1,
        .b_scaling = 1,
        .c_scaling = 2,
        .d_scaling = -1,
        .const_scaling = 0,
    });

    // gate 2: Compute tmp2 = 2 * state[1] + state[2] + state[3]
    field_t<Builder> tmp2 =
        witness_t<Builder>(builder, FF(2) * state[1].get_value() + state[2].get_value() + state[3].get_value());
    builder->create_big_add_gate({
        .a = state[1].witness_index,
        .b = state[2].witness_index,
        .c = state[3].witness_index,
        .d = tmp2.witness_index,
        .a_scaling = 2,
        .b_scaling = 1,
        .c_scaling = 1,
        .d_scaling = -1,
        .const_scaling = 0,
    });

    // gate 3: Compute v2 = 4 * state[0] + 4 * state[1] + tmp2
    field_t<Builder> v2 =
        witness_t<Builder>(builder, FF(4) * state[0].get_value() + FF(4) * state[1].get_value() + tmp2.get_value());
    builder->create_big_add_gate({
        .a = state[0].witness_index,
        .b = state[1].witness_index,
        .c = tmp2.witness_index,
        .d = v2.witness_index,
        .a_scaling = 4,
        .b_scaling = 4,
        .c_scaling = 1,
        .d_scaling = -1,
        .const_scaling = 0,
    });

    // gate 4: Compute v1 = v2 + tmp1
    field_t<Builder> v1 = witness_t<Builder>(builder, v2.get_value() + tmp1.get_value());
    builder->create_big_add_gate({
        .a = v2.witness_index,
        .b = tmp1.witness_index,
        .c = v1.witness_index,
        .d = builder->zero_idx,
        .a_scaling = 1,
        .b_scaling = 1,
        .c_scaling = -1,
        .d_scaling = 0,
        .const_scaling = 0,
    });

    // gate 5: Compute v4 = tmp1 + 4 * state[2] + 4 * state[3]
    field_t<Builder> v4 =
        witness_t<Builder>(builder, tmp1.get_value() + FF(4) * state[2].get_value() + FF(4) * state[3].get_value());
    builder->create_big_add_gate({
        .a = tmp1.witness_index,
        .b = state[2].witness_index,
        .c = state[3].witness_index,
        .d = v4.witness_index,
        .a_scaling = 1,
        .b_scaling = 4,
        .c_scaling = 4,
        .d_scaling = -1,
        .const_scaling = 0,
    });

    // gate 6: Compute v3 = v4 + tmp2
    field_t<Builder> v3 = witness_t<Builder>(builder, v4.get_value() + tmp2.get_value());
    builder->create_big_add_gate({
        .a = v4.witness_index,
        .b = tmp2.witness_index,
        .c = v3.witness_index,
        .d = builder->zero_idx,
        .a_scaling = 1,
        .b_scaling = 1,
        .c_scaling = -1,
        .d_scaling = 0,
        .const_scaling = 0,
    });

    state[0] = v1;
    state[1] = v2;
    state[2] = v3;
    state[3] = v4;
}

template class Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams, MegaCircuitBuilder>;
template class Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams, UltraCircuitBuilder>;
template class Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams, CircuitSimulatorBN254>;

} // namespace bb::stdlib