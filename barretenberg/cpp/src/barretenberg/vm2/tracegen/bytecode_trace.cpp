#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"

namespace bb::avm2::tracegen {
namespace {

// This returns a number whose first n bits are set to 1.
uint64_t as_unary(uint32_t n)
{
    assert(n <= DECOMPOSE_WINDOW_SIZE);
    uint64_t tmp = (static_cast<uint64_t>(1) << n) - 1;
    return tmp;
}

} // namespace

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
        auto bytecode_exists_at = [&bytecode](size_t i) -> uint8_t { return i < bytecode.size() ? 1 : 0; };
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
                    { C::bc_decomposition_bytes_to_read_unary, as_unary(bytes_to_read) },
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
                    // Bytecode overflow selectors.
                    { C::bc_decomposition_sel_pc_plus_1, bytecode_exists_at(i + 1) },
                    { C::bc_decomposition_sel_pc_plus_2, bytecode_exists_at(i + 2) },
                    { C::bc_decomposition_sel_pc_plus_3, bytecode_exists_at(i + 3) },
                    { C::bc_decomposition_sel_pc_plus_4, bytecode_exists_at(i + 4) },
                    { C::bc_decomposition_sel_pc_plus_5, bytecode_exists_at(i + 5) },
                    { C::bc_decomposition_sel_pc_plus_6, bytecode_exists_at(i + 6) },
                    { C::bc_decomposition_sel_pc_plus_7, bytecode_exists_at(i + 7) },
                    { C::bc_decomposition_sel_pc_plus_8, bytecode_exists_at(i + 8) },
                    { C::bc_decomposition_sel_pc_plus_9, bytecode_exists_at(i + 9) },
                    { C::bc_decomposition_sel_pc_plus_10, bytecode_exists_at(i + 10) },
                    { C::bc_decomposition_sel_pc_plus_11, bytecode_exists_at(i + 11) },
                    { C::bc_decomposition_sel_pc_plus_12, bytecode_exists_at(i + 12) },
                    { C::bc_decomposition_sel_pc_plus_13, bytecode_exists_at(i + 13) },
                    { C::bc_decomposition_sel_pc_plus_14, bytecode_exists_at(i + 14) },
                    { C::bc_decomposition_sel_pc_plus_15, bytecode_exists_at(i + 15) },
                    { C::bc_decomposition_sel_pc_plus_16, bytecode_exists_at(i + 16) },
                    { C::bc_decomposition_sel_pc_plus_17, bytecode_exists_at(i + 17) },
                    { C::bc_decomposition_sel_pc_plus_18, bytecode_exists_at(i + 18) },
                    { C::bc_decomposition_sel_pc_plus_19, bytecode_exists_at(i + 19) },
                    { C::bc_decomposition_sel_pc_plus_20, bytecode_exists_at(i + 20) },
                    { C::bc_decomposition_sel_pc_plus_21, bytecode_exists_at(i + 21) },
                    { C::bc_decomposition_sel_pc_plus_22, bytecode_exists_at(i + 22) },
                    { C::bc_decomposition_sel_pc_plus_23, bytecode_exists_at(i + 23) },
                    { C::bc_decomposition_sel_pc_plus_24, bytecode_exists_at(i + 24) },
                    { C::bc_decomposition_sel_pc_plus_25, bytecode_exists_at(i + 25) },
                    { C::bc_decomposition_sel_pc_plus_26, bytecode_exists_at(i + 26) },
                    { C::bc_decomposition_sel_pc_plus_27, bytecode_exists_at(i + 27) },
                    { C::bc_decomposition_sel_pc_plus_28, bytecode_exists_at(i + 28) },
                    { C::bc_decomposition_sel_pc_plus_29, bytecode_exists_at(i + 29) },
                    { C::bc_decomposition_sel_pc_plus_30, bytecode_exists_at(i + 30) },
                    { C::bc_decomposition_sel_pc_plus_31, bytecode_exists_at(i + 31) },
                    { C::bc_decomposition_sel_pc_plus_32, bytecode_exists_at(i + 32) },
                    { C::bc_decomposition_sel_pc_plus_33, bytecode_exists_at(i + 33) },
                    { C::bc_decomposition_sel_pc_plus_34, bytecode_exists_at(i + 34) },
                    { C::bc_decomposition_sel_pc_plus_35, bytecode_exists_at(i + 35) },
                    { C::bc_decomposition_sel_pc_plus_36, bytecode_exists_at(i + 36) },
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
    const simulation::EventEmitterInterface<simulation::BytecodeHashingEvent>::Container&, TraceContainer&)
{
    // TODO.
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
            { {
                { C::bc_retrieval_sel, 1 },
                { C::bc_retrieval_bytecode_id, event.bytecode_id },
                { C::bc_retrieval_address, event.address },
                // TODO: handle errors.
                // { C::bc_retrieval_error, event.error },
                // Contract instance.
                { C::bc_retrieval_salt, event.contract_instance.salt },
                { C::bc_retrieval_deployer_addr, event.contract_instance.deployer_addr },
                { C::bc_retrieval_class_id, event.contract_instance.contract_class_id },
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
            } });
        row++;
    }
}

