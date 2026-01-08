#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <numeric>
#include <ranges>
#include <stdexcept>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/common/addressing.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/set.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_addressing.hpp"
#include "barretenberg/vm2/generated/relations/lookups_context.hpp"
#include "barretenberg/vm2/generated/relations/lookups_emit_notehash.hpp"
#include "barretenberg/vm2/generated/relations/lookups_emit_nullifier.hpp"
#include "barretenberg/vm2/generated/relations/lookups_execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_external_call.hpp"
#include "barretenberg/vm2/generated/relations/lookups_gas.hpp"
#include "barretenberg/vm2/generated/relations/lookups_get_env_var.hpp"
#include "barretenberg/vm2/generated/relations/lookups_internal_call.hpp"
#include "barretenberg/vm2/generated/relations/lookups_l1_to_l2_message_exists.hpp"
#include "barretenberg/vm2/generated/relations/lookups_notehash_exists.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_exists.hpp"
#include "barretenberg/vm2/generated/relations/lookups_send_l2_to_l1_msg.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sload.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sstore.hpp"
#include "barretenberg/vm2/generated/relations/perms_context.hpp"
#include "barretenberg/vm2/generated/relations/perms_execution.hpp"
#include "barretenberg/vm2/generated/relations/perms_internal_call.hpp"
#include "barretenberg/vm2/tracegen/lib/get_env_var_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"

using C = bb::avm2::Column;
using bb::avm2::simulation::AddressingEventError;
using bb::avm2::simulation::ExecutionError;
using bb::avm2::simulation::Operand;

