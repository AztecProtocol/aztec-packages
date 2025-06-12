#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <ranges>
#include <stdexcept>
#include <vector>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_decomposition.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_hashing.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_retrieval.hpp"
#include "barretenberg/vm2/generated/relations/lookups_instr_fetching.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"

using Poseidon2 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

namespace bb::avm2::tracegen {

void BytecodeTraceBuilder::process_decomposition(
    const simulation::EventEmitterInterface<simulation::BytecodeDecompositionEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    // We start from row 1 because we need a row of zeroes for the shifts.
    uint32_t row = 1;

    for (const auto& event : events) {
        const auto& bytecode = *event.bytecode;
        const auto id = event.bytecode_id;
        auto bytecode_at = [&bytecode](size_t i) -> uint8_t { return i < bytecode.size() ? bytecode[i] : 0; };
        const uint32_t bytecode_len = static_cast<uint32_t>(bytecode.size());

        for (uint32_t i = 0; i < bytecode_len; i++) {
            const uint32_t remaining = bytecode_len - i;
            const uint32_t bytes_to_read = std::min(remaining, DECOMPOSE_WINDOW_SIZE);
            const uint32_t abs_diff = DECOMPOSE_WINDOW_SIZE > remaining ? DECOMPOSE_WINDOW_SIZE - remaining
                                                                        : remaining - DECOMPOSE_WINDOW_SIZE;
            const bool is_last = remaining == 1;

            // We set the decomposition in bytes, and other values.
            trace.set(
                row + i,
                { {
                    { C::bc_decomposition_sel, 1 },
                    { C::bc_decomposition_id, id },
                    { C::bc_decomposition_pc, i },
                    { C::bc_decomposition_last_of_contract, is_last ? 1 : 0 },
                    { C::bc_decomposition_bytes_remaining, remaining },
                    { C::bc_decomposition_bytes_rem_inv, FF(remaining).invert() }, // remaining != 0 for activated rows
                    { C::bc_decomposition_bytes_rem_min_one_inv, is_last ? 0 : FF(remaining - 1).invert() },
                    { C::bc_decomposition_abs_diff, abs_diff },
                    { C::bc_decomposition_bytes_to_read, bytes_to_read },
                    { C::bc_decomposition_sel_overflow_correction_needed, remaining < DECOMPOSE_WINDOW_SIZE ? 1 : 0 },
                    // Sliding window.
                    { C::bc_decomposition_bytes, bytecode_at(i) },
                    { C::bc_decomposition_bytes_pc_plus_1, bytecode_at(i + 1) },
                    { C::bc_decomposition_bytes_pc_plus_2, bytecode_at(i + 2) },
                    { C::bc_decomposition_bytes_pc_plus_3, bytecode_at(i + 3) },
                    { C::bc_decomposition_bytes_pc_plus_4, bytecode_at(i + 4) },
                    { C::bc_decomposition_bytes_pc_plus_5, bytecode_at(i + 5) },
                    { C::bc_decomposition_bytes_pc_plus_6, bytecode_at(i + 6) },
                    { C::bc_decomposition_bytes_pc_plus_7, bytecode_at(i + 7) },
                    { C::bc_decomposition_bytes_pc_plus_8, bytecode_at(i + 8) },
                    { C::bc_decomposition_bytes_pc_plus_9, bytecode_at(i + 9) },
                    { C::bc_decomposition_bytes_pc_plus_10, bytecode_at(i + 10) },
                    { C::bc_decomposition_bytes_pc_plus_11, bytecode_at(i + 11) },
                    { C::bc_decomposition_bytes_pc_plus_12, bytecode_at(i + 12) },
                    { C::bc_decomposition_bytes_pc_plus_13, bytecode_at(i + 13) },
                    { C::bc_decomposition_bytes_pc_plus_14, bytecode_at(i + 14) },
                    { C::bc_decomposition_bytes_pc_plus_15, bytecode_at(i + 15) },
                    { C::bc_decomposition_bytes_pc_plus_16, bytecode_at(i + 16) },
                    { C::bc_decomposition_bytes_pc_plus_17, bytecode_at(i + 17) },
                    { C::bc_decomposition_bytes_pc_plus_18, bytecode_at(i + 18) },
                    { C::bc_decomposition_bytes_pc_plus_19, bytecode_at(i + 19) },
                    { C::bc_decomposition_bytes_pc_plus_20, bytecode_at(i + 20) },
                    { C::bc_decomposition_bytes_pc_plus_21, bytecode_at(i + 21) },
                    { C::bc_decomposition_bytes_pc_plus_22, bytecode_at(i + 22) },
                    { C::bc_decomposition_bytes_pc_plus_23, bytecode_at(i + 23) },
                    { C::bc_decomposition_bytes_pc_plus_24, bytecode_at(i + 24) },
                    { C::bc_decomposition_bytes_pc_plus_25, bytecode_at(i + 25) },
                    { C::bc_decomposition_bytes_pc_plus_26, bytecode_at(i + 26) },
                    { C::bc_decomposition_bytes_pc_plus_27, bytecode_at(i + 27) },
                    { C::bc_decomposition_bytes_pc_plus_28, bytecode_at(i + 28) },
                    { C::bc_decomposition_bytes_pc_plus_29, bytecode_at(i + 29) },
                    { C::bc_decomposition_bytes_pc_plus_30, bytecode_at(i + 30) },
                    { C::bc_decomposition_bytes_pc_plus_31, bytecode_at(i + 31) },
                    { C::bc_decomposition_bytes_pc_plus_32, bytecode_at(i + 32) },
                    { C::bc_decomposition_bytes_pc_plus_33, bytecode_at(i + 33) },
                    { C::bc_decomposition_bytes_pc_plus_34, bytecode_at(i + 34) },
                    { C::bc_decomposition_bytes_pc_plus_35, bytecode_at(i + 35) },
                    { C::bc_decomposition_bytes_pc_plus_36, bytecode_at(i + 36) },
                } });
        }

        // We set the packed field every 31 bytes.
        auto bytecode_field_at = [&](size_t i) -> FF {
            // We need to read uint256_ts because reading FFs messes up the order of the bytes.
            uint256_t as_int = 0;
            if (bytecode_len - i >= 32) {
                as_int = from_buffer<uint256_t>(bytecode, i);
            } else {
                std::vector<uint8_t> tail(bytecode.begin() + static_cast<ssize_t>(i), bytecode.end());
                tail.resize(32, 0);
                as_int = from_buffer<uint256_t>(tail, 0);
            }
            return as_int >> 8;
        };
        for (uint32_t i = 0; i < bytecode_len; i += 31) {
            trace.set(row + i,
                      { {
                          { C::bc_decomposition_sel_packed, 1 },
                          { C::bc_decomposition_packed_field, bytecode_field_at(i) },
                      } });
        }

        // We advance to the next bytecode.
        row += bytecode_len;
    }
}

void BytecodeTraceBuilder::process_hashing(
    const simulation::EventEmitterInterface<simulation::BytecodeHashingEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1;

    for (const auto& event : events) {
        const auto id = event.bytecode_id;
        const auto& fields = event.bytecode_fields;

        uint32_t pc_index = 0;
        FF incremental_hash = event.bytecode_length;
        for (uint32_t i = 0; i < fields.size(); i++) {
            FF output_hash = Poseidon2::hash({ fields[i], incremental_hash });
            bool end_of_bytecode = i == fields.size() - 1;
            trace.set(row,
                      { { { C::bc_hashing_sel, 1 },
                          { C::bc_hashing_start, i == 0 ? 1 : 0 },
                          { C::bc_hashing_latch, end_of_bytecode },
                          { C::bc_hashing_bytecode_id, id },
                          { C::bc_hashing_pc_index, pc_index },
                          { C::bc_hashing_packed_field, fields[i] },
                          { C::bc_hashing_incremental_hash, incremental_hash },
                          { C::bc_hashing_output_hash, output_hash } } });
            incremental_hash = output_hash;
            pc_index += 31;
            row++;
        }
    }
}

void BytecodeTraceBuilder::process_retrieval(
    const simulation::EventEmitterInterface<simulation::BytecodeRetrievalEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        trace.set(
            row,
            { { { C::bc_retrieval_sel, 1 },
                { C::bc_retrieval_bytecode_id, event.bytecode_id },
                { C::bc_retrieval_address, event.address },
                // TODO: handle errors.
                // { C::bc_retrieval_error, event.error },
                // Contract instance.
                { C::bc_retrieval_salt, event.contract_instance.salt },
                { C::bc_retrieval_deployer_addr, event.contract_instance.deployer_addr },
                { C::bc_retrieval_current_class_id, event.contract_instance.current_class_id },
                { C::bc_retrieval_original_class_id, event.contract_instance.original_class_id },
                { C::bc_retrieval_init_hash, event.contract_instance.initialisation_hash },
                { C::bc_retrieval_nullifier_key_x, event.contract_instance.public_keys.nullifier_key.x },
                { C::bc_retrieval_nullifier_key_y, event.contract_instance.public_keys.nullifier_key.y },
                { C::bc_retrieval_incoming_viewing_key_x, event.contract_instance.public_keys.incoming_viewing_key.x },
                { C::bc_retrieval_incoming_viewing_key_y, event.contract_instance.public_keys.incoming_viewing_key.y },
                { C::bc_retrieval_outgoing_viewing_key_x, event.contract_instance.public_keys.outgoing_viewing_key.x },
                { C::bc_retrieval_outgoing_viewing_key_y, event.contract_instance.public_keys.outgoing_viewing_key.y },
                { C::bc_retrieval_tagging_key_x, event.contract_instance.public_keys.tagging_key.x },
                { C::bc_retrieval_tagging_key_y, event.contract_instance.public_keys.tagging_key.y },
                // Contract class.
                { C::bc_retrieval_artifact_hash, event.contract_class.artifact_hash },
                { C::bc_retrieval_private_function_root, event.contract_class.private_function_root },
                { C::bc_retrieval_public_bytecode_commitment, event.contract_class.public_bytecode_commitment },
                // State.
                { C::bc_retrieval_block_number, event.current_block_number },
                { C::bc_retrieval_public_data_tree_root, event.public_data_tree_root },
                { C::bc_retrieval_nullifier_tree_root, event.nullifier_root },
                // Siloing.
                { C::bc_retrieval_outer_nullifier_domain_separator, GENERATOR_INDEX__OUTER_NULLIFIER },
                { C::bc_retrieval_deployer_protocol_contract_address, DEPLOYER_CONTRACT_ADDRESS },
                { C::bc_retrieval_siloed_address, event.siloed_address },
                { C::bc_retrieval_nullifier_exists, true } } });
        row++;
    }
}