void BytecodeTraceBuilder::process_instruction_fetching(
    const simulation::EventEmitterInterface<simulation::InstructionFetchingEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        auto get_operand = [&](size_t i) -> FF {
            return i < event.instruction.operands.size() ? static_cast<FF>(event.instruction.operands[i]) : 0;
        };
        auto bytecode_at = [&](size_t i) -> uint8_t { return i < event.bytecode->size() ? (*event.bytecode)[i] : 0; };

        const uint8_t wire_opcode = bytecode_at(event.pc);
        const auto w_opcode = static_cast<WireOpCode>(wire_opcode);

        trace.set(row,
                  { {
                      { C::instr_fetching_sel, 1 },
                      { C::instr_fetching_bytecode_id, event.bytecode_id },
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
                      // From instruction table.
                      // FIXME: This one is wrong, it's the wire opcode.
                      // { C::instr_fetching_ex_opcode, event.instruction.opcode },
                      // TODO: add the rest.
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

                      // Fill operand decomposition selectors
                      { C::instr_fetching_sel_op_dc_0, WireOpCode_DC_SELECTORS.at(w_opcode).at(0) },
                      { C::instr_fetching_sel_op_dc_1, WireOpCode_DC_SELECTORS.at(w_opcode).at(1) },
                      { C::instr_fetching_sel_op_dc_2, WireOpCode_DC_SELECTORS.at(w_opcode).at(2) },
                      { C::instr_fetching_sel_op_dc_3, WireOpCode_DC_SELECTORS.at(w_opcode).at(3) },
                      { C::instr_fetching_sel_op_dc_4, WireOpCode_DC_SELECTORS.at(w_opcode).at(4) },
                      { C::instr_fetching_sel_op_dc_5, WireOpCode_DC_SELECTORS.at(w_opcode).at(5) },
                      { C::instr_fetching_sel_op_dc_6, WireOpCode_DC_SELECTORS.at(w_opcode).at(6) },
                      { C::instr_fetching_sel_op_dc_7, WireOpCode_DC_SELECTORS.at(w_opcode).at(7) },
                      { C::instr_fetching_sel_op_dc_8, WireOpCode_DC_SELECTORS.at(w_opcode).at(8) },
                      { C::instr_fetching_sel_op_dc_9, WireOpCode_DC_SELECTORS.at(w_opcode).at(9) },
                      { C::instr_fetching_sel_op_dc_10, WireOpCode_DC_SELECTORS.at(w_opcode).at(10) },
                      { C::instr_fetching_sel_op_dc_11, WireOpCode_DC_SELECTORS.at(w_opcode).at(11) },
                      { C::instr_fetching_sel_op_dc_12, WireOpCode_DC_SELECTORS.at(w_opcode).at(12) },
                      { C::instr_fetching_sel_op_dc_13, WireOpCode_DC_SELECTORS.at(w_opcode).at(13) },
                      { C::instr_fetching_sel_op_dc_14, WireOpCode_DC_SELECTORS.at(w_opcode).at(14) },
                      { C::instr_fetching_sel_op_dc_15, WireOpCode_DC_SELECTORS.at(w_opcode).at(15) },
                      { C::instr_fetching_sel_op_dc_16, WireOpCode_DC_SELECTORS.at(w_opcode).at(16) },
                      { C::instr_fetching_sel_op_dc_17, WireOpCode_DC_SELECTORS.at(w_opcode).at(17) },
                  } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