namespace bb::avm2::tracegen {
namespace {

constexpr std::array<C, AVM_MAX_OPERANDS> OPERAND_COLUMNS = {
    C::execution_op_0_, C::execution_op_1_, C::execution_op_2_, C::execution_op_3_,
    C::execution_op_4_, C::execution_op_5_, C::execution_op_6_,
};
constexpr std::array<C, AVM_MAX_OPERANDS> OPERAND_IS_ADDRESS_COLUMNS = {
    C::execution_sel_op_is_address_0_, C::execution_sel_op_is_address_1_, C::execution_sel_op_is_address_2_,
    C::execution_sel_op_is_address_3_, C::execution_sel_op_is_address_4_, C::execution_sel_op_is_address_5_,
    C::execution_sel_op_is_address_6_,
};
constexpr std::array<C, AVM_MAX_OPERANDS> OPERAND_AFTER_RELATIVE_COLUMNS = {
    C::execution_op_after_relative_0_, C::execution_op_after_relative_1_, C::execution_op_after_relative_2_,
    C::execution_op_after_relative_3_, C::execution_op_after_relative_4_, C::execution_op_after_relative_5_,
    C::execution_op_after_relative_6_,
};
constexpr std::array<C, AVM_MAX_OPERANDS> RESOLVED_OPERAND_COLUMNS = {
    C::execution_rop_0_, C::execution_rop_1_, C::execution_rop_2_, C::execution_rop_3_,
    C::execution_rop_4_, C::execution_rop_5_, C::execution_rop_6_,
};
constexpr std::array<C, AVM_MAX_OPERANDS> RESOLVED_OPERAND_TAG_COLUMNS = {
    C::execution_rop_tag_0_, C::execution_rop_tag_1_, C::execution_rop_tag_2_, C::execution_rop_tag_3_,
    C::execution_rop_tag_4_, C::execution_rop_tag_5_, C::execution_rop_tag_6_,
};
constexpr std::array<C, AVM_MAX_OPERANDS> OPERAND_SHOULD_APPLY_INDIRECTION_COLUMNS = {
    C::execution_sel_should_apply_indirection_0_, C::execution_sel_should_apply_indirection_1_,
    C::execution_sel_should_apply_indirection_2_, C::execution_sel_should_apply_indirection_3_,
    C::execution_sel_should_apply_indirection_4_, C::execution_sel_should_apply_indirection_5_,
    C::execution_sel_should_apply_indirection_6_,
};
constexpr std::array<C, AVM_MAX_OPERANDS> OPERAND_RELATIVE_OVERFLOW_COLUMNS = {
    C::execution_sel_relative_overflow_0_, C::execution_sel_relative_overflow_1_, C::execution_sel_relative_overflow_2_,
    C::execution_sel_relative_overflow_3_, C::execution_sel_relative_overflow_4_, C::execution_sel_relative_overflow_5_,
    C::execution_sel_relative_overflow_6_,
};
constexpr std::array<C, AVM_MAX_OPERANDS> OPERAND_IS_RELATIVE_VALID_BASE_COLUMNS = {
    C::execution_sel_op_do_overflow_check_0_, C::execution_sel_op_do_overflow_check_1_,
    C::execution_sel_op_do_overflow_check_2_, C::execution_sel_op_do_overflow_check_3_,
    C::execution_sel_op_do_overflow_check_4_, C::execution_sel_op_do_overflow_check_5_,
    C::execution_sel_op_do_overflow_check_6_,
};
constexpr size_t TOTAL_INDIRECT_BITS = 16;
static_assert(static_cast<size_t>(AVM_MAX_OPERANDS) * 2 <= TOTAL_INDIRECT_BITS);
constexpr std::array<C, TOTAL_INDIRECT_BITS / 2> OPERAND_IS_RELATIVE_WIRE_COLUMNS = {
    C::execution_sel_op_is_relative_wire_0_, C::execution_sel_op_is_relative_wire_1_,
    C::execution_sel_op_is_relative_wire_2_, C::execution_sel_op_is_relative_wire_3_,
    C::execution_sel_op_is_relative_wire_4_, C::execution_sel_op_is_relative_wire_5_,
    C::execution_sel_op_is_relative_wire_6_, C::execution_sel_op_is_relative_wire_7_,

};
constexpr std::array<C, TOTAL_INDIRECT_BITS / 2> OPERAND_IS_INDIRECT_WIRE_COLUMNS = {
    C::execution_sel_op_is_indirect_wire_0_, C::execution_sel_op_is_indirect_wire_1_,
    C::execution_sel_op_is_indirect_wire_2_, C::execution_sel_op_is_indirect_wire_3_,
    C::execution_sel_op_is_indirect_wire_4_, C::execution_sel_op_is_indirect_wire_5_,
    C::execution_sel_op_is_indirect_wire_6_, C::execution_sel_op_is_indirect_wire_7_,
};

constexpr std::array<C, AVM_MAX_REGISTERS> REGISTER_COLUMNS = {
    C::execution_register_0_, C::execution_register_1_, C::execution_register_2_,
    C::execution_register_3_, C::execution_register_4_, C::execution_register_5_,
};
constexpr std::array<C, AVM_MAX_REGISTERS> REGISTER_MEM_TAG_COLUMNS = {
    C::execution_mem_tag_reg_0_, C::execution_mem_tag_reg_1_, C::execution_mem_tag_reg_2_,
    C::execution_mem_tag_reg_3_, C::execution_mem_tag_reg_4_, C::execution_mem_tag_reg_5_,
};
constexpr std::array<C, AVM_MAX_REGISTERS> REGISTER_IS_WRITE_COLUMNS = {
    C::execution_rw_reg_0_, C::execution_rw_reg_1_, C::execution_rw_reg_2_,
    C::execution_rw_reg_3_, C::execution_rw_reg_4_, C::execution_rw_reg_5_,
};
constexpr std::array<C, AVM_MAX_REGISTERS> REGISTER_MEM_OP_COLUMNS = {
    C::execution_sel_mem_op_reg_0_, C::execution_sel_mem_op_reg_1_, C::execution_sel_mem_op_reg_2_,
    C::execution_sel_mem_op_reg_3_, C::execution_sel_mem_op_reg_4_, C::execution_sel_mem_op_reg_5_,
};
constexpr std::array<C, AVM_MAX_REGISTERS> REGISTER_EXPECTED_TAG_COLUMNS = {
    C::execution_expected_tag_reg_0_, C::execution_expected_tag_reg_1_, C::execution_expected_tag_reg_2_,
    C::execution_expected_tag_reg_3_, C::execution_expected_tag_reg_4_, C::execution_expected_tag_reg_5_,
};
constexpr std::array<C, AVM_MAX_REGISTERS> REGISTER_TAG_CHECK_COLUMNS = {
    C::execution_sel_tag_check_reg_0_, C::execution_sel_tag_check_reg_1_, C::execution_sel_tag_check_reg_2_,
    C::execution_sel_tag_check_reg_3_, C::execution_sel_tag_check_reg_4_, C::execution_sel_tag_check_reg_5_,
};
constexpr std::array<C, AVM_MAX_REGISTERS> REGISTER_OP_REG_EFFECTIVE_COLUMNS = {
    C::execution_sel_op_reg_effective_0_, C::execution_sel_op_reg_effective_1_, C::execution_sel_op_reg_effective_2_,
    C::execution_sel_op_reg_effective_3_, C::execution_sel_op_reg_effective_4_, C::execution_sel_op_reg_effective_5_,
};

/**
 * @brief Get the column selector for a given execution opcode.
 *
 * @param exec_opcode The execution opcode.
 * @return The corresponding column selector.
 * @throws std::runtime_error if the opcode doesn't have a corresponding selector.
 */
C get_execution_opcode_selector(ExecutionOpCode exec_opcode)
{
    switch (exec_opcode) {
    case ExecutionOpCode::GETENVVAR:
        return C::execution_sel_execute_get_env_var;
    case ExecutionOpCode::MOV:
        return C::execution_sel_execute_mov;
    case ExecutionOpCode::JUMP:
        return C::execution_sel_execute_jump;
    case ExecutionOpCode::JUMPI:
        return C::execution_sel_execute_jumpi;
    case ExecutionOpCode::CALL:
        return C::execution_sel_execute_call;
    case ExecutionOpCode::STATICCALL:
        return C::execution_sel_execute_static_call;
    case ExecutionOpCode::INTERNALCALL:
        return C::execution_sel_execute_internal_call;
    case ExecutionOpCode::INTERNALRETURN:
        return C::execution_sel_execute_internal_return;
    case ExecutionOpCode::RETURN:
        return C::execution_sel_execute_return;
    case ExecutionOpCode::REVERT:
        return C::execution_sel_execute_revert;
    case ExecutionOpCode::SUCCESSCOPY:
        return C::execution_sel_execute_success_copy;
    case ExecutionOpCode::RETURNDATASIZE:
        return C::execution_sel_execute_returndata_size;
    case ExecutionOpCode::DEBUGLOG:
        return C::execution_sel_execute_debug_log;
    case ExecutionOpCode::SLOAD:
        return C::execution_sel_execute_sload;
    case ExecutionOpCode::SSTORE:
        return C::execution_sel_execute_sstore;
    case ExecutionOpCode::NOTEHASHEXISTS:
        return C::execution_sel_execute_notehash_exists;
    case ExecutionOpCode::EMITNOTEHASH:
        return C::execution_sel_execute_emit_notehash;
    case ExecutionOpCode::L1TOL2MSGEXISTS:
        return C::execution_sel_execute_l1_to_l2_message_exists;
    case ExecutionOpCode::NULLIFIEREXISTS:
        return C::execution_sel_execute_nullifier_exists;
    case ExecutionOpCode::EMITNULLIFIER:
        return C::execution_sel_execute_emit_nullifier;
    case ExecutionOpCode::SENDL2TOL1MSG:
        return C::execution_sel_execute_send_l2_to_l1_msg;
    default:
        throw std::runtime_error("Execution opcode does not have a corresponding selector");
    }
}

/**
 * @brief Helper struct to track info after "discard" preprocessing.
 */
struct FailingContexts {
    bool app_logic_failure = false;
    bool teardown_failure = false;
    uint32_t app_logic_exit_context_id = 0;
    uint32_t teardown_exit_context_id = 0;
    unordered_flat_set<uint32_t> does_context_fail;
};

/**
 * @brief Preprocess execution events to determine which contexts will fail.
 *
 * @details This is used during trace-generation to populate the `discard` and `dying_context_id` columns
 * which must be set throughout a context that will EVENTUALLY fail. So we need to do a
 * preprocessing pass so that we can set these columns properly during trace-generation for rows
 * in a dying context before the actual failure event is reached.
 *
 * @param ex_events The execution events.
 * @return The failing contexts.
 */
FailingContexts preprocess_for_discard(
    const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events)
{
    FailingContexts dying_info;

    // We use `after_context_event` to retrieve parent_id, context_id, and phase to be consistent with
    // how these values are populated in the trace (see ExecutionTraceBuilder::process()). These values
    // should not change during the life-cycle of an execution event though and before_context_event
    // would lead to the same results.

    // Preprocessing pass 1: find the events that exit the app logic and teardown phases
    for (const auto& ex_event : ex_events) {
        bool is_exit = ex_event.is_exit();
        bool is_top_level = ex_event.after_context_event.parent_id == 0;

        if (is_exit && is_top_level) {
            if (ex_event.after_context_event.phase == TransactionPhase::APP_LOGIC) {
                dying_info.app_logic_failure = ex_event.is_failure();
                dying_info.app_logic_exit_context_id = ex_event.after_context_event.id;
            } else if (ex_event.after_context_event.phase == TransactionPhase::TEARDOWN) {
                dying_info.teardown_failure = ex_event.is_failure();
                dying_info.teardown_exit_context_id = ex_event.after_context_event.id;
                break; // Teardown is the last phase we care about
            }
        }
    }

    // Preprocessing pass 2: find all contexts that fail and mark them
    for (const auto& ex_event : ex_events) {
        if (ex_event.is_failure()) {
            dying_info.does_context_fail.insert(ex_event.after_context_event.id);
        }
    }

    return dying_info;
}

/**
 * @brief Check if an entire phase should "discard" [side effects].
 *
 * @param phase The phase to check.
 * @param failures The failing contexts.
 * @return true if the phase should be discarded, false otherwise.
 */
bool is_phase_discarded(TransactionPhase phase, const FailingContexts& failures)
{
    // Note that app logic also gets discarded if teardown failures
    return (phase == TransactionPhase::APP_LOGIC && (failures.app_logic_failure || failures.teardown_failure)) ||
           (phase == TransactionPhase::TEARDOWN && failures.teardown_failure);
}

/**
 * @brief Get the dying context ID for a phase.
 *
 * @param phase The phase to check.
 * @param failures The failing contexts.
 * @return The dying context ID for the phase if any, 0 otherwise.
 */
uint32_t dying_context_for_phase(TransactionPhase phase, const FailingContexts& failures)
{
    BB_ASSERT((phase == TransactionPhase::APP_LOGIC || phase == TransactionPhase::TEARDOWN),
              "Execution events must have app logic or teardown phase");

    switch (phase) {
    case TransactionPhase::APP_LOGIC: {
        if (failures.app_logic_failure) {
            return failures.app_logic_exit_context_id;
        }

        // Note that app logic also gets discarded if teardown failures
        if (failures.teardown_failure) {
            return failures.teardown_exit_context_id;
        }

        return 0;
    }
    case TransactionPhase::TEARDOWN:
        return failures.teardown_failure ? failures.teardown_exit_context_id : 0;
    default:
        __builtin_unreachable(); // tell the compiler "we never reach here"
    }
}

} // namespace

void ExecutionTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events, TraceContainer& trace)
{
    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.

    // Preprocess events to determine which contexts will fail
    const FailingContexts failures = preprocess_for_discard(ex_events);

    // Some variables updated per loop iteration to track
    // whether or not the upcoming row should "discard" [side effects].
    uint32_t dying_context_id = 0;
    // dying_context_id captures whether we discard or not. Namely, discard == 1 <=> dying_context_id != 0
    // is a circuit invariant. For this reason, we use a lambda to preserve the invariant.
    auto is_discarding = [&dying_context_id]() { return dying_context_id != 0; };
    bool is_first_event_in_enqueued_call = true;
    bool prev_row_was_enter_call = false;

    for (const auto& ex_event : ex_events) {
        // Check if this is the first event in an enqueued call and whether
        // the phase should be discarded
        if (!is_discarding() && is_first_event_in_enqueued_call &&
            is_phase_discarded(ex_event.after_context_event.phase, failures)) {
            dying_context_id = dying_context_for_phase(ex_event.after_context_event.phase, failures);
        }

        const bool has_parent = ex_event.after_context_event.parent_id != 0;

        /**************************************************************************************************
         *  Setup.
         **************************************************************************************************/

        trace.set(
            row,
            { {
                { C::execution_sel, 1 },
                // Selectors that indicate "dispatch" from tx trace
                // Note: Enqueued Call End is determined during the opcode execution temporality group
                { C::execution_enqueued_call_start, is_first_event_in_enqueued_call ? 1 : 0 },
                // Context
                { C::execution_context_id, ex_event.after_context_event.id },
                { C::execution_parent_id, ex_event.after_context_event.parent_id },
                // Warning: pc in after_context_event is the pc of the next instruction, not the current instruction.
                { C::execution_pc, ex_event.before_context_event.pc },
                { C::execution_msg_sender, ex_event.after_context_event.msg_sender },
                { C::execution_contract_address, ex_event.after_context_event.contract_addr },
                { C::execution_transaction_fee, ex_event.after_context_event.transaction_fee },
                { C::execution_is_static, ex_event.after_context_event.is_static },
                { C::execution_parent_calldata_addr, ex_event.after_context_event.parent_cd_addr },
                { C::execution_parent_calldata_size, ex_event.after_context_event.parent_cd_size },
                { C::execution_last_child_returndata_addr, ex_event.after_context_event.last_child_rd_addr },
                { C::execution_last_child_returndata_size, ex_event.after_context_event.last_child_rd_size },
                { C::execution_last_child_success, ex_event.after_context_event.last_child_success },
                { C::execution_last_child_id, ex_event.after_context_event.last_child_id },
                { C::execution_l2_gas_limit, ex_event.after_context_event.gas_limit.l2_gas },
                { C::execution_da_gas_limit, ex_event.after_context_event.gas_limit.da_gas },
                { C::execution_l2_gas_used, ex_event.after_context_event.gas_used.l2_gas },
                { C::execution_da_gas_used, ex_event.after_context_event.gas_used.da_gas },
                { C::execution_parent_l2_gas_limit, ex_event.after_context_event.parent_gas_limit.l2_gas },
                { C::execution_parent_da_gas_limit, ex_event.after_context_event.parent_gas_limit.da_gas },
                { C::execution_parent_l2_gas_used, ex_event.after_context_event.parent_gas_used.l2_gas },
                { C::execution_parent_da_gas_used, ex_event.after_context_event.parent_gas_used.da_gas },
                { C::execution_next_context_id, ex_event.next_context_id },
                // Context - gas.
                { C::execution_prev_l2_gas_used, ex_event.before_context_event.gas_used.l2_gas },
                { C::execution_prev_da_gas_used, ex_event.before_context_event.gas_used.da_gas },
                // Context - tree states
                // Context - tree states - Written public data slots tree
                { C::execution_prev_written_public_data_slots_tree_root,
                  ex_event.before_context_event.written_public_data_slots_tree_snapshot.root },
                { C::execution_prev_written_public_data_slots_tree_size,
                  ex_event.before_context_event.written_public_data_slots_tree_snapshot.next_available_leaf_index },
                { C::execution_written_public_data_slots_tree_root,
                  ex_event.after_context_event.written_public_data_slots_tree_snapshot.root },
                { C::execution_written_public_data_slots_tree_size,
                  ex_event.after_context_event.written_public_data_slots_tree_snapshot.next_available_leaf_index },
                // Context - tree states - Nullifier tree
                { C::execution_prev_nullifier_tree_root,
                  ex_event.before_context_event.tree_states.nullifier_tree.tree.root },
                { C::execution_prev_nullifier_tree_size,
                  ex_event.before_context_event.tree_states.nullifier_tree.tree.next_available_leaf_index },
                { C::execution_prev_num_nullifiers_emitted,
                  ex_event.before_context_event.tree_states.nullifier_tree.counter },
                { C::execution_nullifier_tree_root, ex_event.after_context_event.tree_states.nullifier_tree.tree.root },
                { C::execution_nullifier_tree_size,
                  ex_event.after_context_event.tree_states.nullifier_tree.tree.next_available_leaf_index },
                { C::execution_num_nullifiers_emitted,
                  ex_event.after_context_event.tree_states.nullifier_tree.counter },
                // Context - tree states - Public data tree
                { C::execution_prev_public_data_tree_root,
                  ex_event.before_context_event.tree_states.public_data_tree.tree.root },
                { C::execution_prev_public_data_tree_size,
                  ex_event.before_context_event.tree_states.public_data_tree.tree.next_available_leaf_index },
                { C::execution_public_data_tree_root,
                  ex_event.after_context_event.tree_states.public_data_tree.tree.root },
                { C::execution_public_data_tree_size,
                  ex_event.after_context_event.tree_states.public_data_tree.tree.next_available_leaf_index },
                // Context - tree states - Note hash tree
                { C::execution_prev_note_hash_tree_root,
                  ex_event.before_context_event.tree_states.note_hash_tree.tree.root },
                { C::execution_prev_note_hash_tree_size,
                  ex_event.before_context_event.tree_states.note_hash_tree.tree.next_available_leaf_index },
                { C::execution_prev_num_note_hashes_emitted,
                  ex_event.before_context_event.tree_states.note_hash_tree.counter },
                { C::execution_note_hash_tree_root, ex_event.after_context_event.tree_states.note_hash_tree.tree.root },
                { C::execution_note_hash_tree_size,
                  ex_event.after_context_event.tree_states.note_hash_tree.tree.next_available_leaf_index },
                { C::execution_num_note_hashes_emitted,
                  ex_event.after_context_event.tree_states.note_hash_tree.counter },
                // Context - tree states - L1 to L2 message tree
                { C::execution_l1_l2_tree_root,
                  ex_event.after_context_event.tree_states.l1_to_l2_message_tree.tree.root },
                // Context - tree states - Retrieved bytecodes tree
                { C::execution_prev_retrieved_bytecodes_tree_root,
                  ex_event.before_context_event.retrieved_bytecodes_tree_snapshot.root },
                { C::execution_prev_retrieved_bytecodes_tree_size,
                  ex_event.before_context_event.retrieved_bytecodes_tree_snapshot.next_available_leaf_index },
                { C::execution_retrieved_bytecodes_tree_root,
                  ex_event.after_context_event.retrieved_bytecodes_tree_snapshot.root },
                { C::execution_retrieved_bytecodes_tree_size,
                  ex_event.after_context_event.retrieved_bytecodes_tree_snapshot.next_available_leaf_index },
                // Context - side effects
                { C::execution_prev_num_unencrypted_log_fields, ex_event.before_context_event.numUnencryptedLogFields },
                { C::execution_num_unencrypted_log_fields, ex_event.after_context_event.numUnencryptedLogFields },
                { C::execution_prev_num_l2_to_l1_messages, ex_event.before_context_event.numL2ToL1Messages },
                { C::execution_num_l2_to_l1_messages, ex_event.after_context_event.numL2ToL1Messages },
                // Helpers for identifying parent context
                { C::execution_has_parent_ctx, has_parent ? 1 : 0 },
                { C::execution_is_parent_id_inv, ex_event.after_context_event.parent_id }, // Will be inverted in batch.
            } });

        // Internal stack
        trace.set(row,
                  { {
                      { C::execution_internal_call_id, ex_event.before_context_event.internal_call_id },
                      { C::execution_internal_call_return_id, ex_event.before_context_event.internal_call_return_id },
                      { C::execution_next_internal_call_id, ex_event.before_context_event.next_internal_call_id },
                  } });

        /**************************************************************************************************
         *  Temporality group 1: Bytecode retrieval.
         **************************************************************************************************/

        const bool bytecode_retrieval_failed = ex_event.error == ExecutionError::BYTECODE_RETRIEVAL;
        const bool sel_first_row_in_context = prev_row_was_enter_call || is_first_event_in_enqueued_call;
        trace.set(row,
                  { {
                      { C::execution_sel_first_row_in_context, sel_first_row_in_context ? 1 : 0 },
                      { C::execution_sel_bytecode_retrieval_failure, bytecode_retrieval_failed ? 1 : 0 },
                      { C::execution_sel_bytecode_retrieval_success, !bytecode_retrieval_failed ? 1 : 0 },
                      { C::execution_bytecode_id, ex_event.after_context_event.bytecode_id },
                  } });

        /**************************************************************************************************
         *  Temporality group 2: Instruction fetching. Mapping from wire to execution and addressing.
         **************************************************************************************************/

        // This will only have a value if instruction fetching succeeded.
        std::optional<ExecutionOpCode> exec_opcode;
        const bool error_in_instruction_fetching = ex_event.error == ExecutionError::INSTRUCTION_FETCHING;
        const bool instruction_fetching_success = !bytecode_retrieval_failed && !error_in_instruction_fetching;
        trace.set(C::execution_sel_instruction_fetching_failure, row, error_in_instruction_fetching ? 1 : 0);

        if (instruction_fetching_success) {
            exec_opcode = ex_event.wire_instruction.get_exec_opcode();
            process_instr_fetching(ex_event.wire_instruction, trace, row);

            // If we fetched an instruction successfully, we can set the next PC.
            // In circuit, we enforce next_pc to be pc + instr_length, but in simulation,
            // we set next_pc (as member of the context) to be the real pc of the next instruction
            // which is different for JUMP, JUMPI, INTERNALCALL, and INTERNALRETURN.
            // Therefore, we must not use after_context_event.pc (which is simulation next_pc) to set
            // C::execution_next_pc.
            trace.set(row,
                      { {
                          { C::execution_next_pc,
                            static_cast<uint32_t>(ex_event.before_context_event.pc +
                                                  ex_event.wire_instruction.size_in_bytes()) },
                      } });

            // Along this function we need to set the info we get from the #[EXEC_SPEC_READ] lookup.
            process_execution_spec(ex_event, trace, row);

            process_addressing(ex_event.addressing_event, ex_event.wire_instruction, trace, row);
        }

        const bool addressing_failed = ex_event.error == ExecutionError::ADDRESSING;

        /**************************************************************************************************
         *  Temporality group 3: Registers read.
         **************************************************************************************************/

        // Note that if addressing did not fail, register reading will not fail.
        std::array<MemoryValue, AVM_MAX_REGISTERS> registers;
        std::ranges::fill(registers, MemoryValue::from_tag(static_cast<MemoryTag>(0), 0));
        const bool should_process_registers = instruction_fetching_success && !addressing_failed;
        const bool register_processing_failed = ex_event.error == ExecutionError::REGISTER_READ;
        if (should_process_registers) {
            process_registers(
                *exec_opcode, ex_event.inputs, ex_event.output, registers, register_processing_failed, trace, row);
        }

        /**************************************************************************************************
         *  Temporality group 4: Gas (both base and dynamic).
         **************************************************************************************************/

        const bool should_check_gas = should_process_registers && !register_processing_failed;
        if (should_check_gas) {
            process_gas(ex_event.gas_event, *exec_opcode, trace, row);

            // To_Radix Dynamic Gas Factor related selectors.
            // We need the register information to compute dynamic gas factor and process_gas() does not have
            // access to it and nor should it.
            if (*exec_opcode == ExecutionOpCode::TORADIXBE) {
                uint32_t radix = ex_event.inputs[1].as<uint32_t>();     // Safe since already tag checked
                uint32_t num_limbs = ex_event.inputs[2].as<uint32_t>(); // Safe since already tag checked
                uint32_t num_p_limbs = radix > 256 ? 32 : static_cast<uint32_t>(get_p_limbs_per_radix_size(radix));
                trace.set(row,
                          { {
                              // To Radix BE Dynamic Gas
                              { C::execution_two_five_six, 256 },
                              { C::execution_sel_radix_gt_256, radix > 256 ? 1 : 0 },
                              { C::execution_sel_lookup_num_p_limbs, radix <= 256 ? 1 : 0 },
                              { C::execution_num_p_limbs, num_p_limbs },
                              { C::execution_sel_use_num_limbs, num_limbs > num_p_limbs ? 1 : 0 },
                              // Don't set dyn gas factor here since already set in process_gas
                          } });
            }
        }

        const bool oog = ex_event.error == ExecutionError::GAS;
        /**************************************************************************************************
         *  Temporality group 5: Opcode execution.
         **************************************************************************************************/

        const bool should_execute_opcode = should_check_gas && !oog;

        // These booleans are used after of the "opcode code execution" block but need
        // to be set as part of the "opcode code execution" block.
        bool sel_enter_call = false;
        bool sel_exit_call = false;
        bool should_execute_revert = false;

        const bool opcode_execution_failed = ex_event.error == ExecutionError::OPCODE_EXECUTION;
        if (should_execute_opcode) {
            // At this point we can assume instruction fetching succeeded, so this should never fail.
            const auto& dispatch_to_subtrace = get_subtrace_info_map().at(*exec_opcode);
            trace.set(row,
                      { {
                          { C::execution_sel_should_execute_opcode, 1 },
                          { C::execution_sel_opcode_error, opcode_execution_failed ? 1 : 0 },
                          { get_subtrace_selector(dispatch_to_subtrace.subtrace_selector), 1 },
                      } });

            // Execution Trace opcodes - separating for clarity
            if (dispatch_to_subtrace.subtrace_selector == SubtraceSel::EXECUTION) {
                trace.set(get_execution_opcode_selector(*exec_opcode), row, 1);
            }

            // Execution trace opcodes specific logic.
            // Note that the opcode selectors were set above. (e.g., sel_execute_call, sel_execute_static_call, ..).
            if (*exec_opcode == ExecutionOpCode::CALL || *exec_opcode == ExecutionOpCode::STATICCALL) {
                sel_enter_call = true;

                const Gas gas_left = ex_event.after_context_event.gas_limit - ex_event.after_context_event.gas_used;

                uint32_t allocated_l2_gas = registers[0].as<uint32_t>();
                bool is_l2_gas_left_gt_allocated = gas_left.l2_gas > allocated_l2_gas;

                uint32_t allocated_da_gas = registers[1].as<uint32_t>();
                bool is_da_gas_left_gt_allocated = gas_left.da_gas > allocated_da_gas;

                trace.set(row,
                          { {
                              { C::execution_sel_enter_call, 1 },
                              { C::execution_l2_gas_left, gas_left.l2_gas },
                              { C::execution_da_gas_left, gas_left.da_gas },
                              { C::execution_is_l2_gas_left_gt_allocated, is_l2_gas_left_gt_allocated ? 1 : 0 },
                              { C::execution_is_da_gas_left_gt_allocated, is_da_gas_left_gt_allocated ? 1 : 0 },
                          } });
            } else if (*exec_opcode == ExecutionOpCode::RETURN) {
                sel_exit_call = true;
                trace.set(row,
                          { {
                              { C::execution_nested_return, has_parent ? 1 : 0 },
                          } });
            } else if (*exec_opcode == ExecutionOpCode::REVERT) {
                sel_exit_call = true;
                should_execute_revert = true;
            } else if (exec_opcode == ExecutionOpCode::GETENVVAR) {
                BB_ASSERT_EQ(ex_event.addressing_event.resolution_info.size(),
                             static_cast<size_t>(2),
                             "GETENVVAR should have exactly two resolved operands (envvar enum and output)");
                // rop[1] is the envvar enum
                Operand envvar_enum = ex_event.addressing_event.resolution_info[1].resolved_operand;
                process_get_env_var_opcode(envvar_enum, ex_event.output, trace, row);
            } else if (*exec_opcode == ExecutionOpCode::INTERNALRETURN) {
                if (!opcode_execution_failed) {
                    // If we have an opcode error, we don't need to compute the inverse (see internal_call.pil)
                    trace.set(
                        C::execution_internal_call_return_id_inv,
                        row,
                        ex_event.before_context_event.internal_call_return_id); // Will be inverted in batch later.
                    trace.set(C::execution_sel_read_unwind_call_stack, row, 1);
                }
            } else if (*exec_opcode == ExecutionOpCode::SSTORE) {
                // Equivalent to PIL's (MAX + INITIAL_SIZE - prev_written_public_data_slots_tree_size)
                // since prev_size = counter + 1 and INITIAL_SIZE = 1.
                uint32_t remaining_data_writes = MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX -
                                                 ex_event.before_context_event.tree_states.public_data_tree.counter;

                trace.set(row,
                          { {
                              { C::execution_max_data_writes_reached, remaining_data_writes == 0 },
                              { C::execution_remaining_data_writes_inv,
                                remaining_data_writes }, // Will be inverted in batch later.
                              { C::execution_sel_write_public_data, !opcode_execution_failed },
                          } });
            } else if (*exec_opcode == ExecutionOpCode::NOTEHASHEXISTS) {
                uint64_t leaf_index = registers[1].as<uint64_t>();
                uint64_t note_hash_tree_leaf_count = NOTE_HASH_TREE_LEAF_COUNT;
                bool note_hash_leaf_in_range = leaf_index < note_hash_tree_leaf_count;

                trace.set(row,
                          { {
                              { C::execution_note_hash_leaf_in_range, note_hash_leaf_in_range },
                              { C::execution_note_hash_tree_leaf_count, FF(note_hash_tree_leaf_count) },
                          } });
            } else if (*exec_opcode == ExecutionOpCode::EMITNOTEHASH) {
                uint32_t remaining_note_hashes =
                    MAX_NOTE_HASHES_PER_TX - ex_event.before_context_event.tree_states.note_hash_tree.counter;

                trace.set(row,
                          { {
                              { C::execution_sel_reached_max_note_hashes, remaining_note_hashes == 0 },
                              { C::execution_remaining_note_hashes_inv,
                                remaining_note_hashes }, // Will be inverted in batch later.
                              { C::execution_sel_write_note_hash, !opcode_execution_failed },
                          } });
            } else if (*exec_opcode == ExecutionOpCode::L1TOL2MSGEXISTS) {
                uint64_t leaf_index = registers[1].as<uint64_t>();
                uint64_t l1_to_l2_msg_tree_leaf_count = L1_TO_L2_MSG_TREE_LEAF_COUNT;
                bool l1_to_l2_msg_leaf_in_range = leaf_index < l1_to_l2_msg_tree_leaf_count;

                trace.set(row,
                          { {
                              { C::execution_l1_to_l2_msg_leaf_in_range, l1_to_l2_msg_leaf_in_range },
                              { C::execution_l1_to_l2_msg_tree_leaf_count, FF(l1_to_l2_msg_tree_leaf_count) },
                          } });
                //} else if (exec_opcode == ExecutionOpCode::NULLIFIEREXISTS) {
                // no custom columns!
            } else if (*exec_opcode == ExecutionOpCode::EMITNULLIFIER) {
                uint32_t remaining_nullifiers =
                    MAX_NULLIFIERS_PER_TX - ex_event.before_context_event.tree_states.nullifier_tree.counter;

                trace.set(row,
                          { {
                              { C::execution_sel_reached_max_nullifiers, remaining_nullifiers == 0 },
                              { C::execution_remaining_nullifiers_inv,
                                remaining_nullifiers }, // Will be inverted in batch later.
                              { C::execution_sel_write_nullifier,
                                remaining_nullifiers != 0 && !ex_event.before_context_event.is_static },
                          } });
            } else if (*exec_opcode == ExecutionOpCode::SENDL2TOL1MSG) {
                uint32_t remaining_l2_to_l1_msgs =
                    MAX_L2_TO_L1_MSGS_PER_TX - ex_event.before_context_event.numL2ToL1Messages;

                trace.set(row,
                          { { { C::execution_sel_l2_to_l1_msg_limit_error, remaining_l2_to_l1_msgs == 0 },
                              { C::execution_remaining_l2_to_l1_msgs_inv,
                                remaining_l2_to_l1_msgs }, // Will be inverted in batch later.
                              { C::execution_sel_write_l2_to_l1_msg, !opcode_execution_failed && !is_discarding() },
                              {
                                  C::execution_public_inputs_index,
                                  AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX +
                                      ex_event.before_context_event.numL2ToL1Messages,
                              } } });
            }
        }

        /**************************************************************************************************
         *  Temporality group 6: Register write.
         **************************************************************************************************/

        const bool should_process_register_write = should_execute_opcode && !opcode_execution_failed;
        if (should_process_register_write) {
            process_registers_write(*exec_opcode, trace, row);
        }

        /**************************************************************************************************
         *  Discarding and error related selectors.
         **************************************************************************************************/

        const bool is_dying_context = ex_event.after_context_event.id == dying_context_id;
        // Need to generate the item below for checking "is dying context" in circuit
        // No need to condition by `!is_dying_context` as batch inversion skips 0.
        const FF dying_context_diff = FF(ex_event.after_context_event.id) - FF(dying_context_id);

        // This is here instead of guarded by `should_execute_opcode` because is_err is a higher level error
        // than just an opcode error (i.e., it is on if there are any errors in any temporality group).
        const bool is_err = ex_event.error != ExecutionError::NONE;
        sel_exit_call = sel_exit_call || is_err; // sel_execute_revert || sel_execute_return || sel_error
        const bool is_failure = should_execute_revert || is_err;
        const bool nested_exit_call = sel_exit_call && has_parent;
        const bool enqueued_call_end = sel_exit_call && !has_parent;
        const bool nested_failure = is_failure && has_parent;

        trace.set(row,
                  { {
                      { C::execution_sel_exit_call, sel_exit_call ? 1 : 0 },
                      { C::execution_nested_exit_call, nested_exit_call ? 1 : 0 },
                      { C::execution_nested_failure, nested_failure ? 1 : 0 },
                      { C::execution_sel_error, is_err ? 1 : 0 },
                      { C::execution_sel_failure, is_failure ? 1 : 0 },
                      { C::execution_discard, is_discarding() ? 1 : 0 },
                      { C::execution_dying_context_id, dying_context_id },
                      { C::execution_dying_context_id_inv, dying_context_id }, // Will be inverted in batch.
                      { C::execution_is_dying_context, is_dying_context ? 1 : 0 },
                      { C::execution_dying_context_diff_inv, dying_context_diff }, // Will be inverted in batch.
                      { C::execution_enqueued_call_end, enqueued_call_end ? 1 : 0 },
                  } });

        // Trace-generation is done for this event.
        // Now, use this event to determine whether we should set/reset the discard flag for the NEXT event.
        // Note: is_failure implies discard is true.
        const bool event_kills_dying_context = is_failure && is_dying_context;

        if (event_kills_dying_context) {
            // Set/unset discard flag if the current event is the one that kills the dying context
            dying_context_id = 0;
        } else if (sel_enter_call && !is_discarding() &&
                   failures.does_context_fail.contains(ex_event.next_context_id)) {
            // If making a nested call, and discard isn't already high...
            // if the nested context being entered eventually dies, we set which context is dying (implicitly raise
            // discard flag). NOTE: If a [STATIC]CALL instruction _itself_ errors, we don't set the discard flag
            // because we aren't actually entering a new context. This is already captured by `sel_enter_call`
            // boolean which is set to true only during opcode execution temporality group which cannot
            // fail for CALL/STATICALL.
            dying_context_id = ex_event.next_context_id;
        }
        // Otherwise, we aren't entering or exiting a dying context,
        // so just propagate discard and dying context.
        // Implicit: dying_context_id = dying_context_id; discard = discard;

        // If an enqueued call just exited, next event (if any) is the first in an enqueued call.
        // Update flag for next iteration.
        is_first_event_in_enqueued_call = !has_parent && sel_exit_call;

        // Track this bool for use determining whether the next row is the first in a context
        prev_row_was_enter_call = sel_enter_call;

        row++;
    }

    // Batch invert the columns.
    invert_columns(trace);
}

