#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_decomposition.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_hashing.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_retrieval.hpp"
#include "barretenberg/vm2/generated/relations/lookups_instr_fetching.hpp"
#include "barretenberg/vm2/generated/relations/perms_bc_hashing.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::tracegen {

using Poseidon2 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;
using C = Column;

/**
 * @brief Process bytecode decomposition events and populate the relevant columns in the trace.
 *  Corresponds to bc_decomposition.pil.
 *
 *  This trace is non memory-aware and does not handle any errors. It populates the columns with bytecode values
 *  in a stream or 'sliding window' of DECOMPOSE_WINDOW_SIZE = MAX_INSTRUCTION_SIZE = 37 individual bytes, range
 *  checking each byte. It enforces the size of the bytecode by decrementing the bytes_remaining counter.
 *  The trace additionally constrains the bytecode as fields by packing in 31 byte segments. These fields are used
 *  by the hashing trace to enforce correctness of the bytecode id (= hashed public bytecode commitment).
 *
 * @param events The container of bytecode decomposition events to process.
 * @param trace The trace container.
 */
void BytecodeTraceBuilder::process_decomposition(
    const simulation::EventEmitterInterface<simulation::BytecodeDecompositionEvent>::Container& events,
    TraceContainer& trace)
{
    // Since next_packed_pc - pc is always in the range [0, 31), we can precompute the inverses:
    std::vector<FF> next_packed_pc_min_pc_inverses = { 0,  1,  2,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13, 14, 15,
                                                       16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 };
    FF::batch_invert(next_packed_pc_min_pc_inverses);

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
            const bool is_last = remaining == 1;
            const bool is_windows_eq_remaining = remaining == DECOMPOSE_WINDOW_SIZE;

            // Check that we still expect the max public bytecode in bytes to fit within 24 bits (i.e. <= 0xffffff).
            static_assert(MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS * 31 <= 0xffffff);

            // We set the decomposition in bytes, and other values.
            trace.set(row + i,
                      { {
                          { C::bc_decomposition_sel, 1 },
                          { C::bc_decomposition_id, id },
                          { C::bc_decomposition_pc, i },
                          { C::bc_decomposition_start, i == 0 ? 1 : 0 },
                          { C::bc_decomposition_last_of_contract, is_last ? 1 : 0 },
                          { C::bc_decomposition_bytes_remaining, remaining },
                          { C::bc_decomposition_bytes_to_read, bytes_to_read },
                          { C::bc_decomposition_sel_windows_gt_remaining, DECOMPOSE_WINDOW_SIZE > remaining ? 1 : 0 },
                          { C::bc_decomposition_sel_windows_eq_remaining, is_windows_eq_remaining ? 1 : 0 },
                          // Inverses will be calculated in batch later.
                          { C::bc_decomposition_bytes_rem_inv, remaining },
                          { C::bc_decomposition_bytes_rem_min_one_inv, is_last ? 0 : FF(remaining - 1) },
                          { C::bc_decomposition_windows_min_remaining_inv,
                            is_windows_eq_remaining ? 0 : FF(DECOMPOSE_WINDOW_SIZE) - FF(remaining) },
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
                // If we have more than 31 bytes remaining, we read 32 bytes directly from the bytecode
                // vector starting at byte i:
                as_int = from_buffer<uint256_t>(bytecode, i);
            } else {
                // Otherwise, we pad the final bytes with zeros to 32:
                std::vector<uint8_t> tail(bytecode.begin() + static_cast<ssize_t>(i), bytecode.end());
                tail.resize(32, 0);
                as_int = from_buffer<uint256_t>(tail, 0);
            }
            // We shift to form a 31 byte int:
            return as_int >> 8;
        };
        for (uint32_t i = 0; i < bytecode_len; i += 31) {
            // Set the packed field and related columns. Note that the multipermutation columns (sel_packed_read)
            // are set separately by the MultiPermutationBuilder.
            trace.set(row + i,
                      { {
                          { C::bc_decomposition_sel_packed, 1 },
                          { C::bc_decomposition_packed_field, bytecode_field_at(i) },
                          { C::bc_decomposition_next_packed_pc, i },
                          { C::bc_decomposition_next_packed_pc_min_pc_inv, 0 },
                      } });
            // At each row until the next packed field, set the next pc and inverse required for the zero check
            // (#[PC_IS_PACKED]):
            for (uint32_t j = i + 1; j < std::min(bytecode_len, i + 31); j++) {
                trace.set(
                    row + j,
                    { {
                        { C::bc_decomposition_next_packed_pc, i + 31 },
                        { C::bc_decomposition_next_packed_pc_min_pc_inv, next_packed_pc_min_pc_inverses[i + 31 - j] },
                    } });
            }
        }

        // We advance to the next bytecode.
        row += bytecode_len;
    }

    // Batch invert the columns.
    trace.invert_columns({ { C::bc_decomposition_bytes_rem_inv,
                             C::bc_decomposition_bytes_rem_min_one_inv,
                             C::bc_decomposition_windows_min_remaining_inv } });
}

