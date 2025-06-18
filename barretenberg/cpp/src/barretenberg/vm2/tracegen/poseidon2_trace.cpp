#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"

#include <cstdint>
#include <memory>

#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/ecc/fields/field_declarations.hpp"
#include "barretenberg/vm2/generated/relations/lookups_poseidon2_hash.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

using Poseidon2Perm = bb::crypto::Poseidon2Permutation<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

namespace bb::avm2::tracegen {

namespace {

using StateCols = std::array<Column, 4>;
// This absolute monstrosity is a mapping of the intermediate round columns (round & state) to the "flattened" columns
// in the trace.
constexpr std::array<StateCols, 64> intermediate_round_cols = { {
    // Full rounds
    { Column::poseidon2_perm_T_0_6,
      Column::poseidon2_perm_T_0_5,
      Column::poseidon2_perm_T_0_7,
      Column::poseidon2_perm_T_0_4 },
    { Column::poseidon2_perm_T_1_6,
      Column::poseidon2_perm_T_1_5,
      Column::poseidon2_perm_T_1_7,
      Column::poseidon2_perm_T_1_4 },
    { Column::poseidon2_perm_T_2_6,
      Column::poseidon2_perm_T_2_5,
      Column::poseidon2_perm_T_2_7,
      Column::poseidon2_perm_T_2_4 },
    { Column::poseidon2_perm_T_3_6,
      Column::poseidon2_perm_T_3_5,
      Column::poseidon2_perm_T_3_7,
      Column::poseidon2_perm_T_3_4 },
    // Partial rounds
    { Column::poseidon2_perm_B_4_0,
      Column::poseidon2_perm_B_4_1,
      Column::poseidon2_perm_B_4_2,
      Column::poseidon2_perm_B_4_3 },
    { Column::poseidon2_perm_B_5_0,
      Column::poseidon2_perm_B_5_1,
      Column::poseidon2_perm_B_5_2,
      Column::poseidon2_perm_B_5_3 },
    { Column::poseidon2_perm_B_6_0,
      Column::poseidon2_perm_B_6_1,
      Column::poseidon2_perm_B_6_2,
      Column::poseidon2_perm_B_6_3 },
    { Column::poseidon2_perm_B_7_0,
      Column::poseidon2_perm_B_7_1,
      Column::poseidon2_perm_B_7_2,
      Column::poseidon2_perm_B_7_3 },
    { Column::poseidon2_perm_B_8_0,
      Column::poseidon2_perm_B_8_1,
      Column::poseidon2_perm_B_8_2,
      Column::poseidon2_perm_B_8_3 },
    { Column::poseidon2_perm_B_9_0,
      Column::poseidon2_perm_B_9_1,
      Column::poseidon2_perm_B_9_2,
      Column::poseidon2_perm_B_9_3 },
    { Column::poseidon2_perm_B_10_0,
      Column::poseidon2_perm_B_10_1,
      Column::poseidon2_perm_B_10_2,
      Column::poseidon2_perm_B_10_3 },
    { Column::poseidon2_perm_B_11_0,
      Column::poseidon2_perm_B_11_1,
      Column::poseidon2_perm_B_11_2,
      Column::poseidon2_perm_B_11_3 },
    { Column::poseidon2_perm_B_12_0,
      Column::poseidon2_perm_B_12_1,
      Column::poseidon2_perm_B_12_2,
      Column::poseidon2_perm_B_12_3 },
    { Column::poseidon2_perm_B_13_0,
      Column::poseidon2_perm_B_13_1,
      Column::poseidon2_perm_B_13_2,
      Column::poseidon2_perm_B_13_3 },
    { Column::poseidon2_perm_B_14_0,
      Column::poseidon2_perm_B_14_1,
      Column::poseidon2_perm_B_14_2,
      Column::poseidon2_perm_B_14_3 },
    { Column::poseidon2_perm_B_15_0,
      Column::poseidon2_perm_B_15_1,
      Column::poseidon2_perm_B_15_2,
      Column::poseidon2_perm_B_15_3 },
    { Column::poseidon2_perm_B_16_0,
      Column::poseidon2_perm_B_16_1,
      Column::poseidon2_perm_B_16_2,
      Column::poseidon2_perm_B_16_3 },
    { Column::poseidon2_perm_B_17_0,
      Column::poseidon2_perm_B_17_1,
      Column::poseidon2_perm_B_17_2,
      Column::poseidon2_perm_B_17_3 },
    { Column::poseidon2_perm_B_18_0,
      Column::poseidon2_perm_B_18_1,
      Column::poseidon2_perm_B_18_2,
      Column::poseidon2_perm_B_18_3 },
    { Column::poseidon2_perm_B_19_0,
      Column::poseidon2_perm_B_19_1,
      Column::poseidon2_perm_B_19_2,
      Column::poseidon2_perm_B_19_3 },
    { Column::poseidon2_perm_B_20_0,
      Column::poseidon2_perm_B_20_1,
      Column::poseidon2_perm_B_20_2,
      Column::poseidon2_perm_B_20_3 },
    { Column::poseidon2_perm_B_21_0,
      Column::poseidon2_perm_B_21_1,
      Column::poseidon2_perm_B_21_2,
      Column::poseidon2_perm_B_21_3 },
    { Column::poseidon2_perm_B_22_0,
      Column::poseidon2_perm_B_22_1,
      Column::poseidon2_perm_B_22_2,
      Column::poseidon2_perm_B_22_3 },
    { Column::poseidon2_perm_B_23_0,
      Column::poseidon2_perm_B_23_1,
      Column::poseidon2_perm_B_23_2,
      Column::poseidon2_perm_B_23_3 },
    { Column::poseidon2_perm_B_24_0,
      Column::poseidon2_perm_B_24_1,
      Column::poseidon2_perm_B_24_2,
      Column::poseidon2_perm_B_24_3 },
    { Column::poseidon2_perm_B_25_0,
      Column::poseidon2_perm_B_25_1,
      Column::poseidon2_perm_B_25_2,
      Column::poseidon2_perm_B_25_3 },
    { Column::poseidon2_perm_B_26_0,
      Column::poseidon2_perm_B_26_1,
      Column::poseidon2_perm_B_26_2,
      Column::poseidon2_perm_B_26_3 },
    { Column::poseidon2_perm_B_27_0,
      Column::poseidon2_perm_B_27_1,
      Column::poseidon2_perm_B_27_2,
      Column::poseidon2_perm_B_27_3 },
    { Column::poseidon2_perm_B_28_0,
      Column::poseidon2_perm_B_28_1,
      Column::poseidon2_perm_B_28_2,
      Column::poseidon2_perm_B_28_3 },
    { Column::poseidon2_perm_B_29_0,
      Column::poseidon2_perm_B_29_1,
      Column::poseidon2_perm_B_29_2,
      Column::poseidon2_perm_B_29_3 },
    { Column::poseidon2_perm_B_30_0,
      Column::poseidon2_perm_B_30_1,
      Column::poseidon2_perm_B_30_2,
      Column::poseidon2_perm_B_30_3 },
    { Column::poseidon2_perm_B_31_0,
      Column::poseidon2_perm_B_31_1,
      Column::poseidon2_perm_B_31_2,
      Column::poseidon2_perm_B_31_3 },
    { Column::poseidon2_perm_B_32_0,
      Column::poseidon2_perm_B_32_1,
      Column::poseidon2_perm_B_32_2,
      Column::poseidon2_perm_B_32_3 },
    { Column::poseidon2_perm_B_33_0,
      Column::poseidon2_perm_B_33_1,
      Column::poseidon2_perm_B_33_2,
      Column::poseidon2_perm_B_33_3 },
    { Column::poseidon2_perm_B_34_0,
      Column::poseidon2_perm_B_34_1,
      Column::poseidon2_perm_B_34_2,
      Column::poseidon2_perm_B_34_3 },
    { Column::poseidon2_perm_B_35_0,
      Column::poseidon2_perm_B_35_1,
      Column::poseidon2_perm_B_35_2,
      Column::poseidon2_perm_B_35_3 },
    { Column::poseidon2_perm_B_36_0,
      Column::poseidon2_perm_B_36_1,
      Column::poseidon2_perm_B_36_2,
      Column::poseidon2_perm_B_36_3 },
    { Column::poseidon2_perm_B_37_0,
      Column::poseidon2_perm_B_37_1,
      Column::poseidon2_perm_B_37_2,
      Column::poseidon2_perm_B_37_3 },
    { Column::poseidon2_perm_B_38_0,
      Column::poseidon2_perm_B_38_1,
      Column::poseidon2_perm_B_38_2,
      Column::poseidon2_perm_B_38_3 },
    { Column::poseidon2_perm_B_39_0,
      Column::poseidon2_perm_B_39_1,
      Column::poseidon2_perm_B_39_2,
      Column::poseidon2_perm_B_39_3 },
    { Column::poseidon2_perm_B_40_0,
      Column::poseidon2_perm_B_40_1,
      Column::poseidon2_perm_B_40_2,
      Column::poseidon2_perm_B_40_3 },
    { Column::poseidon2_perm_B_41_0,
      Column::poseidon2_perm_B_41_1,
      Column::poseidon2_perm_B_41_2,
      Column::poseidon2_perm_B_41_3 },
    { Column::poseidon2_perm_B_42_0,
      Column::poseidon2_perm_B_42_1,
      Column::poseidon2_perm_B_42_2,
      Column::poseidon2_perm_B_42_3 },
    { Column::poseidon2_perm_B_43_0,
      Column::poseidon2_perm_B_43_1,
      Column::poseidon2_perm_B_43_2,
      Column::poseidon2_perm_B_43_3 },
    { Column::poseidon2_perm_B_44_0,
      Column::poseidon2_perm_B_44_1,
      Column::poseidon2_perm_B_44_2,
      Column::poseidon2_perm_B_44_3 },
    { Column::poseidon2_perm_B_45_0,
      Column::poseidon2_perm_B_45_1,
      Column::poseidon2_perm_B_45_2,
      Column::poseidon2_perm_B_45_3 },
    { Column::poseidon2_perm_B_46_0,
      Column::poseidon2_perm_B_46_1,
      Column::poseidon2_perm_B_46_2,
      Column::poseidon2_perm_B_46_3 },
    { Column::poseidon2_perm_B_47_0,
      Column::poseidon2_perm_B_47_1,
      Column::poseidon2_perm_B_47_2,
      Column::poseidon2_perm_B_47_3 },
    { Column::poseidon2_perm_B_48_0,
      Column::poseidon2_perm_B_48_1,
      Column::poseidon2_perm_B_48_2,
      Column::poseidon2_perm_B_48_3 },
    { Column::poseidon2_perm_B_49_0,
      Column::poseidon2_perm_B_49_1,
      Column::poseidon2_perm_B_49_2,
      Column::poseidon2_perm_B_49_3 },
    { Column::poseidon2_perm_B_50_0,
      Column::poseidon2_perm_B_50_1,
      Column::poseidon2_perm_B_50_2,
      Column::poseidon2_perm_B_50_3 },
    { Column::poseidon2_perm_B_51_0,
      Column::poseidon2_perm_B_51_1,
      Column::poseidon2_perm_B_51_2,
      Column::poseidon2_perm_B_51_3 },
    { Column::poseidon2_perm_B_52_0,
      Column::poseidon2_perm_B_52_1,
      Column::poseidon2_perm_B_52_2,
      Column::poseidon2_perm_B_52_3 },
    { Column::poseidon2_perm_B_53_0,
      Column::poseidon2_perm_B_53_1,
      Column::poseidon2_perm_B_53_2,
      Column::poseidon2_perm_B_53_3 },
    { Column::poseidon2_perm_B_54_0,
      Column::poseidon2_perm_B_54_1,
      Column::poseidon2_perm_B_54_2,
      Column::poseidon2_perm_B_54_3 },
    { Column::poseidon2_perm_B_55_0,
      Column::poseidon2_perm_B_55_1,
      Column::poseidon2_perm_B_55_2,
      Column::poseidon2_perm_B_55_3 },
    { Column::poseidon2_perm_B_56_0,
      Column::poseidon2_perm_B_56_1,
      Column::poseidon2_perm_B_56_2,
      Column::poseidon2_perm_B_56_3 },
    { Column::poseidon2_perm_B_57_0,
      Column::poseidon2_perm_B_57_1,
      Column::poseidon2_perm_B_57_2,
      Column::poseidon2_perm_B_57_3 },
    { Column::poseidon2_perm_B_58_0,
      Column::poseidon2_perm_B_58_1,
      Column::poseidon2_perm_B_58_2,
      Column::poseidon2_perm_B_58_3 },
    { Column::poseidon2_perm_B_59_0,
      Column::poseidon2_perm_B_59_1,
      Column::poseidon2_perm_B_59_2,
      Column::poseidon2_perm_B_59_3 },
    // Full rounds
    { Column::poseidon2_perm_T_60_6,
      Column::poseidon2_perm_T_60_5,
      Column::poseidon2_perm_T_60_7,
      Column::poseidon2_perm_T_60_4 },
    { Column::poseidon2_perm_T_61_6,
      Column::poseidon2_perm_T_61_5,
      Column::poseidon2_perm_T_61_7,
      Column::poseidon2_perm_T_61_4 },
    { Column::poseidon2_perm_T_62_6,
      Column::poseidon2_perm_T_62_5,
      Column::poseidon2_perm_T_62_7,
      Column::poseidon2_perm_T_62_4 },
    { Column::poseidon2_perm_T_63_6,
      Column::poseidon2_perm_T_63_5,
      Column::poseidon2_perm_T_63_7,
      Column::poseidon2_perm_T_63_4 },
} };

} // namespace

void Poseidon2TraceBuilder::process_hash(
    const simulation::EventEmitterInterface<simulation::Poseidon2HashEvent>::Container& hash_events,
    TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : hash_events) {
        auto input_size = event.inputs.size();
        auto num_perm_events = (input_size / 3) + static_cast<size_t>(input_size % 3 != 0);
        auto padded_size = 3 * ((event.inputs.size() + 2) / 3);

        for (size_t i = 0; i < num_perm_events; i++) {
            std::array<FF, 3> perm_input = { 0, 0, 0 };
            auto perm_state = event.intermediate_states[i];
            auto perm_output = event.intermediate_states[i + 1];
            size_t chunk_size = std::min(input_size, static_cast<size_t>(3));
            // Mix the input chunk into the previous permutation output state
            for (size_t j = 0; j < chunk_size; j++) {
                // Build up the input for the permutation
                perm_input[j] = event.inputs[(i * 3) + j];
                // Mix the input chunk into the previous permutation output state
                perm_state[j] += perm_input[j];
            }
            trace.set(row,
                      { {
                          { C::poseidon2_hash_sel, 1 },
                          { C::poseidon2_hash_start, i == 0 },
                          { C::poseidon2_hash_end, (num_perm_events - 1) == i },
                          { C::poseidon2_hash_input_len, event.inputs.size() },
                          { C::poseidon2_hash_padding, padded_size - event.inputs.size() },
                          { C::poseidon2_hash_input_0, perm_input[0] },
                          { C::poseidon2_hash_input_1, perm_input[1] },
                          { C::poseidon2_hash_input_2, perm_input[2] },

                          { C::poseidon2_hash_num_perm_rounds_rem, num_perm_events - i },
                          { C::poseidon2_hash_num_perm_rounds_rem_inv,
                            num_perm_events - i - 1 == 0 ? 0 : FF(num_perm_events - i - 1).invert() },

                          { C::poseidon2_hash_a_0, perm_state[0] },
                          { C::poseidon2_hash_a_1, perm_state[1] },
                          { C::poseidon2_hash_a_2, perm_state[2] },
                          { C::poseidon2_hash_a_3, perm_state[3] },

                          { C::poseidon2_hash_b_0, perm_output[0] },
                          { C::poseidon2_hash_b_1, perm_output[1] },
                          { C::poseidon2_hash_b_2, perm_output[2] },
                          { C::poseidon2_hash_b_3, perm_output[3] },
                          { C::poseidon2_hash_output, event.output },
                      } });
            input_size -= chunk_size;
            row++;
        }
    }
}