void ExecutionTraceBuilder::process_instr_fetching(const simulation::Instruction& instruction,
                                                   TraceContainer& trace,
                                                   uint32_t row)
{
    trace.set(row,
              { {
                  { C::execution_sel_instruction_fetching_success, 1 },
                  { C::execution_ex_opcode, static_cast<uint8_t>(instruction.get_exec_opcode()) },
                  { C::execution_addressing_mode, instruction.addressing_mode },
                  { C::execution_instr_length, instruction.size_in_bytes() },
              } });

    // At this point we can assume instruction fetching succeeded.
    auto operands = instruction.operands;
    BB_ASSERT_LTE(operands.size(), static_cast<size_t>(AVM_MAX_OPERANDS), "Operands size is out of range");
    operands.resize(AVM_MAX_OPERANDS, Operand::from<FF>(0));

    for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
        trace.set(OPERAND_COLUMNS[i], row, operands.at(i));
    }
}

void ExecutionTraceBuilder::process_execution_spec(const simulation::ExecutionEvent& ex_event,
                                                   TraceContainer& trace,
                                                   uint32_t row)
{
    // At this point we can assume instruction fetching succeeded, so this should never fail.
    ExecutionOpCode exec_opcode = ex_event.wire_instruction.get_exec_opcode();
    const auto& exec_spec = get_exec_instruction_spec().at(exec_opcode);
    const auto& gas_cost = exec_spec.gas_cost;

    // Gas.
    trace.set(row,
              { {
                  { C::execution_opcode_gas, gas_cost.opcode_gas },
                  { C::execution_base_da_gas, gas_cost.base_da },
                  { C::execution_dynamic_l2_gas, gas_cost.dyn_l2 },
                  { C::execution_dynamic_da_gas, gas_cost.dyn_da },
              } });

    const auto& register_info = exec_spec.register_info;
    for (size_t i = 0; i < AVM_MAX_REGISTERS; i++) {
        trace.set(row,
                  { {
                      { REGISTER_IS_WRITE_COLUMNS[i], register_info.is_write(i) ? 1 : 0 },
                      { REGISTER_MEM_OP_COLUMNS[i], register_info.is_active(i) ? 1 : 0 },
                      { REGISTER_EXPECTED_TAG_COLUMNS[i],
                        register_info.need_tag_check(i) ? static_cast<uint32_t>(*(register_info.expected_tag(i))) : 0 },
                      { REGISTER_TAG_CHECK_COLUMNS[i], register_info.need_tag_check(i) ? 1 : 0 },
                  } });
    }

    // Set is_address columns
    const auto& num_addresses = exec_spec.num_addresses;
    for (size_t i = 0; i < num_addresses; i++) {
        trace.set(OPERAND_IS_ADDRESS_COLUMNS[i], row, 1);
    }

    // At this point we can assume instruction fetching succeeded, so this should never fail.
    const auto& dispatch_to_subtrace = get_subtrace_info_map().at(exec_opcode);
    trace.set(row,
              { {
                  { C::execution_subtrace_id, get_subtrace_id(dispatch_to_subtrace.subtrace_selector) },
                  { C::execution_subtrace_operation_id, dispatch_to_subtrace.subtrace_operation_id },
                  { C::execution_dyn_gas_id, exec_spec.dyn_gas_id },
              } });
}