/**
 * @brief Process bytecode hashing events and populate the bc_hashing columns in the trace.
 *  Corresponds to bc_hashing.pil.
 *
 *  For each bytecode, this function prepends a domain-separated length field to the bytecode
 *  field elements, then lays out Poseidon2 hashing rounds (3 inputs per round). Padding fields
 *  are added when the total field count is not a multiple of 3. The output hash equals the
 *  bytecode_id and is propagated to every row of the hashing sub-trace.
 *
 * @param events The container of bytecode hashing events to process.
 * @param trace The trace container.
 */
void BytecodeTraceBuilder::process_hashing(
    const simulation::EventEmitterInterface<simulation::BytecodeHashingEvent>::Container& events, TraceContainer& trace)
{
    // bc_hashing.pil uses some shifted columns and therefore we start from row 1.
    uint32_t row = 1;

    for (const auto& event : events) {
        // Note that bytecode fields from the BytecodeHashingEvent do not contain the prepended field length | separator

        const auto& id = event.bytecode_id;
        const auto input_len = event.bytecode_fields.size() + 1; // +1 for the prepended field length | separator
        const auto padding_amount = (3 - (input_len % 3)) % 3;

        std::vector<FF> fields = { simulation::compute_public_bytecode_first_field(event.bytecode_length_in_bytes) };
        fields.reserve(input_len + padding_amount);
        fields.insert(fields.end(), event.bytecode_fields.begin(), event.bytecode_fields.end());
        fields.insert(fields.end(), padding_amount, FF(0)); // Add padding fields.

        const auto num_rounds = fields.size() / 3;

        for (size_t i = 0; i < num_rounds; i++) {
            bool start_of_bytecode = i == 0;
            bool end_of_bytecode = i == num_rounds - 1;
            // When we start the bytecode, we want to look up field 1 at pc = 0 in the decomposition trace, since we
            // force field 0 to be the separator.
            // Layout is: PC_INDEX, PC_INDEX_1, PC_INDEX_2
            //                 0         0           31
            //                62        93          124
            uint32_t pc_index_1 = 93 * static_cast<uint32_t>(i);
            uint32_t pc_index = i > 0 ? pc_index_1 - 31 : 0;
            trace.set(row,
                      { { { C::bc_hashing_sel, 1 },
                          { C::bc_hashing_start, start_of_bytecode ? 1 : 0 },
                          { C::bc_hashing_sel_not_start, !start_of_bytecode ? 1 : 0 },
                          { C::bc_hashing_end, end_of_bytecode ? 1 : 0 },
                          { C::bc_hashing_bytecode_id, id },
                          { C::bc_hashing_size_in_bytes,
                            event.bytecode_length_in_bytes }, // Note: only needs to be constrained at start
                          { C::bc_hashing_input_len, input_len },
                          { C::bc_hashing_rounds_rem, num_rounds - i },
                          { C::bc_hashing_pc_index, pc_index },
                          { C::bc_hashing_pc_index_1, pc_index_1 },
                          { C::bc_hashing_pc_index_2, pc_index_1 + 31 },
                          { C::bc_hashing_packed_fields_0, fields[i * 3] },
                          { C::bc_hashing_packed_fields_1, fields[(i * 3) + 1] },
                          { C::bc_hashing_packed_fields_2, fields[(i * 3) + 2] },
                          { C::bc_hashing_sel_not_padding_1, end_of_bytecode && padding_amount == 2 ? 0 : 1 },
                          { C::bc_hashing_sel_not_padding_2, end_of_bytecode && padding_amount > 0 ? 0 : 1 },
                          { C::bc_hashing_padding, padding_amount } } });
            row++;
        }
    }
}