void BytecodeTraceBuilder::process_instruction_fetching(
    const simulation::EventEmitterInterface<simulation::InstructionFetchingEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;
    using simulation::BytecodeId;
    using simulation::InstructionFetchingEvent;
    using simulation::InstrDeserializationError::INSTRUCTION_OUT_OF_RANGE;
    using simulation::InstrDeserializationError::OPCODE_OUT_OF_RANGE;
    using simulation::InstrDeserializationError::PC_OUT_OF_RANGE;
    using simulation::InstrDeserializationError::TAG_OUT_OF_RANGE;

    // We start from row 1 because we need a row of zeroes for the shifts.
    uint32_t row = 1;

    for (const auto& event : events) {
        const auto bytecode_id = event.bytecode_id;
        const auto bytecode_size = event.bytecode->size();

        auto get_operand = [&](size_t i) -> FF {
            return i < event.instruction.operands.size() ? static_cast<FF>(event.instruction.operands[i]) : 0;
        };
        auto bytecode_at = [&](size_t i) -> uint8_t { return i < bytecode_size ? (*event.bytecode)[i] : 0; };

        const uint8_t wire_opcode = bytecode_at(event.pc);
        const bool wire_opcode_in_range =
            event.error != PC_OUT_OF_RANGE && wire_opcode < static_cast<uint8_t>(WireOpCode::LAST_OPCODE_SENTINEL);

        uint32_t size_in_bytes = 0;
        ExecutionOpCode exec_opcode = static_cast<ExecutionOpCode>(0);
        std::array<uint8_t, NUM_OP_DC_SELECTORS> op_dc_selectors{};
        uint8_t has_tag = 0;
        uint8_t tag_is_op2 = 0;
        uint8_t tag_value = 0;

        if (wire_opcode_in_range) {
            const auto& wire_instr_spec = WIRE_INSTRUCTION_SPEC.at(static_cast<WireOpCode>(wire_opcode));
            size_in_bytes = wire_instr_spec.size_in_bytes;
            exec_opcode = wire_instr_spec.exec_opcode;
            op_dc_selectors = wire_instr_spec.op_dc_selectors;

            if (wire_instr_spec.tag_operand_idx.has_value()) {
                const auto tag_value_idx = wire_instr_spec.tag_operand_idx.value();
                assert((tag_value_idx == 2 || tag_value_idx == 3) &&
                       "Current constraints support only tag for operand index equal to 2 or 3");
                has_tag = 1;

                if (tag_value_idx == 2) {
                    tag_is_op2 = 1;
                    tag_value = static_cast<uint8_t>(get_operand(1)); // in instruction.operands, op2 has index 1
                } else {
                    tag_value = static_cast<uint8_t>(get_operand(2));
                }
            }
        }

        const uint32_t bytes_remaining =
            event.error == PC_OUT_OF_RANGE ? 0 : static_cast<uint32_t>(bytecode_size - event.pc);
        const uint32_t bytes_to_read = std::min(bytes_remaining, DECOMPOSE_WINDOW_SIZE);

        uint32_t instr_abs_diff = 0;
        if (size_in_bytes <= bytes_to_read) {
            instr_abs_diff = bytes_to_read - size_in_bytes;
        } else {
            instr_abs_diff = size_in_bytes - bytes_to_read - 1;
        }

        uint32_t bytecode_size_u32 = static_cast<uint32_t>(bytecode_size);
        uint32_t pc_abs_diff =
            bytecode_size_u32 > event.pc ? bytecode_size_u32 - event.pc - 1 : event.pc - bytecode_size_u32;

        trace.set(row,
                  { {
                      { C::instr_fetching_sel, 1 },
                      { C::instr_fetching_bytecode_id, bytecode_id },
                      { C::instr_fetching_pc, event.pc },
                      // indirect + operands.
                      { C::instr_fetching_indirect, event.instruction.indirect },
                      { C::instr_fetching_op1, get_operand(0) },
                      { C::instr_fetching_op2, get_operand(1) },
                      { C::instr_fetching_op3, get_operand(2) },
                      { C::instr_fetching_op4, get_operand(3) },
                      { C::instr_fetching_op5, get_operand(4) },
                      { C::instr_fetching_op6, get_operand(5) },
                      { C::instr_fetching_op7, get_operand(6) },
                      // Single bytes.
                      { C::instr_fetching_bd0, wire_opcode },
                      { C::instr_fetching_bd1, bytecode_at(event.pc + 1) },
                      { C::instr_fetching_bd2, bytecode_at(event.pc + 2) },
                      { C::instr_fetching_bd3, bytecode_at(event.pc + 3) },
                      { C::instr_fetching_bd4, bytecode_at(event.pc + 4) },
                      { C::instr_fetching_bd5, bytecode_at(event.pc + 5) },
                      { C::instr_fetching_bd6, bytecode_at(event.pc + 6) },
                      { C::instr_fetching_bd7, bytecode_at(event.pc + 7) },
                      { C::instr_fetching_bd8, bytecode_at(event.pc + 8) },
                      { C::instr_fetching_bd9, bytecode_at(event.pc + 9) },
                      { C::instr_fetching_bd10, bytecode_at(event.pc + 10) },
                      { C::instr_fetching_bd11, bytecode_at(event.pc + 11) },
                      { C::instr_fetching_bd12, bytecode_at(event.pc + 12) },
                      { C::instr_fetching_bd13, bytecode_at(event.pc + 13) },
                      { C::instr_fetching_bd14, bytecode_at(event.pc + 14) },
                      { C::instr_fetching_bd15, bytecode_at(event.pc + 15) },
                      { C::instr_fetching_bd16, bytecode_at(event.pc + 16) },
                      { C::instr_fetching_bd17, bytecode_at(event.pc + 17) },
                      { C::instr_fetching_bd18, bytecode_at(event.pc + 18) },
                      { C::instr_fetching_bd19, bytecode_at(event.pc + 19) },
                      { C::instr_fetching_bd20, bytecode_at(event.pc + 20) },
                      { C::instr_fetching_bd21, bytecode_at(event.pc + 21) },
                      { C::instr_fetching_bd22, bytecode_at(event.pc + 22) },
                      { C::instr_fetching_bd23, bytecode_at(event.pc + 23) },
                      { C::instr_fetching_bd24, bytecode_at(event.pc + 24) },
                      { C::instr_fetching_bd25, bytecode_at(event.pc + 25) },
                      { C::instr_fetching_bd26, bytecode_at(event.pc + 26) },
                      { C::instr_fetching_bd27, bytecode_at(event.pc + 27) },
                      { C::instr_fetching_bd28, bytecode_at(event.pc + 28) },
                      { C::instr_fetching_bd29, bytecode_at(event.pc + 29) },
                      { C::instr_fetching_bd30, bytecode_at(event.pc + 30) },
                      { C::instr_fetching_bd31, bytecode_at(event.pc + 31) },
                      { C::instr_fetching_bd32, bytecode_at(event.pc + 32) },
                      { C::instr_fetching_bd33, bytecode_at(event.pc + 33) },
                      { C::instr_fetching_bd34, bytecode_at(event.pc + 34) },
                      { C::instr_fetching_bd35, bytecode_at(event.pc + 35) },
                      { C::instr_fetching_bd36, bytecode_at(event.pc + 36) },

                      // From instruction table.
                      { C::instr_fetching_exec_opcode, static_cast<uint32_t>(exec_opcode) },
                      { C::instr_fetching_instr_size, size_in_bytes },
                      { C::instr_fetching_sel_has_tag, has_tag },
                      { C::instr_fetching_sel_tag_is_op2, tag_is_op2 },

                      // Fill operand decomposition selectors
                      { C::instr_fetching_sel_op_dc_0, op_dc_selectors.at(0) },
                      { C::instr_fetching_sel_op_dc_1, op_dc_selectors.at(1) },
                      { C::instr_fetching_sel_op_dc_2, op_dc_selectors.at(2) },
                      { C::instr_fetching_sel_op_dc_3, op_dc_selectors.at(3) },
                      { C::instr_fetching_sel_op_dc_4, op_dc_selectors.at(4) },
                      { C::instr_fetching_sel_op_dc_5, op_dc_selectors.at(5) },
                      { C::instr_fetching_sel_op_dc_6, op_dc_selectors.at(6) },
                      { C::instr_fetching_sel_op_dc_7, op_dc_selectors.at(7) },
                      { C::instr_fetching_sel_op_dc_8, op_dc_selectors.at(8) },
                      { C::instr_fetching_sel_op_dc_9, op_dc_selectors.at(9) },
                      { C::instr_fetching_sel_op_dc_10, op_dc_selectors.at(10) },
                      { C::instr_fetching_sel_op_dc_11, op_dc_selectors.at(11) },
                      { C::instr_fetching_sel_op_dc_12, op_dc_selectors.at(12) },
                      { C::instr_fetching_sel_op_dc_13, op_dc_selectors.at(13) },
                      { C::instr_fetching_sel_op_dc_14, op_dc_selectors.at(14) },
                      { C::instr_fetching_sel_op_dc_15, op_dc_selectors.at(15) },
                      { C::instr_fetching_sel_op_dc_16, op_dc_selectors.at(16) },

                      // Parsing errors
                      { C::instr_fetching_pc_out_of_range, event.error == PC_OUT_OF_RANGE ? 1 : 0 },
                      { C::instr_fetching_opcode_out_of_range, event.error == OPCODE_OUT_OF_RANGE ? 1 : 0 },
                      { C::instr_fetching_instr_out_of_range, event.error == INSTRUCTION_OUT_OF_RANGE ? 1 : 0 },
                      { C::instr_fetching_tag_out_of_range, event.error == TAG_OUT_OF_RANGE ? 1 : 0 },
                      { C::instr_fetching_sel_parsing_err, event.error.has_value() ? 1 : 0 },

                      // selector for lookups
                      { C::instr_fetching_sel_pc_in_range, event.error != PC_OUT_OF_RANGE ? 1 : 0 },

                      { C::instr_fetching_bytecode_size, bytecode_size },
                      { C::instr_fetching_bytes_to_read, bytes_to_read },
                      { C::instr_fetching_instr_abs_diff, instr_abs_diff },
                      { C::instr_fetching_pc_abs_diff, pc_abs_diff },
                      { C::instr_fetching_pc_size_in_bits,
                        AVM_PC_SIZE_IN_BITS }, // Remove when we support constants in lookups
                      { C::instr_fetching_tag_value, tag_value },
                  } });
        row++;
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> BytecodeTraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        // Bytecode Hashing
        std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_hashing_get_packed_field_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_hashing_iv_is_len_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_hashing_poseidon2_hash_settings>>(),
        // Bytecode Retrieval
        std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_retrieval_bytecode_hash_is_correct_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_retrieval_class_id_derivation_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_retrieval_address_derivation_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_retrieval_update_check_settings>>(),
        std::make_unique<
            LookupIntoDynamicTableSequential<lookup_bc_retrieval_silo_deployment_nullifier_poseidon2_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_bc_retrieval_deployment_nullifier_read_settings>>(),
        // Bytecode Decomposition
        std::make_unique<LookupIntoIndexedByClk<lookup_bc_decomposition_bytes_are_bytes_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_bc_decomposition_abs_diff_is_u16_settings>>(),
        // Instruction Fetching
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_instr_fetching_bytes_from_bc_dec_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_instr_fetching_bytecode_size_from_bc_dec_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_instr_fetching_wire_instruction_info_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_instr_fetching_instr_abs_diff_positive_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_instr_fetching_tag_value_validation_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_instr_fetching_pc_abs_diff_positive_settings>>());
}

} // namespace bb::avm2::tracegen