void ExecutionTraceBuilder::process_gas(const simulation::GasEvent& gas_event,
                                        ExecutionOpCode exec_opcode,
                                        TraceContainer& trace,
                                        uint32_t row)
{
    bool oog = gas_event.oog_l2 || gas_event.oog_da;
    trace.set(row,
              { {
                  { C::execution_sel_should_check_gas, 1 },
                  { C::execution_out_of_gas_l2, gas_event.oog_l2 ? 1 : 0 },
                  { C::execution_out_of_gas_da, gas_event.oog_da ? 1 : 0 },
                  { C::execution_sel_out_of_gas, oog ? 1 : 0 },
                  // Addressing gas.
                  { C::execution_addressing_gas, gas_event.addressing_gas },
                  // Dynamic gas.
                  { C::execution_dynamic_l2_gas_factor, gas_event.dynamic_gas_factor.l2_gas },
                  { C::execution_dynamic_da_gas_factor, gas_event.dynamic_gas_factor.da_gas },
                  // Derived cumulative gas used.
                  { C::execution_total_gas_l2, gas_event.total_gas_used_l2 },
                  { C::execution_total_gas_da, gas_event.total_gas_used_da },
              } });

    const auto& exec_spec = get_exec_instruction_spec().at(exec_opcode);
    if (exec_spec.dyn_gas_id != 0) {
        trace.set(get_dyn_gas_selector(exec_spec.dyn_gas_id), row, 1);
    }
}