/**
 * @brief Process bytecode retrieval events and populate the relevant columns in the trace.
 *  Corresponds to bc_retrieval.pil.
 *
 *  This trace is non memory-aware and uses a single row per retrieval event to prove success or failure
 *  of bytecode retrieval. It largely delegates checks to other traces via lookups (see bc_retrieval.pil).
 *  It handles two possible errors:
 *      - INSTANCE_NOT_FOUND: the contract at the given address is not deployed.
 *      - TOO_MANY_BYTECODES: we have reached the limit of the number of bytecodes to retrieve for this tx.
 *
 * @param events The container of bytecode retrieval events to process.
 * @param trace The trace container.
 */
void BytecodeTraceBuilder::process_retrieval(
    const simulation::EventEmitterInterface<simulation::BytecodeRetrievalEvent>::Container& events,
    TraceContainer& trace)
{
    uint32_t row = 0;
    for (const auto& event : events) {
        // Since the maximum is (currently) 21 and we prove incrementation of next_available_leaf_index
        // at each row, the use of uint64 should be safe and never underflow.
        uint64_t remaining_bytecodes = MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS +
                                       AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE -
                                       event.retrieved_bytecodes_snapshot_before.next_available_leaf_index;
        bool error = event.error.has_value();
        if (event.error == simulation::BytecodeRetrievalEventError::TOO_MANY_BYTECODES) {
            BB_ASSERT(event.is_new_class == true & remaining_bytecodes == 0,
                      "TOO_MANY_BYTECODES error incorrectly set for bytecode retrieval");
        }
        trace.set(
            row,
            { {
                { C::bc_retrieval_sel, 1 },
                { C::bc_retrieval_bytecode_id, event.bytecode_id },
                { C::bc_retrieval_address, event.address },

                // Contract instance members (for lookup into contract_instance_retrieval)
                { C::bc_retrieval_current_class_id, event.current_class_id },

                // Contract class members (for lookup into class_id_derivation)
                { C::bc_retrieval_artifact_hash, event.contract_class.artifact_hash },
                { C::bc_retrieval_private_functions_root, event.contract_class.private_functions_root },

                // Tree context (for lookup into contract_instance_retrieval)
                { C::bc_retrieval_public_data_tree_root, event.public_data_tree_root },
                { C::bc_retrieval_nullifier_tree_root, event.nullifier_tree_root },

                // Retrieved bytecodes tree context (for lookup into indexed_tree_check)
                { C::bc_retrieval_retrieved_bytecodes_tree_height, AVM_RETRIEVED_BYTECODES_TREE_HEIGHT },
                { C::bc_retrieval_retrieved_bytecodes_merkle_separator, DOM_SEP__RETRIEVED_BYTECODES_MERKLE },
                { C::bc_retrieval_prev_retrieved_bytecodes_tree_root, event.retrieved_bytecodes_snapshot_before.root },
                { C::bc_retrieval_prev_retrieved_bytecodes_tree_size,
                  event.retrieved_bytecodes_snapshot_before.next_available_leaf_index },
                { C::bc_retrieval_next_retrieved_bytecodes_tree_root, event.retrieved_bytecodes_snapshot_after.root },
                { C::bc_retrieval_next_retrieved_bytecodes_tree_size,
                  event.retrieved_bytecodes_snapshot_after.next_available_leaf_index },

                // Instance existence determined by shared contract instance retrieval
                { C::bc_retrieval_instance_exists,
                  event.error == simulation::BytecodeRetrievalEventError::INSTANCE_NOT_FOUND ? 0 : 1 },

                // Error handling
                { C::bc_retrieval_error, error ? 1 : 0 },
                { C::bc_retrieval_is_new_class, event.is_new_class },
                { C::bc_retrieval_should_retrieve, error ? 0 : 1 },
                // Too many bytecodes handling
                { C::bc_retrieval_no_remaining_bytecodes, remaining_bytecodes == 0 ? 1 : 0 },
                { C::bc_retrieval_remaining_bytecodes_inv, remaining_bytecodes }, // Will be inverted in batch later.
            } });
        row++;
    }

    // Batch invert the columns.
    trace.invert_columns({ { C::bc_retrieval_remaining_bytecodes_inv } });
}