void Poseidon2TraceBuilder::process_permutation(
    const simulation::EventEmitterInterface<simulation::Poseidon2PermutationEvent>::Container& perm_events,
    TraceContainer& trace)
{
    using C = Column;
    // Our current state
    std::array<FF, 4> current_state;
    // These are where we will store the intermediate values of current_state in the trace.
    std::array<Column, 4> round_state_cols;

    uint32_t row = 0;

    for (const auto& event : perm_events) {
        // The bulk of this code is a copy of the Poseidon2Permutation::permute function from bb
        // Note that the functions mutate current_state in place.
        current_state = event.input;

        // Apply 1st linear layer
        Poseidon2Perm::matrix_multiplication_external(current_state);
        trace.set(row,
                  { {
                      { C::poseidon2_perm_sel, 1 },
                      { C::poseidon2_perm_a_0, event.input[0] },
                      { C::poseidon2_perm_a_1, event.input[1] },
                      { C::poseidon2_perm_a_2, event.input[2] },
                      { C::poseidon2_perm_a_3, event.input[3] },

                      { C::poseidon2_perm_EXT_LAYER_6, current_state[0] },
                      { C::poseidon2_perm_EXT_LAYER_5, current_state[1] },
                      { C::poseidon2_perm_EXT_LAYER_7, current_state[2] },
                      { C::poseidon2_perm_EXT_LAYER_4, current_state[3] },

                  } });

        // Perform rounds of the permutation algorithm
        // Initial external (full) rounds
        constexpr size_t rounds_f_beginning = Poseidon2Perm::rounds_f / 2;
        for (size_t i = 0; i < rounds_f_beginning; ++i) {
            Poseidon2Perm::add_round_constants(current_state, Poseidon2Perm::round_constants[i]);
            Poseidon2Perm::apply_sbox(current_state);
            Poseidon2Perm::matrix_multiplication_external(current_state);
            // Store end of round state
            round_state_cols = intermediate_round_cols[i];
            trace.set(row,
                      { { { round_state_cols[0], current_state[0] },
                          { round_state_cols[1], current_state[1] },
                          { round_state_cols[2], current_state[2] },
                          { round_state_cols[3], current_state[3] } } });
        }

        // Internal (partial) rounds
        const size_t p_end = rounds_f_beginning + Poseidon2Perm::rounds_p;
        for (size_t i = rounds_f_beginning; i < p_end; ++i) {
            current_state[0] += Poseidon2Perm::round_constants[i][0];
            Poseidon2Perm::apply_single_sbox(current_state[0]);
            Poseidon2Perm::matrix_multiplication_internal(current_state);
            // Store end of round state
            round_state_cols = intermediate_round_cols[i];
            trace.set(row,
                      { { { round_state_cols[0], current_state[0] },
                          { round_state_cols[1], current_state[1] },
                          { round_state_cols[2], current_state[2] },
                          { round_state_cols[3], current_state[3] } } });
        }

        // Remaining external (full) rounds
        for (size_t i = p_end; i < Poseidon2Perm::NUM_ROUNDS; ++i) {
            Poseidon2Perm::add_round_constants(current_state, Poseidon2Perm::round_constants[i]);
            Poseidon2Perm::apply_sbox(current_state);
            Poseidon2Perm::matrix_multiplication_external(current_state);
            round_state_cols = intermediate_round_cols[i];
            trace.set(row,
                      { { { round_state_cols[0], current_state[0] },
                          { round_state_cols[1], current_state[1] },
                          { round_state_cols[2], current_state[2] },
                          { round_state_cols[3], current_state[3] } } });
        }
        // Set the output
        trace.set(row,
                  { {
                      { C::poseidon2_perm_b_0, current_state[0] },
                      { C::poseidon2_perm_b_1, current_state[1] },
                      { C::poseidon2_perm_b_2, current_state[2] },
                      { C::poseidon2_perm_b_3, current_state[3] },

                  } });
        row++;
    }
}

const InteractionDefinition Poseidon2TraceBuilder::interactions =
    InteractionDefinition().add<lookup_poseidon2_hash_poseidon2_perm_settings, InteractionType::LookupSequential>();

} // namespace bb::avm2::tracegen