void ExecutionTraceBuilder::process_addressing(const simulation::AddressingEvent& addr_event,
                                               const simulation::Instruction& instruction,
                                               TraceContainer& trace,
                                               uint32_t row)
{
    // At this point we can assume instruction fetching succeeded, so this should never fail.
    ExecutionOpCode exec_opcode = instruction.get_exec_opcode();
    const ExecInstructionSpec& ex_spec = get_exec_instruction_spec().at(exec_opcode);

    auto resolution_info_vec = addr_event.resolution_info;
    BB_ASSERT_LTE(
        resolution_info_vec.size(), static_cast<size_t>(AVM_MAX_OPERANDS), "Resolution info size is out of range");
    // Pad with default values for the missing operands.
    resolution_info_vec.resize(AVM_MAX_OPERANDS,
                               {
                                   // This is the default we want: both tag and value 0.
                                   .after_relative = FF::zero(),
                                   .resolved_operand = Operand::from_tag(static_cast<ValueTag>(0), 0),
                                   .error = std::nullopt,
                               });

    std::array<bool, AVM_MAX_OPERANDS> should_apply_indirection{};
    std::array<bool, AVM_MAX_OPERANDS> is_relative{};
    std::array<bool, AVM_MAX_OPERANDS> is_indirect{};
    std::array<bool, AVM_MAX_OPERANDS> is_relative_effective{};
    std::array<bool, AVM_MAX_OPERANDS> is_indirect_effective{};
    std::array<bool, AVM_MAX_OPERANDS> relative_oob{};
    std::array<FF, AVM_MAX_OPERANDS> after_relative{};
    std::array<FF, AVM_MAX_OPERANDS> resolved_operand{};
    std::array<uint8_t, AVM_MAX_OPERANDS> resolved_operand_tag{};
    uint8_t num_relative_operands = 0;

    // The error about the base address being invalid is stored in every resolution_info member when it happens.
    bool base_address_invalid = resolution_info_vec[0].error.has_value() &&
                                *resolution_info_vec[0].error == AddressingEventError::BASE_ADDRESS_INVALID;
    bool do_base_check = false; // Whether we need to retrieve the base address,
                                // i.e., at least one operand is relative.

    // Gather operand information.
    for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
        const auto& resolution_info = resolution_info_vec[i];
        bool op_is_address = i < ex_spec.num_addresses;
        relative_oob[i] = resolution_info.error.has_value() &&
                          *resolution_info.error == AddressingEventError::RELATIVE_COMPUTATION_OOB;
        is_relative[i] = is_operand_relative(instruction.addressing_mode, i);
        is_indirect[i] = is_operand_indirect(instruction.addressing_mode, i);
        is_relative_effective[i] = op_is_address && is_relative[i];
        is_indirect_effective[i] = op_is_address && is_indirect[i];
        should_apply_indirection[i] = is_indirect_effective[i] && !relative_oob[i] && !base_address_invalid;
        resolved_operand_tag[i] = static_cast<uint8_t>(resolution_info.resolved_operand.get_tag());
        after_relative[i] = resolution_info.after_relative;
        resolved_operand[i] = resolution_info.resolved_operand;
        if (is_relative_effective[i]) {
            do_base_check = true;
            num_relative_operands++;
        }
    }

    BB_ASSERT(do_base_check || !base_address_invalid, "Base address is invalid but we are not checking it.");

    // Set the operand columns.
    for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
        trace.set(row,
                  { {
                      { OPERAND_IS_RELATIVE_WIRE_COLUMNS[i], is_relative[i] ? 1 : 0 },
                      { OPERAND_IS_INDIRECT_WIRE_COLUMNS[i], is_indirect[i] ? 1 : 0 },
                      { OPERAND_RELATIVE_OVERFLOW_COLUMNS[i], relative_oob[i] ? 1 : 0 },
                      { OPERAND_AFTER_RELATIVE_COLUMNS[i], after_relative[i] },
                      { OPERAND_SHOULD_APPLY_INDIRECTION_COLUMNS[i], should_apply_indirection[i] ? 1 : 0 },
                      { OPERAND_IS_RELATIVE_VALID_BASE_COLUMNS[i],
                        (is_relative_effective[i] && !base_address_invalid) ? 1 : 0 },
                      { RESOLVED_OPERAND_COLUMNS[i], resolved_operand[i] },
                      { RESOLVED_OPERAND_TAG_COLUMNS[i], resolved_operand_tag[i] },
                  } });
    }

    // We need to compute relative and indirect over the whole 16 bits of the indirect flag.
    // See comment in PIL file about indirect upper bits.
    for (size_t i = AVM_MAX_OPERANDS; i < TOTAL_INDIRECT_BITS / 2; i++) {
        bool is_relative = is_operand_relative(instruction.addressing_mode, i);
        bool is_indirect = is_operand_indirect(instruction.addressing_mode, i);
        trace.set(row,
                  { {
                      { OPERAND_IS_RELATIVE_WIRE_COLUMNS[i], is_relative ? 1 : 0 },
                      { OPERAND_IS_INDIRECT_WIRE_COLUMNS[i], is_indirect ? 1 : 0 },
                  } });
    }

    // Inverse of following difference is required when base address is invalid.
    FF base_address_tag_diff = base_address_invalid ? FF(static_cast<uint8_t>(addr_event.base_address.get_tag())) -
                                                          FF(static_cast<uint8_t>(MemoryTag::U32))
                                                    : 0;

    // Tag check after indirection.
    bool some_final_check_failed = std::ranges::any_of(addr_event.resolution_info, [](const auto& info) {
        return info.error.has_value() && *info.error == AddressingEventError::INVALID_ADDRESS_AFTER_INDIRECTION;
    });
    FF batched_tags_diff = 0;
    if (some_final_check_failed) {
        FF power_of_2 = 1;
        for (size_t i = 0; i < AVM_MAX_OPERANDS; ++i) {
            if (should_apply_indirection[i]) {
                batched_tags_diff += power_of_2 * (FF(resolved_operand_tag[i]) - FF(MEM_TAG_U32));
            }
            power_of_2 *= 8; // 2^3
        }
    }

    // Collect addressing errors. See PIL file for reference.
    bool addressing_failed =
        std::ranges::any_of(addr_event.resolution_info, [](const auto& info) { return info.error.has_value(); });
    FF addressing_error_collection =
        addressing_failed
            ? FF(
                  // Base address invalid.
                  (base_address_invalid ? 1 : 0) +
                  // Relative overflow.
                  std::accumulate(addr_event.resolution_info.begin(),
                                  addr_event.resolution_info.end(),
                                  static_cast<uint32_t>(0),
                                  [](uint32_t acc, const auto& info) {
                                      return acc +
                                             (info.error.has_value() &&
                                                      *info.error == AddressingEventError::RELATIVE_COMPUTATION_OOB
                                                  ? 1
                                                  : 0);
                                  }) +
                  // Some invalid address after indirection.
                  (some_final_check_failed ? 1 : 0))
            : 0;

    trace.set(
        row,
        { {
            { C::execution_sel_addressing_error, addressing_failed ? 1 : 0 },
            { C::execution_addressing_error_collection_inv, addressing_error_collection }, // Will be inverted in batch.
            { C::execution_base_address_val, addr_event.base_address.as_ff() },
            { C::execution_base_address_tag, static_cast<uint8_t>(addr_event.base_address.get_tag()) },
            { C::execution_base_address_tag_diff_inv, base_address_tag_diff }, // Will be inverted in batch.
            { C::execution_batched_tags_diff_inv, batched_tags_diff },         // Will be inverted in batch.
            { C::execution_sel_some_final_check_failed, some_final_check_failed ? 1 : 0 },
            { C::execution_sel_base_address_failure, base_address_invalid ? 1 : 0 },
            { C::execution_num_relative_operands_inv, num_relative_operands }, // Will be inverted in batch later.
            { C::execution_sel_do_base_check, do_base_check ? 1 : 0 },
            { C::execution_highest_address, AVM_HIGHEST_MEM_ADDRESS },
        } });
}

