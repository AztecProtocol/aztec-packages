// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "poseidon2_permutation.hpp"

#include "barretenberg/honk/execution_trace/gate_data.hpp"

namespace bb::stdlib {

template <typename Builder>
typename Poseidon2Permutation<Builder>::State Poseidon2Permutation<Builder>::permutation(
    Builder* builder, const typename Poseidon2Permutation<Builder>::State& input)
{
    State current_state(input);
    NativeState current_native_state;
    for (size_t i = 0; i < t; ++i) {
        current_native_state[i] = current_state[i].get_value();
    }

    // Apply 1st linear layer both natively and in-circuit.
    NativePermutation::matrix_multiplication_external(current_native_state);
    matrix_multiplication_external(current_state);

    // First set of external rounds
    constexpr size_t rounds_f_beginning = rounds_f / 2;
    for (size_t i = 0; i < rounds_f_beginning; ++i) {
        poseidon2_external_gate_<FF> in{ current_state[0].get_witness_index(),
                                         current_state[1].get_witness_index(),
                                         current_state[2].get_witness_index(),
                                         current_state[3].get_witness_index(),
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

    propagate_current_state_to_next_row(builder, current_state, builder->blocks.poseidon2_external);

    // Internal rounds
    const size_t p_end = rounds_f_beginning + rounds_p;
    for (size_t i = rounds_f_beginning; i < p_end; ++i) {
        poseidon2_internal_gate_<FF> in{ current_state[0].get_witness_index(),
                                         current_state[1].get_witness_index(),
                                         current_state[2].get_witness_index(),
                                         current_state[3].get_witness_index(),
                                         i };
        builder->create_poseidon2_internal_gate(in);
        current_native_state[0] += round_constants[i][0];
        NativePermutation::apply_single_sbox(current_native_state[0]);
        NativePermutation::matrix_multiplication_internal(current_native_state);
        for (size_t j = 0; j < t; ++j) {
            current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
        }
    }

    propagate_current_state_to_next_row(builder, current_state, builder->blocks.poseidon2_internal);

    // Remaining external rounds
    for (size_t i = p_end; i < NUM_ROUNDS; ++i) {
        poseidon2_external_gate_<FF> in{ current_state[0].get_witness_index(),
                                         current_state[1].get_witness_index(),
                                         current_state[2].get_witness_index(),
                                         current_state[3].get_witness_index(),
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

    propagate_current_state_to_next_row(builder, current_state, builder->blocks.poseidon2_external);

    return current_state;
}

/**
 * @brief Separate function to do just the first linear layer (equivalent to external matrix mul).
 * @details Update the state with \f$ M_E \cdot (\text{state}[0], \text{state}[1], \text{state}[2],
 * \text{state}[3])^{\top}\f$. Where \f$ M_E \f$ is the external round matrix. See `Poseidon2ExternalRelationImpl`.
 */
template <typename Builder>
void Poseidon2Permutation<Builder>::matrix_multiplication_external(typename Poseidon2Permutation<Builder>::State& state)
{
    const bb::fr two(2);
    const bb::fr four(4);
    // create the 6 gates for the initial matrix multiplication
    // gate 1: Compute tmp1 = state[0] + state[1] + 2 * state[3]
    field_t<Builder> tmp1 = state[0].add_two(state[1], state[3] * two);

    // gate 2: Compute tmp2 = 2 * state[1] + state[2] + state[3]
    field_t<Builder> tmp2 = state[2].add_two(state[1] * two, state[3]);

    // gate 3: Compute v2 = 4 * state[0] + 4 * state[1] + tmp2
    state[1] = tmp2.add_two(state[0] * four, state[1] * four);

    // gate 4: Compute v1 = v2 + tmp1
    state[0] = state[1] + tmp1;

    // gate 5: Compute v4 = tmp1 + 4 * state[2] + 4 * state[3]
    state[3] = tmp1.add_two(state[2] * four, state[3] * four);

    // gate 6: Compute v3 = v4 + tmp2
    state[2] = state[3] + tmp2;

    // This can only happen if the input contained constant `field_t` elements.
    ASSERT(state[0].is_normalized() && state[1].is_normalized() && state[2].is_normalized() &&
           state[3].is_normalized());
}

template class Poseidon2Permutation<MegaCircuitBuilder>;
template class Poseidon2Permutation<UltraCircuitBuilder>;

} // namespace bb::stdlib
