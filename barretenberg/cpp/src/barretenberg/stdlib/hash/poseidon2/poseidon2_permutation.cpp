// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: 777717f6af324188ecd6bb68c3c86ee7befef94d}
// external_1:  { status: Complete, auditors: [@ed25519 (Spearbit)], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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

    // Internal rounds.
    //   Mega: K=4 7-wire compressed layout — 1 entry row + (rounds_p/4 - 1) interior rows + 1 terminal
    //         row + 1 standard-transition bridge. All 56 internal rounds in 14 compressed rows; state[1..3]
    //         at each compressed row's round-start are committed as raw fr values in w_p2_s1/2/3.
    //   Ultra: rounds_p single-round rows + propagate (standard Poseidon2 layout).
    const size_t p_end = rounds_f_beginning + rounds_p;
    if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
        static_assert(rounds_p % 4 == 0);
        constexpr size_t num_quad_rows = rounds_p / 4; // 14 rows for rounds_p = 56

        // Entry transition row (standard encoding): wires share witness indices with the external
        // block's propagate row. The relation forces the first compressed row's (w_r_shift,
        // w_o_shift, w_4_shift) to state[0] at rounds start+1, +2, +3 and copies (w_r, w_o, w_4)
        // into (w_p2_s1_shift, w_p2_s2_shift, w_p2_s3_shift) of that same successor.
        {
            poseidon2_transition_entry_gate_<FF> in{
                current_state[0].get_witness_index(),
                current_state[1].get_witness_index(),
                current_state[2].get_witness_index(),
                current_state[3].get_witness_index(),
                rounds_f_beginning,
            };
            builder->create_poseidon2_transition_entry_gate(in);
        }

        // Helper: emit one K=4 compressed row (interior or terminal) and advance state by 4
        // internal rounds. The committed wires are state[0] at rounds start+0,+1,+2,+3 (w_l, w_r,
        // w_o, w_4) plus state[1..3] at round start (w_p2_s1/2/3). State[1..3] values come from
        // `current_native_state` which holds state at round `start`.
        auto emit_quad_row = [&](size_t quad_idx, bool is_terminal) {
            const size_t start = rounds_f_beginning + (4 * quad_idx);

            // Capture state[1..3] at round `start` (row-start) before advancing.
            const auto s1_at_start = current_native_state[1];
            const auto s2_at_start = current_native_state[2];
            const auto s3_at_start = current_native_state[3];

            // Native: compute state[0] at rounds start+1, +2, +3 by applying 1, 2, 3 rounds.
            NativeState state_after_1 = current_native_state;
            state_after_1[0] += round_constants[start + 0][0];
            NativePermutation::apply_single_sbox(state_after_1[0]);
            NativePermutation::matrix_multiplication_internal(state_after_1);
            auto s0_at_1 = witness_t<Builder>(builder, state_after_1[0]);

            NativeState state_after_2 = state_after_1;
            state_after_2[0] += round_constants[start + 1][0];
            NativePermutation::apply_single_sbox(state_after_2[0]);
            NativePermutation::matrix_multiplication_internal(state_after_2);
            auto s0_at_2 = witness_t<Builder>(builder, state_after_2[0]);

            NativeState state_after_3 = state_after_2;
            state_after_3[0] += round_constants[start + 2][0];
            NativePermutation::apply_single_sbox(state_after_3[0]);
            NativePermutation::matrix_multiplication_internal(state_after_3);
            auto s0_at_3 = witness_t<Builder>(builder, state_after_3[0]);

            poseidon2_double_internal_gate_<FF> in{
                current_state[0].get_witness_index(), // state[0] at round start
                s0_at_1.witness_index,                // state[0] at round start+1
                s0_at_2.witness_index,                // state[0] at round start+2
                s0_at_3.witness_index,                // state[0] at round start+3
                s1_at_start,                          // committed into w_p2_s1
                s2_at_start,                          // committed into w_p2_s2
                s3_at_start,                          // committed into w_p2_s3
                start,
                is_terminal,
            };
            builder->create_poseidon2_double_internal_gate(in);

            // Advance native state by round start+3 to land on state at round start+4.
            current_native_state = state_after_3;
            current_native_state[0] += round_constants[start + 3][0];
            NativePermutation::apply_single_sbox(current_native_state[0]);
            NativePermutation::matrix_multiplication_internal(current_native_state);

            // Fresh witnesses for the full state at round start+4 (= start of next pair or bridge).
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
            }
        };

        // 13 interior compressed rows (covering rounds 0..51 relative)
        for (size_t q = 0; q < num_quad_rows - 1; ++q) {
            emit_quad_row(q, /*is_terminal=*/false);
        }
        // 1 terminal compressed row (covering rounds 52..55 relative)
        emit_quad_row(num_quad_rows - 1, /*is_terminal=*/true);

        // Standard-transition bridge row: unconstrained (w_p2_s* set to zero by set_gate_selector(0)).
        // Shares witness indices with the first final-external gate below.
        builder->create_unconstrained_gate(builder->blocks.poseidon2_double_internal,
                                           current_state[0].get_witness_index(),
                                           current_state[1].get_witness_index(),
                                           current_state[2].get_witness_index(),
                                           current_state[3].get_witness_index());
    } else {
        // Standard single-round layout for Ultra (and any non-Mega builder).
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
    }

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
}

template class Poseidon2Permutation<MegaCircuitBuilder>;
template class Poseidon2Permutation<UltraCircuitBuilder>;

} // namespace bb::stdlib