void ExecutionTraceBuilder::invert_columns(TraceContainer& trace)
{
    trace.invert_columns({ {
        // Registers.
        C::execution_batched_tags_diff_inv_reg,
        // Context.
        C::execution_is_parent_id_inv,
        C::execution_internal_call_return_id_inv,
        // Trees.
        C::execution_remaining_data_writes_inv,
        C::execution_remaining_note_hashes_inv,
        C::execution_remaining_nullifiers_inv,
        // L1ToL2MsgExists.
        C::execution_remaining_l2_to_l1_msgs_inv,
        // Discard.
        C::execution_dying_context_id_inv,
        C::execution_dying_context_diff_inv,
        // Addressing.
        C::execution_addressing_error_collection_inv,
        C::execution_batched_tags_diff_inv,
        C::execution_base_address_tag_diff_inv,
        C::execution_num_relative_operands_inv,
    } });
}

void ExecutionTraceBuilder::process_registers(ExecutionOpCode exec_opcode,
                                              const std::vector<MemoryValue>& inputs,
                                              const MemoryValue& output,
                                              std::span<MemoryValue> registers,
                                              bool register_processing_failed,
                                              TraceContainer& trace,
                                              uint32_t row)
{
    BB_ASSERT_EQ(registers.size(), static_cast<size_t>(AVM_MAX_REGISTERS), "Registers size is out of range");
    // At this point we can assume instruction fetching succeeded, so this should never fail.
    const auto& register_info = get_exec_instruction_spec().at(exec_opcode).register_info;

    // Registers. We set all of them here, even the write ones. This is fine because
    // if an error occured before the register write group, simulation would pass the default
    // value-tag (0, 0). Furthermore, the permutation of the memory write would not be activated.
    size_t input_counter = 0;
    for (uint8_t i = 0; i < AVM_MAX_REGISTERS; ++i) {
        if (register_info.is_active(i)) {
            if (register_info.is_write(i)) {
                // If this is a write operation, we need to get the value from the output.
                registers[i] = output;
            } else {
                // If this is a read operation, we need to get the value from the input.

                // Register specifications must be consistent with the number of inputs.
                BB_ASSERT(inputs.size() > input_counter, "Not enough inputs for register read");

                registers[i] = inputs.at(input_counter);
                input_counter++;
            }
        }
    }

    for (size_t i = 0; i < AVM_MAX_REGISTERS; i++) {
        trace.set(REGISTER_COLUMNS[i], row, registers[i]);
        trace.set(REGISTER_MEM_TAG_COLUMNS[i], row, static_cast<uint8_t>(registers[i].get_tag()));
        // This one is special because it sets the reads (but not the writes).
        // If we got here, sel_should_read_registers=1.
        if (register_info.is_active(i) && !register_info.is_write(i)) {
            trace.set(REGISTER_OP_REG_EFFECTIVE_COLUMNS[i], row, 1);
        }
    }

    FF batched_tags_diff_reg = 0;
    if (register_processing_failed) {
        FF power_of_2 = 1;
        for (size_t i = 0; i < AVM_MAX_REGISTERS; ++i) {
            if (register_info.need_tag_check(i)) {
                batched_tags_diff_reg += power_of_2 * (FF(static_cast<uint8_t>(registers[i].get_tag())) -
                                                       FF(static_cast<uint8_t>(*register_info.expected_tag(i))));
            }
            power_of_2 *= 8; // 2^3
        }
    }

    trace.set(row,
              { {
                  { C::execution_sel_should_read_registers, 1 },
                  { C::execution_batched_tags_diff_inv_reg, batched_tags_diff_reg }, // Will be inverted in batch.
                  { C::execution_sel_register_read_error, register_processing_failed ? 1 : 0 },
              } });
}

