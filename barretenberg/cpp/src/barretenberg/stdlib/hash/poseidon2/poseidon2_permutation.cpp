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

    // Internal rounds. Mega: 1 entry + 27 interior + 1 terminal + 1 standard transition (covering all
    //                        rounds_p rounds via 28 compressed pairs -- no single-round tail).
    //                  Ultra: rounds_p single-round rows + propagate (standard Poseidon2 layout).
    const size_t p_end = rounds_f_beginning + rounds_p;
    if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
        // Double-round encoding: w_l = state[0] at even round, w_r = state[0] at odd round,
        //   w_o = state[2] at even round, w_4 = state[3] at even round.
        // state[1] is reconstructed inside the relation from the M_I first-row equation.
        static_assert(rounds_p % 2 == 0);
        constexpr size_t num_double_pairs = rounds_p / 2; // 28 pairs for rounds_p=56

        // Entry transition row: standard-encoded state at round `rounds_f_beginning`, copy-constrained
        // (via shared witness indices) to the external block's propagate row in ALL four columns.
        // Forces the first compressed row's w_r (= intermediate_s0) to equal D_1 (s_0 + c)^5 + s_1 + s_2 + s_3.
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

        // Helper: emits one compressed row (interior or terminal) and advances `current_state` by two
        // internal rounds. On interior rows, A_1 uses `s_1^next` reconstruction via q_3. On the terminal
        // row, A_1 compares directly against a standard-encoded successor, so q_3 is unused.
        auto emit_compressed_row = [&](size_t pair, bool is_terminal) {
            const size_t even_round = rounds_f_beginning + (2 * pair);
            const size_t odd_round = even_round + 1;
            const size_t next_even_round = even_round + 2; // unused on terminal row

            NativeState intermediate_native_state = current_native_state;
            intermediate_native_state[0] += round_constants[even_round][0];
            NativePermutation::apply_single_sbox(intermediate_native_state[0]);
            NativePermutation::matrix_multiplication_internal(intermediate_native_state);
            auto intermediate_s0 = witness_t<Builder>(builder, intermediate_native_state[0]);

            poseidon2_double_internal_gate_<FF> in{
                current_state[0].get_witness_index(),
                intermediate_s0.witness_index,
                current_state[2].get_witness_index(),
                current_state[3].get_witness_index(),
                even_round,
                odd_round,
                next_even_round,
                is_terminal,
            };
            builder->create_poseidon2_double_internal_gate(in);

            current_native_state = intermediate_native_state;
            current_native_state[0] += round_constants[odd_round][0];
            NativePermutation::apply_single_sbox(current_native_state[0]);
            NativePermutation::matrix_multiplication_internal(current_native_state);

            for (size_t j = 0; j < t; ++j) {
                current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
            }
        };

        // Phase 1a: 27 interior compressed rows.
        for (size_t pair = 0; pair < num_double_pairs - 1; ++pair) {
            emit_compressed_row(pair, /*is_terminal=*/false);
        }
        // Phase 1b: the last compressed row uses the TERMINAL relation. A_k enforces
        // out_k = w_{k,shift}, where the shifted wires are the adjacent standard transition row.
        emit_compressed_row(num_double_pairs - 1, /*is_terminal=*/true);

        // Standard transition row (unconstrained, standard encoding holding state at round p_end).
        // Placed in the double_internal block so the terminal row's shifted wires land on it. Its
        // 4 wires are copy-constrained (shared witness indices) to the first final-external gate
        // emitted by the external-rounds loop below, which ties the terminal row's A_k constraints
        // to the standard state read by the final external rounds.
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