/**
 * @brief Process instruction fetching events and populate the relevant columns in the trace.
 *  Corresponds to instr_fetching.pil.
 *
 * Uses a single row per event. Note that events are already deduplicated by simulation (see See
 * InstructionFetchingEvent and DeduplicatingEventEmitter used in simulate_for_witgen), so no further
 * deduplication is performed here.
 *
 * This function does not perform any error detection itself; all error classification has
 * already been done in simulation so we simply read directly from the event's error field.
 * The four possible errors are:
 *          - PC_OUT_OF_RANGE
 *          - OPCODE_OUT_OF_RANGE
 *          - INSTRUCTION_OUT_OF_RANGE
 *          - TAG_OUT_OF_RANGE
 * See simulation ([pure_]bytecode_manager.cpp) and instr_fetching.pil for error documentation.
 *
 * @param events The container of instruction fetching events to process.
 * @param trace The trace container.
 */
void BytecodeTraceBuilder::process_instruction_fetching(
    const simulation::EventEmitterInterface<simulation::InstructionFetchingEvent>::Container& events,
    TraceContainer& trace)
{
    using simulation::InstructionFetchingEvent;
    using simulation::InstrDeserializationEventError::INSTRUCTION_OUT_OF_RANGE;
    using simulation::InstrDeserializationEventError::OPCODE_OUT_OF_RANGE;
    using simulation::InstrDeserializationEventError::PC_OUT_OF_RANGE;
    using simulation::InstrDeserializationEventError::TAG_OUT_OF_RANGE;

    uint32_t row = 0;

    for (const auto& event : events) {
        const auto bytecode_size = event.bytecode->size();
        // To match column PARSING_ERROR_EXCEPT_TAG_ERROR:
        const bool parsing_error_non_tag = event.error == PC_OUT_OF_RANGE || event.error == OPCODE_OUT_OF_RANGE ||
                                           event.error == INSTRUCTION_OUT_OF_RANGE;

        // Operands are constrained to be 0 in the circuit when PARSING_ERROR_EXCEPT_TAG_ERROR:
        auto get_operand = [&](size_t i) -> FF {
            return i < event.instruction.operands.size() && !parsing_error_non_tag
                       ? static_cast<FF>(event.instruction.operands[i])
                       : 0;
        };
        auto bytecode_at = [&](size_t i) -> uint8_t { return i < bytecode_size ? (*event.bytecode)[i] : 0; };

        // To match column bd0, the first byte of the instruction which holds the wire opcode.
        const uint8_t wire_opcode = bytecode_at(event.pc);
        // Corresponds to !opcode_out_of_range (PC_OUT_OF_RANGE is checked first since we have error disjointedness).
        const bool wire_opcode_in_range = event.error != PC_OUT_OF_RANGE && event.error != OPCODE_OUT_OF_RANGE;

        // To match corresponding columns (initialized as 0 to match circuit behaviour in error cases):
        //  -   PC_OUT_OF_RANGE: The below remain 0 (matching sel_pc_in_range == 0 and PARSING_ERROR_EXCEPT_TAG_ERROR
        //                       circuit logic) as there is nothing to read from the bytecode.
        //  -   OPCODE_OUT_OF_RANGE: The below remain 0 since we do not have a valid opcode. This matches the
        //                           #[WIRE_INSTRUCTION_INFO] lookup where opcode_out_of_range == 1 implies all other
        //                           tuple fields are 0.
        //  -   INSTRUCTION_OUT_OF_RANGE: The below are assigned according to the wire opcode and instr_size is used to
        //                                constrain the instr_out_of_range flag. Note that operands are forced to be 0
        //                                (correctly matching PARSING_ERROR_EXCEPT_TAG_ERROR circuit logic) meaning
        //                                tag_value can only be 0. This is fine as #[TAG_VALUE_VALIDATION] passes for 0
        //                                trivially and the circuit still enforces sel_parsing_err == 1.
        //  -   TAG_OUT_OF_RANGE: The below, including operands, are all assigned, matching circuit behaviour for
        //                        PARSING_ERROR_EXCEPT_TAG_ERROR == 0.
        uint32_t instr_size = 0;
        ExecutionOpCode exec_opcode = static_cast<ExecutionOpCode>(0);
        std::array<uint8_t, NUM_OP_DC_SELECTORS> op_dc_selectors{};
        bool has_tag = false;
        bool tag_is_op2 = false;
        uint8_t tag_value = 0;

        if (wire_opcode_in_range) {
            const auto& wire_instr_spec = get_wire_instruction_spec().at(static_cast<WireOpCode>(wire_opcode));
            instr_size = wire_instr_spec.size_in_bytes;
            exec_opcode = wire_instr_spec.exec_opcode;
            op_dc_selectors = wire_instr_spec.op_dc_selectors;

            if (wire_instr_spec.tag_operand_idx.has_value()) {
                const auto tag_value_idx = wire_instr_spec.tag_operand_idx.value();
                BB_ASSERT((tag_value_idx == 2 || tag_value_idx == 3),
                          "Current constraints support only tag for operand index equal to 2 or 3");
                has_tag = true;
                tag_value =
                    static_cast<uint8_t>(get_operand(tag_value_idx - 1)); // op2/op3 live at instruction.operands[1/2]
                tag_is_op2 = tag_value_idx == 2;
            }
        }

        uint32_t bytecode_size_u32 = static_cast<uint32_t>(bytecode_size);
        uint32_t pc_abs_diff =
            event.error == PC_OUT_OF_RANGE ? event.pc - bytecode_size_u32 : bytecode_size_u32 - event.pc - 1;

        // If OPCODE_OUT_OF_RANGE, we still have valid bytecode to read, but have no
        // instruction and hence instr_size = 0. This matches the expected table entry for
        // opcode_out_of_range == 1 (#[WIRE_INSTRUCTION_INFO]) and the diff check passes
        // for instr_abs_diff = bytes_to_read:
        const uint32_t bytes_remaining = event.error == PC_OUT_OF_RANGE ? 0 : bytecode_size_u32 - event.pc;
        const uint32_t bytes_to_read = std::min(bytes_remaining, DECOMPOSE_WINDOW_SIZE);
        uint32_t instr_abs_diff =
            event.error == INSTRUCTION_OUT_OF_RANGE ? instr_size - bytes_to_read - 1 : bytes_to_read - instr_size;

        trace.set(row,
                  { { { C::instr_fetching_sel, 1 },
                      // Unique pair defining the instruction.
                      { C::instr_fetching_pc, event.pc },
                      { C::instr_fetching_bytecode_id, event.bytecode_id },

                      // Parsing error flags.
                      { C::instr_fetching_pc_out_of_range, event.error == PC_OUT_OF_RANGE ? 1 : 0 },
                      { C::instr_fetching_opcode_out_of_range, event.error == OPCODE_OUT_OF_RANGE ? 1 : 0 },
                      { C::instr_fetching_instr_out_of_range, event.error == INSTRUCTION_OUT_OF_RANGE ? 1 : 0 },
                      { C::instr_fetching_tag_out_of_range, event.error == TAG_OUT_OF_RANGE ? 1 : 0 },
                      { C::instr_fetching_sel_parsing_err, event.error.has_value() ? 1 : 0 },
                      { C::instr_fetching_sel_pc_in_range, event.error != PC_OUT_OF_RANGE ? 1 : 0 },

                      // Error handling.
                      { C::instr_fetching_bytecode_size, bytecode_size },
                      { C::instr_fetching_bytes_to_read, bytes_to_read },
                      { C::instr_fetching_instr_size, instr_size },
                      { C::instr_fetching_instr_abs_diff, instr_abs_diff },
                      { C::instr_fetching_pc_abs_diff, pc_abs_diff },
                      // Constant column (this is temp because aliasing is not allowed in lookups).
                      { C::instr_fetching_pc_size_in_bits, AVM_PC_SIZE_IN_BITS },

                      // Tag metadata.
                      { C::instr_fetching_tag_value, tag_value },
                      { C::instr_fetching_sel_has_tag, has_tag ? 1 : 0 },
                      { C::instr_fetching_sel_tag_is_op2, tag_is_op2 ? 1 : 0 },

                      // Execution opcode.
                      { C::instr_fetching_exec_opcode, static_cast<uint32_t>(exec_opcode) },

                      // Addressing mode and operands.
                      { C::instr_fetching_addressing_mode, event.instruction.addressing_mode },
                      { C::instr_fetching_op1, get_operand(0) },
                      { C::instr_fetching_op2, get_operand(1) },
                      { C::instr_fetching_op3, get_operand(2) },
                      { C::instr_fetching_op4, get_operand(3) },
                      { C::instr_fetching_op5, get_operand(4) },

                      // Single instruction bytes.
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

                      // Operand decomposition selectors.
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
                      { C::instr_fetching_sel_op_dc_15, op_dc_selectors.at(15) } } });
        row++;
    }
}