void ExecutionTraceBuilder::process_registers_write(ExecutionOpCode exec_opcode, TraceContainer& trace, uint32_t row)
{
    const auto& register_info = get_exec_instruction_spec().at(exec_opcode).register_info;
    trace.set(C::execution_sel_should_write_registers, row, 1);

    for (size_t i = 0; i < AVM_MAX_REGISTERS; i++) {
        // This one is special because it sets the writes.
        // If we got here, sel_should_write_registers=1.
        if (register_info.is_active(i) && register_info.is_write(i)) {
            trace.set(REGISTER_OP_REG_EFFECTIVE_COLUMNS[i], row, 1);
        }
    }
}

void ExecutionTraceBuilder::process_get_env_var_opcode(Operand envvar_enum,
                                                       MemoryValue output,
                                                       TraceContainer& trace,
                                                       uint32_t row)
{
    BB_ASSERT_EQ(envvar_enum.get_tag(), ValueTag::U8, "Envvar enum tag is not U8");
    const auto& envvar_spec = GetEnvVarSpec::get_table(envvar_enum.as<uint8_t>());

    trace.set(row,
              { {
                  { C::execution_sel_execute_get_env_var, 1 },
                  { C::execution_sel_envvar_pi_lookup_col0, envvar_spec.envvar_pi_lookup_col0 ? 1 : 0 },
                  { C::execution_sel_envvar_pi_lookup_col1, envvar_spec.envvar_pi_lookup_col1 ? 1 : 0 },
                  { C::execution_envvar_pi_row_idx, envvar_spec.envvar_pi_row_idx },
                  { C::execution_is_address, envvar_spec.is_address ? 1 : 0 },
                  { C::execution_is_sender, envvar_spec.is_sender ? 1 : 0 },
                  { C::execution_is_transactionfee, envvar_spec.is_transactionfee ? 1 : 0 },
                  { C::execution_is_isstaticcall, envvar_spec.is_isstaticcall ? 1 : 0 },
                  { C::execution_is_l2gasleft, envvar_spec.is_l2gasleft ? 1 : 0 },
                  { C::execution_is_dagasleft, envvar_spec.is_dagasleft ? 1 : 0 },
                  { C::execution_value_from_pi,
                    envvar_spec.envvar_pi_lookup_col0 || envvar_spec.envvar_pi_lookup_col1 ? output.as_ff() : 0 },
                  { C::execution_mem_tag_reg_0_, envvar_spec.out_tag },
              } });
}

