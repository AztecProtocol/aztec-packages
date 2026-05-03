// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: 777717f6af324188ecd6bb68c3c86ee7befef94d}
// external_1:  { status: Complete, auditors: [@ed25519 (Spearbit)], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "poseidon2_permutation.hpp"

#include "barretenberg/honk/execution_trace/gate_data.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

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
    // Mega constrains the whole linear layer with a bespoke row; Ultra keeps the arithmetic-gate lowering.
    NativePermutation::matrix_multiplication_external(current_native_state);
    if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
        for (auto& state_limb : current_state) {
            if (state_limb.is_constant()) {
                state_limb = field_t<Builder>::from_witness_index(
                    builder, builder->put_constant_variable(state_limb.get_value()));
            }
        }
        poseidon2_initial_external_gate_<FF> in{ current_state[0].get_witness_index(),
                                                 current_state[1].get_witness_index(),
                                                 current_state[2].get_witness_index(),
                                                 current_state[3].get_witness_index() };
        builder->create_poseidon2_initial_external_gate(in);
        for (size_t j = 0; j < t; ++j) {
            current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
        }
    } else {
        matrix_multiplication_external(current_state);
    }

    constexpr size_t rounds_f_beginning = rounds_f / 2;
    const size_t p_end = rounds_f_beginning + rounds_p;

    if constexpr (IsMegaBuilder<Builder>) {
        // ── Mega: compressed layout ─────────────────────────────────────────────────────
        // 2-per-row external rounds, then K=8-compressed internal rounds, then 2-per-row external.
        static_assert(rounds_f / 2 % 2 == 0, "rounds_f/2 must be even for 2-per-row external");
        static_assert(rounds_p % 8 == 0, "rounds_p must be divisible by 8 for K=8 internal");

        // Helper: emit one external_compressed row covering 2 external rounds [start, start+1].
        // After emission, current_state holds witness indices for state after round start+1.
        auto emit_external_pair = [&](size_t start) {
            // Apply round `start` natively (full 4-lane sbox + M_E).
            NativePermutation::add_round_constants(current_native_state, round_constants[start]);
            NativePermutation::apply_sbox(current_native_state);
            NativePermutation::matrix_multiplication_external(current_native_state);
            // Capture state at round start+1 (= committed into p2_w_5..p2_w_8).
            const FF p2_w_5_v = current_native_state[0];
            const FF p2_w_6_v = current_native_state[1];
            const FF p2_w_7_v = current_native_state[2];
            const FF p2_w_8_v = current_native_state[3];

            // Emit the gate: standard 4 wires hold state at round `start` (from current_state),
            // aux fr values hold state at round start+1.
            poseidon2_external_compressed_gate_<FF> in{
                current_state[0].get_witness_index(),
                current_state[1].get_witness_index(),
                current_state[2].get_witness_index(),
                current_state[3].get_witness_index(),
                p2_w_5_v,
                p2_w_6_v,
                p2_w_7_v,
                p2_w_8_v,
                start,
            };
            builder->create_poseidon2_external_compressed_gate(in);

            // Apply round start+1 natively.
            NativePermutation::add_round_constants(current_native_state, round_constants[start + 1]);
            NativePermutation::apply_sbox(current_native_state);
            NativePermutation::matrix_multiplication_external(current_native_state);
            // Update current_state to fresh witnesses for state at round start+2 (which is
            // either the next external_compressed row's start or the entry row's input).
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
            }
        };

        // First external block: rounds 0..rounds_f_beginning-1, in pairs.
        for (size_t i = 0; i < rounds_f_beginning; i += 2) {
            emit_external_pair(i);
        }

        // Transition-entry row: standard 4-wide state at the start of internal rounds.
        {
            poseidon2_transition_entry_k8_gate_<FF> in{
                current_state[0].get_witness_index(),
                current_state[1].get_witness_index(),
                current_state[2].get_witness_index(),
                current_state[3].get_witness_index(),
                rounds_f_beginning,
            };
            builder->create_poseidon2_transition_entry_k8_gate(in);
        }

        // K=8 internal rows. Each row covers 8 internal rounds. The terminal row activates the
        // K=8 internal terminal selector instead (its successor is standard-encoded).
        const size_t num_k8_rows = rounds_p / 8;
        for (size_t k8_idx = 0; k8_idx < num_k8_rows; ++k8_idx) {
            const size_t start = rounds_f_beginning + 8 * k8_idx;

            // Capture s_0 at rounds start..start+3 as witnesses w_l..w_4 of this row.
            // current_state currently holds state at round `start`.
            const stdlib::field_t<Builder> s0_at_0 = current_state[0];

            // Native: compute s_0 at rounds start+1..start+7 by applying the recurrence 7 times,
            // recording s_0 at each intermediate round.
            std::array<FF, 8> s0_at_round; // s0_at_round[k] = s_0 at round start+k
            s0_at_round[0] = current_native_state[0];
            for (size_t k = 0; k < 7; ++k) {
                current_native_state[0] += round_constants[start + k][0];
                NativePermutation::apply_single_sbox(current_native_state[0]);
                NativePermutation::matrix_multiplication_internal(current_native_state);
                s0_at_round[k + 1] = current_native_state[0];
            }

            // Materialize witnesses for s_0 at rounds start+1..start+3 (wires w_r, w_o, w_4).
            const stdlib::field_t<Builder> s0_at_1 = stdlib::witness_t<Builder>(builder, s0_at_round[1]);
            const stdlib::field_t<Builder> s0_at_2 = stdlib::witness_t<Builder>(builder, s0_at_round[2]);
            const stdlib::field_t<Builder> s0_at_3 = stdlib::witness_t<Builder>(builder, s0_at_round[3]);

            // Aux fr values: s_0 at rounds start+4..start+7 (committed into p2_w_5..p2_w_8).
            poseidon2_k8_internal_gate_<FF> in{
                s0_at_0.get_witness_index(),
                s0_at_1.get_witness_index(),
                s0_at_2.get_witness_index(),
                s0_at_3.get_witness_index(),
                s0_at_round[4],
                s0_at_round[5],
                s0_at_round[6],
                s0_at_round[7],
                start,
                /*is_terminal=*/k8_idx + 1 == num_k8_rows,
            };
            builder->create_poseidon2_k8_internal_gate(in);

            // Apply the 8th round (start+7) natively to land on state at round start+8.
            current_native_state[0] += round_constants[start + 7][0];
            NativePermutation::apply_single_sbox(current_native_state[0]);
            NativePermutation::matrix_multiplication_internal(current_native_state);

            // current_state for the next row's start: fresh witnesses for state at round start+8.
            for (size_t j = 0; j < t; ++j) {
                current_state[j] = witness_t<Builder>(builder, current_native_state[j]);
            }
        }

        // Final external block: rounds p_end..NUM_ROUNDS-1, in pairs.
        for (size_t i = p_end; i < NUM_ROUNDS; i += 2) {
            emit_external_pair(i);
        }

        // Propagate the final state to a successor row so the last external_compressed row's
        // shifted-wire subrelations (which read state at round 64) have a defined target.
        propagate_current_state_to_next_row(builder, current_state, builder->blocks.poseidon2_compressed);

        return current_state;
    } else {
        // First set of external rounds (Ultra path)
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

        // Internal rounds (Ultra path)
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

        // Remaining external rounds (Ultra path)
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