const InteractionDefinition BytecodeTraceBuilder::interactions =
    InteractionDefinition()
        // Bytecode Hashing
        .add<InteractionType::Permutation, perm_bc_hashing_bytecode_length_bytes_settings>()
        .add<InteractionType::MultiPermutation,
             perm_bc_hashing_get_packed_field_0_settings,
             perm_bc_hashing_get_packed_field_1_settings,
             perm_bc_hashing_get_packed_field_2_settings>(C::bc_decomposition_sel_packed)
        .add<InteractionType::LookupSequential, lookup_bc_hashing_poseidon2_hash_settings>()
        // Bytecode Retrieval
        .add<InteractionType::LookupSequential, lookup_bc_retrieval_contract_instance_retrieval_settings>()
        .add<InteractionType::LookupGeneric, lookup_bc_retrieval_class_id_derivation_settings>()
        .add<InteractionType::LookupSequential, lookup_bc_retrieval_is_new_class_check_settings>()
        .add<InteractionType::LookupSequential, lookup_bc_retrieval_retrieved_bytecodes_insertion_settings>()
        // Bytecode Decomposition
        .add<InteractionType::LookupIntoIndexedByRow, lookup_bc_decomposition_bytes_are_bytes_settings>()
        // Instruction Fetching
        .add<InteractionType::LookupGeneric, lookup_instr_fetching_pc_abs_diff_positive_settings>()
        .add<InteractionType::LookupIntoIndexedByRow, lookup_instr_fetching_instr_abs_diff_positive_settings>()
        .add<InteractionType::LookupIntoIndexedByRow, lookup_instr_fetching_tag_value_validation_settings>()
        // The lookups into bc_decomposition cannnot be sequential because we deduplicate instruction
        // fetches. Additionally the instruction rows are not necessarily ordered by bytecode position.
        .add<InteractionType::LookupGeneric, lookup_instr_fetching_bytecode_size_from_bc_dec_settings>()
        .add<InteractionType::LookupGeneric, lookup_instr_fetching_bytes_from_bc_dec_settings>()
        .add<InteractionType::LookupIntoIndexedByRow, lookup_instr_fetching_wire_instruction_info_settings>();

} // namespace bb::avm2::tracegen