const InteractionDefinition ExecutionTraceBuilder::interactions =
    InteractionDefinition()
        // Execution specification (precomputed)
        .add<lookup_execution_exec_spec_read_settings, InteractionType::LookupIntoIndexedByClk>()
        // Bytecode retrieval
        .add<lookup_execution_bytecode_retrieval_result_settings, InteractionType::LookupGeneric>()
        // Instruction fetching
        .add<lookup_execution_instruction_fetching_result_settings, InteractionType::LookupGeneric>()
        .add<lookup_execution_instruction_fetching_body_settings, InteractionType::LookupGeneric>()
        // Addressing
        .add<lookup_addressing_relative_overflow_result_0_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_addressing_relative_overflow_result_1_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_addressing_relative_overflow_result_2_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_addressing_relative_overflow_result_3_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_addressing_relative_overflow_result_4_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_addressing_relative_overflow_result_5_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_addressing_relative_overflow_result_6_settings, InteractionType::LookupGeneric>(C::gt_sel)
        // Internal Call Stack
        .add<perm_internal_call_push_call_stack_settings_, InteractionType::Permutation>()
        .add<lookup_internal_call_unwind_call_stack_settings_, InteractionType::LookupGeneric>()
        // Gas
        .add<lookup_gas_addressing_gas_read_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_gas_is_out_of_gas_l2_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_gas_is_out_of_gas_da_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_execution_dyn_l2_factor_bitwise_settings, InteractionType::LookupIntoIndexedByClk>()
        // Gas - ToRadix BE
        .add<lookup_execution_check_radix_gt_256_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_execution_get_p_limbs_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_execution_get_max_limbs_settings, InteractionType::LookupGeneric>(C::gt_sel)
        // Dynamic Gas - SStore
        .add<lookup_execution_check_written_storage_slot_settings, InteractionType::LookupSequential>()
        // Context Stack
        .add<perm_context_ctx_stack_call_settings, InteractionType::Permutation>()
        .add<lookup_context_ctx_stack_rollback_settings, InteractionType::LookupGeneric>()
        .add<lookup_context_ctx_stack_return_settings, InteractionType::LookupGeneric>()
        // External Call
        .add<lookup_external_call_is_l2_gas_left_gt_allocated_settings, InteractionType::LookupGeneric>(C::gt_sel)
        .add<lookup_external_call_is_da_gas_left_gt_allocated_settings, InteractionType::LookupGeneric>(C::gt_sel)
        // GetEnvVar opcode
        .add<lookup_get_env_var_precomputed_info_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_get_env_var_read_from_public_inputs_col0_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_get_env_var_read_from_public_inputs_col1_settings, InteractionType::LookupIntoIndexedByClk>()
        // Sload opcode (cannot be sequential as public data tree check trace is sorted in tracegen)
        .add<lookup_sload_storage_read_settings, InteractionType::LookupGeneric>()
        // Sstore opcode
        .add<lookup_sstore_record_written_storage_slot_settings, InteractionType::LookupSequential>()
        // NoteHashExists
        .add<lookup_notehash_exists_note_hash_read_settings, InteractionType::LookupSequential>()
        .add<lookup_notehash_exists_note_hash_leaf_index_in_range_settings, InteractionType::LookupGeneric>(C::gt_sel)
        // NullifierExists opcode
        .add<lookup_nullifier_exists_nullifier_exists_check_settings, InteractionType::LookupSequential>()
        // EmitNullifier
        .add<lookup_emit_nullifier_write_nullifier_settings, InteractionType::LookupSequential>()
        // EmitNoteHash
        .add<lookup_emit_notehash_notehash_tree_write_settings, InteractionType::LookupSequential>()
        // L1ToL2MsgExists
        .add<lookup_l1_to_l2_message_exists_l1_to_l2_msg_leaf_index_in_range_settings, InteractionType::LookupGeneric>(
            C::gt_sel)
        .add<lookup_l1_to_l2_message_exists_l1_to_l2_msg_read_settings, InteractionType::LookupSequential>()
        // SendL2ToL1Msg
        .add<lookup_send_l2_to_l1_msg_write_l2_to_l1_msg_settings, InteractionType::LookupIntoIndexedByClk>()
        // Dispatching to other sub-traces
        .add<lookup_execution_dispatch_to_alu_settings, InteractionType::LookupGeneric>()
        .add<lookup_execution_dispatch_to_bitwise_settings, InteractionType::LookupGeneric>()
        .add<perm_execution_dispatch_to_cd_copy_settings, InteractionType::Permutation>()
        .add<perm_execution_dispatch_to_rd_copy_settings, InteractionType::Permutation>()
        .add<lookup_execution_dispatch_to_cast_settings, InteractionType::LookupGeneric>()
        .add<lookup_execution_dispatch_to_set_settings, InteractionType::LookupGeneric>()
        .add<perm_execution_dispatch_to_get_contract_instance_settings, InteractionType::Permutation>()
        .add<perm_execution_dispatch_to_emit_unencrypted_log_settings, InteractionType::Permutation>()
        .add<perm_execution_dispatch_to_poseidon2_perm_settings, InteractionType::Permutation>()
        .add<perm_execution_dispatch_to_sha256_compression_settings, InteractionType::Permutation>()
        .add<perm_execution_dispatch_to_keccakf1600_settings, InteractionType::Permutation>()
        .add<perm_execution_dispatch_to_ecc_add_settings, InteractionType::Permutation>()
        .add<perm_execution_dispatch_to_to_radix_settings, InteractionType::Permutation>();

} // namespace bb::avm2::tracegen
