#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_poseidon2_hash.hpp"
#include "barretenberg/vm2/generated/relations/lookups_poseidon2_mem.hpp"

using Poseidon2Perm = bb::crypto::Poseidon2Permutation<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

namespace bb::avm2::tracegen {

namespace {

using C = Column;
using StateCols = std::array<C, 4>;

// This absolute monstrosity is a mapping of the intermediate round columns (round & state) to the "flattened" columns
// in the trace.
constexpr std::array<StateCols, 64> intermediate_round_cols = { {
    // Full rounds
    { C::poseidon2_perm_T_0_6, C::poseidon2_perm_T_0_5, C::poseidon2_perm_T_0_7, C::poseidon2_perm_T_0_4 },
    { C::poseidon2_perm_T_1_6, C::poseidon2_perm_T_1_5, C::poseidon2_perm_T_1_7, C::poseidon2_perm_T_1_4 },
    { C::poseidon2_perm_T_2_6, C::poseidon2_perm_T_2_5, C::poseidon2_perm_T_2_7, C::poseidon2_perm_T_2_4 },
    { C::poseidon2_perm_T_3_6, C::poseidon2_perm_T_3_5, C::poseidon2_perm_T_3_7, C::poseidon2_perm_T_3_4 },
    // Partial rounds
    { C::poseidon2_perm_B_4_0, C::poseidon2_perm_B_4_1, C::poseidon2_perm_B_4_2, C::poseidon2_perm_B_4_3 },
    { C::poseidon2_perm_B_5_0, C::poseidon2_perm_B_5_1, C::poseidon2_perm_B_5_2, C::poseidon2_perm_B_5_3 },
    { C::poseidon2_perm_B_6_0, C::poseidon2_perm_B_6_1, C::poseidon2_perm_B_6_2, C::poseidon2_perm_B_6_3 },
    { C::poseidon2_perm_B_7_0, C::poseidon2_perm_B_7_1, C::poseidon2_perm_B_7_2, C::poseidon2_perm_B_7_3 },
    { C::poseidon2_perm_B_8_0, C::poseidon2_perm_B_8_1, C::poseidon2_perm_B_8_2, C::poseidon2_perm_B_8_3 },
    { C::poseidon2_perm_B_9_0, C::poseidon2_perm_B_9_1, C::poseidon2_perm_B_9_2, C::poseidon2_perm_B_9_3 },
    { C::poseidon2_perm_B_10_0, C::poseidon2_perm_B_10_1, C::poseidon2_perm_B_10_2, C::poseidon2_perm_B_10_3 },
    { C::poseidon2_perm_B_11_0, C::poseidon2_perm_B_11_1, C::poseidon2_perm_B_11_2, C::poseidon2_perm_B_11_3 },
    { C::poseidon2_perm_B_12_0, C::poseidon2_perm_B_12_1, C::poseidon2_perm_B_12_2, C::poseidon2_perm_B_12_3 },
    { C::poseidon2_perm_B_13_0, C::poseidon2_perm_B_13_1, C::poseidon2_perm_B_13_2, C::poseidon2_perm_B_13_3 },
    { C::poseidon2_perm_B_14_0, C::poseidon2_perm_B_14_1, C::poseidon2_perm_B_14_2, C::poseidon2_perm_B_14_3 },
    { C::poseidon2_perm_B_15_0, C::poseidon2_perm_B_15_1, C::poseidon2_perm_B_15_2, C::poseidon2_perm_B_15_3 },
    { C::poseidon2_perm_B_16_0, C::poseidon2_perm_B_16_1, C::poseidon2_perm_B_16_2, C::poseidon2_perm_B_16_3 },
    { C::poseidon2_perm_B_17_0, C::poseidon2_perm_B_17_1, C::poseidon2_perm_B_17_2, C::poseidon2_perm_B_17_3 },
    { C::poseidon2_perm_B_18_0, C::poseidon2_perm_B_18_1, C::poseidon2_perm_B_18_2, C::poseidon2_perm_B_18_3 },
    { C::poseidon2_perm_B_19_0, C::poseidon2_perm_B_19_1, C::poseidon2_perm_B_19_2, C::poseidon2_perm_B_19_3 },
    { C::poseidon2_perm_B_20_0, C::poseidon2_perm_B_20_1, C::poseidon2_perm_B_20_2, C::poseidon2_perm_B_20_3 },
    { C::poseidon2_perm_B_21_0, C::poseidon2_perm_B_21_1, C::poseidon2_perm_B_21_2, C::poseidon2_perm_B_21_3 },
    { C::poseidon2_perm_B_22_0, C::poseidon2_perm_B_22_1, C::poseidon2_perm_B_22_2, C::poseidon2_perm_B_22_3 },
    { C::poseidon2_perm_B_23_0, C::poseidon2_perm_B_23_1, C::poseidon2_perm_B_23_2, C::poseidon2_perm_B_23_3 },
    { C::poseidon2_perm_B_24_0, C::poseidon2_perm_B_24_1, C::poseidon2_perm_B_24_2, C::poseidon2_perm_B_24_3 },
    { C::poseidon2_perm_B_25_0, C::poseidon2_perm_B_25_1, C::poseidon2_perm_B_25_2, C::poseidon2_perm_B_25_3 },
    { C::poseidon2_perm_B_26_0, C::poseidon2_perm_B_26_1, C::poseidon2_perm_B_26_2, C::poseidon2_perm_B_26_3 },
    { C::poseidon2_perm_B_27_0, C::poseidon2_perm_B_27_1, C::poseidon2_perm_B_27_2, C::poseidon2_perm_B_27_3 },
    { C::poseidon2_perm_B_28_0, C::poseidon2_perm_B_28_1, C::poseidon2_perm_B_28_2, C::poseidon2_perm_B_28_3 },
    { C::poseidon2_perm_B_29_0, C::poseidon2_perm_B_29_1, C::poseidon2_perm_B_29_2, C::poseidon2_perm_B_29_3 },
    { C::poseidon2_perm_B_30_0, C::poseidon2_perm_B_30_1, C::poseidon2_perm_B_30_2, C::poseidon2_perm_B_30_3 },
    { C::poseidon2_perm_B_31_0, C::poseidon2_perm_B_31_1, C::poseidon2_perm_B_31_2, C::poseidon2_perm_B_31_3 },
    { C::poseidon2_perm_B_32_0, C::poseidon2_perm_B_32_1, C::poseidon2_perm_B_32_2, C::poseidon2_perm_B_32_3 },
    { C::poseidon2_perm_B_33_0, C::poseidon2_perm_B_33_1, C::poseidon2_perm_B_33_2, C::poseidon2_perm_B_33_3 },
    { C::poseidon2_perm_B_34_0, C::poseidon2_perm_B_34_1, C::poseidon2_perm_B_34_2, C::poseidon2_perm_B_34_3 },
    { C::poseidon2_perm_B_35_0, C::poseidon2_perm_B_35_1, C::poseidon2_perm_B_35_2, C::poseidon2_perm_B_35_3 },
    { C::poseidon2_perm_B_36_0, C::poseidon2_perm_B_36_1, C::poseidon2_perm_B_36_2, C::poseidon2_perm_B_36_3 },
    { C::poseidon2_perm_B_37_0, C::poseidon2_perm_B_37_1, C::poseidon2_perm_B_37_2, C::poseidon2_perm_B_37_3 },
    { C::poseidon2_perm_B_38_0, C::poseidon2_perm_B_38_1, C::poseidon2_perm_B_38_2, C::poseidon2_perm_B_38_3 },
    { C::poseidon2_perm_B_39_0, C::poseidon2_perm_B_39_1, C::poseidon2_perm_B_39_2, C::poseidon2_perm_B_39_3 },
    { C::poseidon2_perm_B_40_0, C::poseidon2_perm_B_40_1, C::poseidon2_perm_B_40_2, C::poseidon2_perm_B_40_3 },
    { C::poseidon2_perm_B_41_0, C::poseidon2_perm_B_41_1, C::poseidon2_perm_B_41_2, C::poseidon2_perm_B_41_3 },
    { C::poseidon2_perm_B_42_0, C::poseidon2_perm_B_42_1, C::poseidon2_perm_B_42_2, C::poseidon2_perm_B_42_3 },
    { C::poseidon2_perm_B_43_0, C::poseidon2_perm_B_43_1, C::poseidon2_perm_B_43_2, C::poseidon2_perm_B_43_3 },
    { C::poseidon2_perm_B_44_0, C::poseidon2_perm_B_44_1, C::poseidon2_perm_B_44_2, C::poseidon2_perm_B_44_3 },
    { C::poseidon2_perm_B_45_0, C::poseidon2_perm_B_45_1, C::poseidon2_perm_B_45_2, C::poseidon2_perm_B_45_3 },
    { C::poseidon2_perm_B_46_0, C::poseidon2_perm_B_46_1, C::poseidon2_perm_B_46_2, C::poseidon2_perm_B_46_3 },
    { C::poseidon2_perm_B_47_0, C::poseidon2_perm_B_47_1, C::poseidon2_perm_B_47_2, C::poseidon2_perm_B_47_3 },
    { C::poseidon2_perm_B_48_0, C::poseidon2_perm_B_48_1, C::poseidon2_perm_B_48_2, C::poseidon2_perm_B_48_3 },
    { C::poseidon2_perm_B_49_0, C::poseidon2_perm_B_49_1, C::poseidon2_perm_B_49_2, C::poseidon2_perm_B_49_3 },
    { C::poseidon2_perm_B_50_0, C::poseidon2_perm_B_50_1, C::poseidon2_perm_B_50_2, C::poseidon2_perm_B_50_3 },
    { C::poseidon2_perm_B_51_0, C::poseidon2_perm_B_51_1, C::poseidon2_perm_B_51_2, C::poseidon2_perm_B_51_3 },
    { C::poseidon2_perm_B_52_0, C::poseidon2_perm_B_52_1, C::poseidon2_perm_B_52_2, C::poseidon2_perm_B_52_3 },
    { C::poseidon2_perm_B_53_0, C::poseidon2_perm_B_53_1, C::poseidon2_perm_B_53_2, C::poseidon2_perm_B_53_3 },
    { C::poseidon2_perm_B_54_0, C::poseidon2_perm_B_54_1, C::poseidon2_perm_B_54_2, C::poseidon2_perm_B_54_3 },
    { C::poseidon2_perm_B_55_0, C::poseidon2_perm_B_55_1, C::poseidon2_perm_B_55_2, C::poseidon2_perm_B_55_3 },
    { C::poseidon2_perm_B_56_0, C::poseidon2_perm_B_56_1, C::poseidon2_perm_B_56_2, C::poseidon2_perm_B_56_3 },
    { C::poseidon2_perm_B_57_0, C::poseidon2_perm_B_57_1, C::poseidon2_perm_B_57_2, C::poseidon2_perm_B_57_3 },
    { C::poseidon2_perm_B_58_0, C::poseidon2_perm_B_58_1, C::poseidon2_perm_B_58_2, C::poseidon2_perm_B_58_3 },
    { C::poseidon2_perm_B_59_0, C::poseidon2_perm_B_59_1, C::poseidon2_perm_B_59_2, C::poseidon2_perm_B_59_3 },
    // Full rounds
    { C::poseidon2_perm_T_60_6, C::poseidon2_perm_T_60_5, C::poseidon2_perm_T_60_7, C::poseidon2_perm_T_60_4 },
    { C::poseidon2_perm_T_61_6, C::poseidon2_perm_T_61_5, C::poseidon2_perm_T_61_7, C::poseidon2_perm_T_61_4 },
    { C::poseidon2_perm_T_62_6, C::poseidon2_perm_T_62_5, C::poseidon2_perm_T_62_7, C::poseidon2_perm_T_62_4 },
    { C::poseidon2_perm_T_63_6, C::poseidon2_perm_T_63_5, C::poseidon2_perm_T_63_7, C::poseidon2_perm_T_63_4 },
} };

} // namespace

void Poseidon2TraceBuilder::process_hash(
    const simulation::EventEmitterInterface<simulation::Poseidon2HashEvent>::Container& hash_events,
    TraceContainer& trace)
{
    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : hash_events) {
        auto input_size = event.inputs.size(); // Will be mutated in the loop below.
        // Simulation guarantees that the number of intermediate states is 1 more than the number of permutation events.
        const auto num_perm_events = event.intermediate_states.size() - 1;
        // The padding size is the number of elements to add to the input to make it a multiple of 3.
        // We have to map the modulo 3 values of input_size: 0 -> 0, 1 -> 2, 2 -> 1 to the padding size
        // which corresponds to a multiplication by 2 modulo 3.
        const auto padding_size = (2 * input_size) % 3;

        for (size_t i = 0; i < num_perm_events; i++) {
            std::array<FF, 3> perm_input = { 0, 0, 0 };
            auto perm_state = event.intermediate_states[i];
            const auto& perm_output = event.intermediate_states[i + 1]; // In range by definition of num_perm_events.
            size_t chunk_size = std::min(input_size, static_cast<size_t>(3));
            // Mix the input chunk into the previous permutation output state
            for (size_t j = 0; j < chunk_size; j++) {
                // Build up the input for the permutation
                perm_input[j] = event.inputs[(i * 3) + j];
                // Mix the input chunk into the previous permutation output state
                perm_state[j] += perm_input[j];
            }
            trace.set(
                row,
                { {
                    { C::poseidon2_hash_sel, 1 },
                    { C::poseidon2_hash_start, i == 0 },
                    { C::poseidon2_hash_end, i == (num_perm_events - 1) },
                    { C::poseidon2_hash_input_len, event.inputs.size() }, // Cannot use input_size as mutated.
                    { C::poseidon2_hash_padding, padding_size },
                    { C::poseidon2_hash_input_0, perm_input[0] },
                    { C::poseidon2_hash_input_1, perm_input[1] },
                    { C::poseidon2_hash_input_2, perm_input[2] },

                    { C::poseidon2_hash_num_perm_rounds_rem, num_perm_events - i },
                    { C::poseidon2_hash_num_perm_rounds_rem_inv, num_perm_events - i - 1 }, // Will be batch inverted.

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

    trace.invert_columns({ { C::poseidon2_hash_num_perm_rounds_rem_inv } });
}

void Poseidon2TraceBuilder::process_permutation(
    const simulation::EventEmitterInterface<simulation::Poseidon2PermutationEvent>::Container& perm_events,
    TraceContainer& trace)
{
    // Our current state
    std::array<FF, 4> current_state;
    // These are where we will store the intermediate values of current_state in the trace.
    std::array<C, 4> round_state_cols;

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

void Poseidon2TraceBuilder::process_permutation_with_memory(
    const simulation::EventEmitterInterface<simulation::Poseidon2PermutationMemoryEvent>::Container& perm_mem_events,
    TraceContainer& trace)
{
    uint32_t row = 0;

    for (const auto& event : perm_mem_events) {
        // Addresses cast to uint64_t to capture overflows
        const uint64_t src_addr = static_cast<uint64_t>(event.src_address);
        const uint64_t dst_addr = static_cast<uint64_t>(event.dst_address);
        // Error Handling, check that the addresses are within the valid range
        // The max read address is src_addr + 3 since 4 input elements are read
        // The max write address is dst_addr + 3 since 4 output elements are written
        const bool src_out_of_range_err = src_addr + 3 > AVM_HIGHEST_MEM_ADDRESS;
        const bool dst_out_of_range_err = dst_addr + 3 > AVM_HIGHEST_MEM_ADDRESS;
        const bool should_read_mem = !(src_out_of_range_err || dst_out_of_range_err);

        // Error Handling, check that the input tags are valid
        bool invalid_tag =
            std::ranges::any_of(event.input, [](const auto& input) { return input.get_tag() != MemoryTag::FF; });

        FF batch_tag_inv = 0;

        // No need to use batch inversion because in the happy path we do not perform any field inversion.
        if (invalid_tag) {
            uint32_t target_tag = static_cast<uint32_t>(MemoryTag::FF);
            FF batched_tag_check = 0;
            // Performs the batched tag check described in the circuit.
            // see https://hackmd.io/moq6viBpRJeLpWrHAogCZw#Batching-comparison-of-n-bit-numbers
            for (uint32_t i = 0; i < event.input.size(); i++) {
                uint32_t exponent = 3 * i;
                uint32_t current_tag = static_cast<uint32_t>(event.input[i].get_tag());
                batched_tag_check += (FF(current_tag) - FF(target_tag)) * FF((1 << exponent));
            }
            batch_tag_inv = batched_tag_check.invert();
        }

        const bool err = src_out_of_range_err || dst_out_of_range_err || invalid_tag;

        trace.set(row,
                  { {
                      { C::poseidon2_perm_mem_sel, 1 },
                      { C::poseidon2_perm_mem_execution_clk, event.execution_clk },
                      { C::poseidon2_perm_mem_space_id, event.space_id },
                      { C::poseidon2_perm_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
                      // Error Handling
                      { C::poseidon2_perm_mem_sel_src_out_of_range_err, src_out_of_range_err ? 1 : 0 },
                      { C::poseidon2_perm_mem_sel_dst_out_of_range_err, dst_out_of_range_err ? 1 : 0 },
                      { C::poseidon2_perm_mem_sel_invalid_tag_err, invalid_tag ? 1 : 0 },
                      { C::poseidon2_perm_mem_batch_tag_inv, batch_tag_inv },
                      { C::poseidon2_perm_mem_err, err ? 1 : 0 },
                      // Mem Ops
                      { C::poseidon2_perm_mem_sel_should_read_mem, should_read_mem ? 1 : 0 },
                      // Read Addresses
                      { C::poseidon2_perm_mem_read_address_0_, src_addr },
                      { C::poseidon2_perm_mem_read_address_1_, src_addr + 1 },
                      { C::poseidon2_perm_mem_read_address_2_, src_addr + 2 },
                      { C::poseidon2_perm_mem_read_address_3_, src_addr + 3 },
                      // Write Addresses
                      { C::poseidon2_perm_mem_write_address_0_, dst_addr },
                      { C::poseidon2_perm_mem_write_address_1_, dst_addr + 1 },
                      { C::poseidon2_perm_mem_write_address_2_, dst_addr + 2 },
                      { C::poseidon2_perm_mem_write_address_3_, dst_addr + 3 },
                      // Inputs
                      { C::poseidon2_perm_mem_input_0_, event.input[0].as_ff() },
                      { C::poseidon2_perm_mem_input_1_, event.input[1].as_ff() },
                      { C::poseidon2_perm_mem_input_2_, event.input[2].as_ff() },
                      { C::poseidon2_perm_mem_input_3_, event.input[3].as_ff() },
                      // Input Tags
                      { C::poseidon2_perm_mem_input_tag_0_, static_cast<uint8_t>(event.input[0].get_tag()) },
                      { C::poseidon2_perm_mem_input_tag_1_, static_cast<uint8_t>(event.input[1].get_tag()) },
                      { C::poseidon2_perm_mem_input_tag_2_, static_cast<uint8_t>(event.input[2].get_tag()) },
                      { C::poseidon2_perm_mem_input_tag_3_, static_cast<uint8_t>(event.input[3].get_tag()) },
                      // Outputs
                      { C::poseidon2_perm_mem_sel_should_exec, !err ? 1 : 0 },
                      { C::poseidon2_perm_mem_output_0_, event.output[0] },
                      { C::poseidon2_perm_mem_output_1_, event.output[1] },
                      { C::poseidon2_perm_mem_output_2_, event.output[2] },
                      { C::poseidon2_perm_mem_output_3_, event.output[3] },
                  } });
        row++;
    }
}

const InteractionDefinition Poseidon2TraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_poseidon2_hash_poseidon2_perm_settings, InteractionType::LookupSequential>()
        // Poseidon2 Memory to Permutation Subtrace
        .add<lookup_poseidon2_mem_input_output_poseidon2_perm_settings, InteractionType::LookupSequential>()
        // Lookups to Greater Than Subtrace
        .add<lookup_poseidon2_mem_check_src_addr_in_range_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_poseidon2_mem_check_dst_addr_in_range_settings, InteractionType::LookupGeneric>(C::gt_sel);

} // namespace bb::avm2::tracegen
