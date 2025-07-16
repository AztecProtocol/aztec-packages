#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <numeric>
#include <ranges>
#include <stdexcept>
#include <sys/types.h>
#include <unordered_map>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/addressing.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_addressing.hpp"
#include "barretenberg/vm2/generated/relations/lookups_execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_external_call.hpp"
#include "barretenberg/vm2/generated/relations/lookups_gas.hpp"
#include "barretenberg/vm2/generated/relations/lookups_get_env_var.hpp"
#include "barretenberg/vm2/generated/relations/lookups_internal_call.hpp"
#include "barretenberg/vm2/generated/relations/lookups_registers.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sload.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sstore.hpp"
#include "barretenberg/vm2/generated/relations/perms_execution.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/lib/get_env_var_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

using C = bb::avm2::Column;
using bb::avm2::simulation::AddressingEventError;
using bb::avm2::simulation::ExecutionError;

namespace bb::avm2::tracegen {
namespace {

constexpr std::array<Column, AVM_MAX_OPERANDS> OPERAND_COLUMNS = {
    C::execution_op_0_, C::execution_op_1_, C::execution_op_2_, C::execution_op_3_,
    C::execution_op_4_, C::execution_op_5_, C::execution_op_6_,
};
constexpr std::array<Column, AVM_MAX_OPERANDS> OPERAND_IS_ADDRESS_COLUMNS = {
    C::execution_sel_op_is_address_0_, C::execution_sel_op_is_address_1_, C::execution_sel_op_is_address_2_,
    C::execution_sel_op_is_address_3_, C::execution_sel_op_is_address_4_, C::execution_sel_op_is_address_5_,
    C::execution_sel_op_is_address_6_,
};
constexpr std::array<Column, AVM_MAX_OPERANDS> OPERAND_AFTER_RELATIVE_COLUMNS = {
    C::execution_op_after_relative_0_, C::execution_op_after_relative_1_, C::execution_op_after_relative_2_,
    C::execution_op_after_relative_3_, C::execution_op_after_relative_4_, C::execution_op_after_relative_5_,
    C::execution_op_after_relative_6_,
};
constexpr std::array<Column, AVM_MAX_OPERANDS> RESOLVED_OPERAND_COLUMNS = {
    C::execution_rop_0_, C::execution_rop_1_, C::execution_rop_2_, C::execution_rop_3_,
    C::execution_rop_4_, C::execution_rop_5_, C::execution_rop_6_,
};
constexpr std::array<Column, AVM_MAX_OPERANDS> RESOLVED_OPERAND_TAG_COLUMNS = {
    C::execution_rop_tag_0_, C::execution_rop_tag_1_, C::execution_rop_tag_2_, C::execution_rop_tag_3_,
    C::execution_rop_tag_4_, C::execution_rop_tag_5_, C::execution_rop_tag_6_,
};
constexpr std::array<Column, AVM_MAX_OPERANDS> OPERAND_SHOULD_APPLY_INDIRECTION_COLUMNS = {
    C::execution_sel_should_apply_indirection_0_, C::execution_sel_should_apply_indirection_1_,
    C::execution_sel_should_apply_indirection_2_, C::execution_sel_should_apply_indirection_3_,
    C::execution_sel_should_apply_indirection_4_, C::execution_sel_should_apply_indirection_5_,
    C::execution_sel_should_apply_indirection_6_,
};
constexpr std::array<Column, AVM_MAX_OPERANDS> OPERAND_RELATIVE_OVERFLOW_COLUMNS = {
    C::execution_sel_relative_overflow_0_, C::execution_sel_relative_overflow_1_, C::execution_sel_relative_overflow_2_,
    C::execution_sel_relative_overflow_3_, C::execution_sel_relative_overflow_4_, C::execution_sel_relative_overflow_5_,
    C::execution_sel_relative_overflow_6_,
};
constexpr std::array<Column, AVM_MAX_OPERANDS> OPERAND_IS_RELATIVE_EFFECTIVE_COLUMNS = {
    C::execution_sel_op_is_relative_effective_0_, C::execution_sel_op_is_relative_effective_1_,
    C::execution_sel_op_is_relative_effective_2_, C::execution_sel_op_is_relative_effective_3_,
    C::execution_sel_op_is_relative_effective_4_, C::execution_sel_op_is_relative_effective_5_,
    C::execution_sel_op_is_relative_effective_6_,
};
constexpr std::array<Column, AVM_MAX_OPERANDS> OPERAND_RELATIVE_OOB_CHECK_DIFF_COLUMNS = {
    C::execution_overflow_range_check_result_0_, C::execution_overflow_range_check_result_1_,
    C::execution_overflow_range_check_result_2_, C::execution_overflow_range_check_result_3_,
    C::execution_overflow_range_check_result_4_, C::execution_overflow_range_check_result_5_,
    C::execution_overflow_range_check_result_6_,
};

constexpr size_t TOTAL_INDIRECT_BITS = 16;
static_assert(AVM_MAX_OPERANDS * 2 <= TOTAL_INDIRECT_BITS);
constexpr std::array<Column, TOTAL_INDIRECT_BITS / 2> OPERAND_IS_RELATIVE_WIRE_COLUMNS = {
    C::execution_sel_op_is_relative_wire_0_, C::execution_sel_op_is_relative_wire_1_,
    C::execution_sel_op_is_relative_wire_2_, C::execution_sel_op_is_relative_wire_3_,
    C::execution_sel_op_is_relative_wire_4_, C::execution_sel_op_is_relative_wire_5_,
    C::execution_sel_op_is_relative_wire_6_, C::execution_sel_op_is_relative_wire_7_,

};
constexpr std::array<Column, TOTAL_INDIRECT_BITS / 2> OPERAND_IS_INDIRECT_WIRE_COLUMNS = {
    C::execution_sel_op_is_indirect_wire_0_, C::execution_sel_op_is_indirect_wire_1_,
    C::execution_sel_op_is_indirect_wire_2_, C::execution_sel_op_is_indirect_wire_3_,
    C::execution_sel_op_is_indirect_wire_4_, C::execution_sel_op_is_indirect_wire_5_,
    C::execution_sel_op_is_indirect_wire_6_, C::execution_sel_op_is_indirect_wire_7_,
};

constexpr std::array<Column, AVM_MAX_REGISTERS> REGISTER_COLUMNS = {
    C::execution_register_0_, C::execution_register_1_, C::execution_register_2_, C::execution_register_3_,
    C::execution_register_4_, C::execution_register_5_, C::execution_register_6_,
};
constexpr std::array<Column, AVM_MAX_REGISTERS> REGISTER_MEM_TAG_COLUMNS = {
    C::execution_mem_tag_reg_0_, C::execution_mem_tag_reg_1_, C::execution_mem_tag_reg_2_, C::execution_mem_tag_reg_3_,
    C::execution_mem_tag_reg_4_, C::execution_mem_tag_reg_5_, C::execution_mem_tag_reg_6_,
};
constexpr std::array<Column, AVM_MAX_REGISTERS> REGISTER_IS_WRITE_COLUMNS = {
    C::execution_rw_reg_0_, C::execution_rw_reg_1_, C::execution_rw_reg_2_, C::execution_rw_reg_3_,
    C::execution_rw_reg_4_, C::execution_rw_reg_5_, C::execution_rw_reg_6_,
};
constexpr std::array<Column, AVM_MAX_REGISTERS> REGISTER_MEM_OP_COLUMNS = {
    C::execution_sel_mem_op_reg_0_, C::execution_sel_mem_op_reg_1_, C::execution_sel_mem_op_reg_2_,
    C::execution_sel_mem_op_reg_3_, C::execution_sel_mem_op_reg_4_, C::execution_sel_mem_op_reg_5_,
    C::execution_sel_mem_op_reg_6_,
};
constexpr std::array<Column, AVM_MAX_REGISTERS> REGISTER_EXPECTED_TAG_COLUMNS = {
    C::execution_expected_tag_reg_0_, C::execution_expected_tag_reg_1_, C::execution_expected_tag_reg_2_,
    C::execution_expected_tag_reg_3_, C::execution_expected_tag_reg_4_, C::execution_expected_tag_reg_5_,
    C::execution_expected_tag_reg_6_,
};
constexpr std::array<Column, AVM_MAX_REGISTERS> REGISTER_TAG_CHECK_COLUMNS = {
    C::execution_sel_tag_check_reg_0_, C::execution_sel_tag_check_reg_1_, C::execution_sel_tag_check_reg_2_,
    C::execution_sel_tag_check_reg_3_, C::execution_sel_tag_check_reg_4_, C::execution_sel_tag_check_reg_5_,
    C::execution_sel_tag_check_reg_6_,
};
constexpr std::array<Column, AVM_MAX_REGISTERS> REGISTER_OP_REG_EFFECTIVE_COLUMNS = {
    C::execution_sel_op_reg_effective_0_, C::execution_sel_op_reg_effective_1_, C::execution_sel_op_reg_effective_2_,
    C::execution_sel_op_reg_effective_3_, C::execution_sel_op_reg_effective_4_, C::execution_sel_op_reg_effective_5_,
    C::execution_sel_op_reg_effective_6_,
};

/**
 * @brief Get the column selector for a given execution opcode.
 *
 * @param exec_opcode The execution opcode.
 * @return The corresponding column selector.
 * @throws std::runtime_error if the opcode doesn't have a corresponding selector.
 */
Column get_execution_opcode_selector(ExecutionOpCode exec_opcode)
{
    switch (exec_opcode) {
    case ExecutionOpCode::GETENVVAR:
        return C::execution_sel_execute_get_env_var;
    case ExecutionOpCode::SET:
        return C::execution_sel_execute_set;
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
    std::unordered_set<uint32_t> does_context_fail;
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

    // Preprocessing pass 1: find the events that exit the app logic and teardown phases
    for (const auto& ex_event : ex_events) {
        bool is_exit = ex_event.is_exit();
        bool is_top_level = ex_event.after_context_event.parent_id == 0;

        if (is_exit && is_top_level) {
            // TODO(dbanks12): confirm this should be after_context_event and not before_context_event
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
    assert((phase == TransactionPhase::APP_LOGIC || phase == TransactionPhase::TEARDOWN) &&
           "Execution events must have app logic or teardown phase");

    switch (phase) {
    case TransactionPhase::APP_LOGIC:
        // Note that app logic also gets discarded if teardown failures
        return failures.app_logic_failure  ? failures.app_logic_exit_context_id
               : failures.teardown_failure ? failures.teardown_exit_context_id
                                           : 0;
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
    FailingContexts failures = preprocess_for_discard(ex_events);

    uint32_t last_seen_parent_id = 0;
    FF cached_parent_id_inv = 0;

    // Some variables updated per loop iteration to track
    // whether or not the upcoming row should "discard" [side effects].
    uint32_t discard = 0;
    uint32_t dying_context_id = 0;
    FF dying_context_id_inv = 0;
    bool is_first_event_in_enqueued_call = true;

    for (const auto& ex_event : ex_events) {
        // Check if this is the first event in an enqueued call and whether
        // the phase should be discarded
        if (discard == 0 && is_first_event_in_enqueued_call &&
            is_phase_discarded(ex_event.after_context_event.phase, failures)) {
            discard = 1;
            dying_context_id = dying_context_for_phase(ex_event.after_context_event.phase, failures);
            dying_context_id_inv = FF(dying_context_id).invert();
        }

        // Cache the parent id inversion since we will repeatedly just be doing the same expensive inversion
        bool has_parent = ex_event.after_context_event.parent_id != 0;
        if (last_seen_parent_id != ex_event.after_context_event.parent_id) {
            last_seen_parent_id = ex_event.after_context_event.parent_id;
            cached_parent_id_inv = has_parent ? FF(ex_event.after_context_event.parent_id).invert() : 0;
        }

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
                { C::execution_pc, ex_event.before_context_event.pc },
                { C::execution_is_static, ex_event.after_context_event.is_static },
                { C::execution_msg_sender, ex_event.after_context_event.msg_sender },
                { C::execution_contract_address, ex_event.after_context_event.contract_addr },
                { C::execution_parent_calldata_addr, ex_event.after_context_event.parent_cd_addr },
                { C::execution_parent_calldata_size, ex_event.after_context_event.parent_cd_size_addr },
                { C::execution_last_child_returndata_addr, ex_event.after_context_event.last_child_rd_addr },
                { C::execution_last_child_returndata_size, ex_event.after_context_event.last_child_rd_size },
                { C::execution_last_child_success, ex_event.after_context_event.last_child_success },
                { C::execution_l2_gas_limit, ex_event.after_context_event.gas_limit.l2Gas },
                { C::execution_da_gas_limit, ex_event.after_context_event.gas_limit.daGas },
                { C::execution_l2_gas_used, ex_event.after_context_event.gas_used.l2Gas },
                { C::execution_da_gas_used, ex_event.after_context_event.gas_used.daGas },
                { C::execution_parent_l2_gas_limit, ex_event.after_context_event.parent_gas_limit.l2Gas },
                { C::execution_parent_da_gas_limit, ex_event.after_context_event.parent_gas_limit.daGas },
                { C::execution_parent_l2_gas_used, ex_event.after_context_event.parent_gas_used.l2Gas },
                { C::execution_parent_da_gas_used, ex_event.after_context_event.parent_gas_used.daGas },
                { C::execution_next_context_id, ex_event.next_context_id },
                // Context - gas.
                { C::execution_prev_l2_gas_used, ex_event.before_context_event.gas_used.l2Gas },
                { C::execution_prev_da_gas_used, ex_event.before_context_event.gas_used.daGas },
                // Context - tree states
                // Context - tree states - Written public data slots tree
                { C::execution_prev_written_public_data_slots_tree_root,
                  ex_event.before_context_event.written_public_data_slots_tree_snapshot.root },
                { C::execution_prev_written_public_data_slots_tree_size,
                  ex_event.before_context_event.written_public_data_slots_tree_snapshot.nextAvailableLeafIndex },
                { C::execution_written_public_data_slots_tree_root,
                  ex_event.after_context_event.written_public_data_slots_tree_snapshot.root },
                { C::execution_written_public_data_slots_tree_size,
                  ex_event.after_context_event.written_public_data_slots_tree_snapshot.nextAvailableLeafIndex },
                { C::execution_prev_public_data_tree_root,
                  ex_event.before_context_event.tree_states.publicDataTree.tree.root },
                { C::execution_prev_public_data_tree_size,
                  ex_event.before_context_event.tree_states.publicDataTree.tree.nextAvailableLeafIndex },
                // Context - tree states - Nullifier tree
                { C::execution_prev_nullifier_tree_root,
                  ex_event.before_context_event.tree_states.nullifierTree.tree.root },
                { C::execution_prev_nullifier_tree_size,
                  ex_event.before_context_event.tree_states.nullifierTree.tree.nextAvailableLeafIndex },
                { C::execution_nullifier_tree_root, ex_event.after_context_event.tree_states.nullifierTree.tree.root },
                { C::execution_nullifier_tree_size,
                  ex_event.after_context_event.tree_states.nullifierTree.tree.nextAvailableLeafIndex },
                // Context - tree states - Public data tree
                { C::execution_public_data_tree_root,
                  ex_event.after_context_event.tree_states.publicDataTree.tree.root },
                { C::execution_public_data_tree_size,
                  ex_event.after_context_event.tree_states.publicDataTree.tree.nextAvailableLeafIndex },
                // Other.
                { C::execution_bytecode_id, ex_event.bytecode_id },
                // Helpers for identifying parent context
                { C::execution_has_parent_ctx, has_parent ? 1 : 0 },
                { C::execution_is_parent_id_inv, cached_parent_id_inv },
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

        bool bytecode_retrieval_failed = ex_event.error == ExecutionError::BYTECODE_NOT_FOUND;
        trace.set(row,
                  { {
                      { C::execution_sel_bytecode_retrieval_failure, bytecode_retrieval_failed ? 1 : 0 },
                      { C::execution_sel_bytecode_retrieval_success, !bytecode_retrieval_failed ? 1 : 0 },
                      { C::execution_bytecode_id, ex_event.bytecode_id },
                  } });

        /**************************************************************************************************
         *  Temporality group 2: Instruction fetching.
         **************************************************************************************************/

        // This will only have a value if instruction fetching succeeded.
        std::optional<ExecutionOpCode> exec_opcode;
        bool process_instruction_fetching = !bytecode_retrieval_failed;
        bool instruction_fetching_failed = ex_event.error == ExecutionError::INSTRUCTION_FETCHING;
        trace.set(C::execution_sel_instruction_fetching_failure, row, instruction_fetching_failed ? 1 : 0);
        if (process_instruction_fetching && !instruction_fetching_failed) {
            exec_opcode = ex_event.wire_instruction.get_exec_opcode();
            process_instr_fetching(ex_event.wire_instruction, trace, row);
            // If we fetched an instruction successfully, we can set the next PC.
            trace.set(row,
                      { {
                          { C::execution_next_pc,
                            ex_event.before_context_event.pc + ex_event.wire_instruction.size_in_bytes() },
                      } });
        }

        /**************************************************************************************************
         *  Temporality group 2: Mapping from wire to execution and addressing.
         **************************************************************************************************/

        // Along this function we need to set the info we get from the EXEC_SPEC_READ lookup.
        bool should_read_exec_spec = !instruction_fetching_failed;
        if (should_read_exec_spec) {
            process_execution_spec(ex_event, trace, row);
        }

        bool should_resolve_address = should_read_exec_spec;
        // pol SEL_SHOULD_RESOLVE_ADDRESS = sel_bytecode_retrieval_success * sel_instruction_fetching_success;
        if (should_resolve_address) {
            process_addressing(ex_event.addressing_event, ex_event.wire_instruction, trace, row);
        }
        bool addressing_failed = ex_event.error == ExecutionError::ADDRESSING;

        /**************************************************************************************************
         *  Temporality group 3: Registers read.
         **************************************************************************************************/

        // Note that if addressing did not fail, register reading will not fail.
        std::array<TaggedValue, AVM_MAX_REGISTERS> registers;
        std::fill(registers.begin(), registers.end(), TaggedValue::from<FF>(0));
        bool should_process_registers = should_resolve_address && !addressing_failed;
        bool register_processing_failed = ex_event.error == ExecutionError::REGISTER_READ;
        if (should_process_registers) {
            process_registers(*exec_opcode, ex_event.inputs, ex_event.output, registers, trace, row);
        }

        /**************************************************************************************************
         *  Temporality group 4: Gas (both base and dynamic).
         **************************************************************************************************/

        bool should_check_gas = should_process_registers && !register_processing_failed;
        bool oog = ex_event.error == ExecutionError::GAS;
        trace.set(C::execution_sel_should_check_gas, row, should_check_gas ? 1 : 0);
        if (should_check_gas) {
            process_gas(ex_event.gas_event, *exec_opcode, trace, row);
        }

        /**************************************************************************************************
         *  Temporality group 5: Opcode execution.
         **************************************************************************************************/

        // TODO(ilyas): This can possibly be gated with some boolean but I'm not sure what is going on.

        // Overly verbose but maximising readibility here
        // FIXME(ilyas): We currently cannot move this into the if statement because they are used outside of this
        // temporality group (e.g. in recomputing discard)
        bool is_call = exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::CALL;
        bool is_static_call = exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::STATICCALL;
        bool is_return = exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::RETURN;
        bool is_revert = exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::REVERT;
        bool is_err = ex_event.error != ExecutionError::NONE;
        bool is_failure = is_revert || is_err;
        bool sel_enter_call = (is_call || is_static_call) && !is_err;
        bool sel_exit_call = is_return || is_revert || is_err;

        bool should_execute_opcode = should_check_gas && !oog;
        bool opcode_execution_failed = ex_event.error == ExecutionError::OPCODE_EXECUTION;
        if (should_execute_opcode) {
            // At this point we can assume instruction fetching succeeded, so this should never fail.
            const auto& dispatch_to_subtrace = SUBTRACE_INFO_MAP.at(*exec_opcode);
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

            // Call specific logic
            if (sel_enter_call) {
                Gas gas_left = ex_event.after_context_event.gas_limit - ex_event.after_context_event.gas_used;

                uint32_t allocated_l2_gas = registers[0].as<uint32_t>();
                bool is_l2_gas_allocated_lt_left = allocated_l2_gas < gas_left.l2Gas;
                uint32_t allocated_left_l2_cmp_diff = is_l2_gas_allocated_lt_left
                                                          ? gas_left.l2Gas - allocated_l2_gas - 1
                                                          : allocated_l2_gas - gas_left.l2Gas;

                uint32_t allocated_da_gas = registers[1].as<uint32_t>();
                bool is_da_gas_allocated_lt_left = allocated_da_gas < gas_left.daGas;
                uint32_t allocated_left_da_cmp_diff = is_da_gas_allocated_lt_left
                                                          ? gas_left.daGas - allocated_da_gas - 1
                                                          : allocated_da_gas - gas_left.daGas;

                trace.set(row,
                          { {
                              { C::execution_sel_enter_call, sel_enter_call ? 1 : 0 },
                              { C::execution_sel_execute_call, is_call ? 1 : 0 },
                              { C::execution_sel_execute_static_call, is_static_call ? 1 : 0 },
                              { C::execution_constant_32, 32 },
                              { C::execution_call_is_l2_gas_allocated_lt_left, is_l2_gas_allocated_lt_left },
                              { C::execution_call_allocated_left_l2_cmp_diff, allocated_left_l2_cmp_diff },
                              { C::execution_call_is_da_gas_allocated_lt_left, is_da_gas_allocated_lt_left },
                              { C::execution_call_allocated_left_da_cmp_diff, allocated_left_da_cmp_diff },
                          } });
            } else if (sel_exit_call) {
                // We rollback if we revert or error and we have a parent context.
                trace.set(row,
                          { {
                              // Exit reason - opcode or error
                              { C::execution_sel_execute_return, is_return ? 1 : 0 },
                              { C::execution_sel_execute_revert, is_revert ? 1 : 0 },
                              { C::execution_sel_exit_call, sel_exit_call ? 1 : 0 },
                              // Enqueued or nested exit dependent on if we are a child context
                              { C::execution_enqueued_call_end, !has_parent ? 1 : 0 },
                              { C::execution_nested_exit_call, has_parent ? 1 : 0 },
                          } });
            } else if (exec_opcode == ExecutionOpCode::GETENVVAR) {
                assert(ex_event.addressing_event.resolution_info.size() == 2 &&
                       "GETENVVAR should have exactly two resolved operands (envvar enum and output)");
                // rop[1] is the envvar enum
                TaggedValue envvar_enum = ex_event.addressing_event.resolution_info[1].resolved_operand;
                process_get_env_var_opcode(envvar_enum, ex_event.output, trace, row);
            } else if (exec_opcode == ExecutionOpCode::INTERNALRETURN) {
                trace.set(C::execution_internal_call_return_id_inv,
                          row,
                          ex_event.before_context_event.internal_call_return_id != 0
                              ? FF(ex_event.before_context_event.internal_call_return_id).invert()
                              : 0);
            } else if (exec_opcode == ExecutionOpCode::SSTORE) {
                uint32_t remaining_data_writes = MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX -
                                                 ex_event.before_context_event.tree_states.publicDataTree.counter;

                trace.set(row,
                          { {
                              { C::execution_max_data_writes_reached, remaining_data_writes == 0 },
                              { C::execution_remaining_data_writes_inv,
                                remaining_data_writes == 0 ? 0 : FF(remaining_data_writes).invert() },
                              { C::execution_sel_write_public_data, !opcode_execution_failed },
                          } });
            }
        }

        /**************************************************************************************************
         *  Temporality group 6: Register write.
         **************************************************************************************************/

        bool should_process_register_write = should_execute_opcode && !opcode_execution_failed;
        if (should_process_register_write) {
            process_registers_write(*exec_opcode, trace, row);
        }

        /**************************************************************************************************
         *  Discarding.
         **************************************************************************************************/

        bool is_dying_context = discard == 1 && (ex_event.after_context_event.id == dying_context_id);

        // Need to generate the item below for checking "is dying context" in circuit
        FF dying_context_diff_inv = 0;
        if (!is_dying_context) {
            // Compute inversion when context_id != dying_context_id
            FF diff = FF(ex_event.after_context_event.id) - FF(dying_context_id);
            if (!diff.is_zero()) {
                dying_context_diff_inv = diff.invert();
            }
        }

        bool enqueued_call_end = sel_exit_call && !has_parent;
        bool resolves_dying_context = is_failure && is_dying_context;
        bool nested_call_rom_undiscarded_context = sel_enter_call && discard == 0;
        bool propagate_discard = !enqueued_call_end && !resolves_dying_context && !nested_call_rom_undiscarded_context;

        // This is here instead of guarded by `should_execute_opcode` because is_err is a higher level error than just
        // an opcode error (i.e., it is on if there are any errors in any temporality group).
        bool rollback_context = (is_revert || is_err) && has_parent;

        trace.set(
            row,
            { {

                // sel_exit_call and rollback has to be set here because they include sel_error
                { C::execution_sel_exit_call, sel_exit_call ? 1 : 0 },
                { C::execution_rollback_context, rollback_context ? 1 : 0 },
                { C::execution_sel_error, is_err ? 1 : 0 },
                { C::execution_sel_failure, is_failure ? 1 : 0 },
                { C::execution_discard, discard },
                { C::execution_dying_context_id, dying_context_id },
                { C::execution_dying_context_id_inv, dying_context_id_inv },
                { C::execution_is_dying_context, is_dying_context ? 1 : 0 },
                { C::execution_dying_context_diff_inv, dying_context_diff_inv },
                { C::execution_enqueued_call_end, enqueued_call_end ? 1 : 0 },
                { C::execution_resolves_dying_context, resolves_dying_context ? 1 : 0 },
                { C::execution_nested_call_from_undiscarded_context, nested_call_rom_undiscarded_context ? 1 : 0 },
                { C::execution_propagate_discard, propagate_discard ? 1 : 0 },
            } });

        // Trace-generation is done for this event.
        // Now, use this event to determine whether we should set/reset the discard flag for the NEXT event
        bool event_kills_dying_context =
            discard == 1 && is_failure && ex_event.after_context_event.id == dying_context_id;

        if (event_kills_dying_context) {
            // Set/unset discard flag if the current event is the one that kills the dying context
            dying_context_id = 0;
            dying_context_id_inv = 0;
            discard = 0;
        } else if (sel_enter_call && discard == 0 && !is_err &&
                   failures.does_context_fail.contains(ex_event.next_context_id)) {
            // If making a nested call, and discard isn't already high...
            // if the nested context being entered eventually dies, raise discard flag and remember which context is
            // dying.
            // NOTE: if a [STATIC]CALL instruction _itself_ errors, we don't set the discard flag
            // because we aren't actually entering a new context!
            dying_context_id = ex_event.next_context_id;
            dying_context_id_inv = FF(dying_context_id).invert();
            discard = 1;
        }
        // Otherwise, we aren't entering or exiting a dying context,
        // so just propagate discard and dying context.
        // Implicit: dying_context_id = dying_context_id; discard = discard;

        // If an enqueued call just exited, next event (if any) is the first in an enqueued call.
        // Update flag for next iteration.
        is_first_event_in_enqueued_call = ex_event.after_context_event.parent_id == 0 && sel_exit_call;

        row++;
    }

    if (!ex_events.empty()) {
        trace.set(C::execution_last, row - 1, 1);
    }
}

void ExecutionTraceBuilder::process_instr_fetching(const simulation::Instruction& instruction,
                                                   TraceContainer& trace,
                                                   uint32_t row)
{
    trace.set(row,
              { {
                  { C::execution_sel_instruction_fetching_success, 1 },
                  { C::execution_ex_opcode, static_cast<uint8_t>(instruction.get_exec_opcode()) },
                  { C::execution_indirect, instruction.indirect },
                  { C::execution_instr_length, instruction.size_in_bytes() },
              } });

    // At this point we can assume instruction fetching succeeded.
    auto operands = instruction.operands;
    assert(operands.size() <= AVM_MAX_OPERANDS);
    operands.resize(AVM_MAX_OPERANDS, simulation::Operand::from<FF>(0));

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
    const auto& exec_spec = EXEC_INSTRUCTION_SPEC.at(exec_opcode);
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
                        register_info.need_tag_check(i) ? static_cast<uint32_t>(*register_info.expected_tag(i)) : 0 },
                      { REGISTER_TAG_CHECK_COLUMNS[i], register_info.need_tag_check(i) ? 1 : 0 },
                  } });
    }

    // Set is_address columns
    const auto& num_addresses = exec_spec.num_addresses;
    for (size_t i = 0; i < num_addresses; i++) {
        trace.set(OPERAND_IS_ADDRESS_COLUMNS[i], row, 1);
    }

    // At this point we can assume instruction fetching succeeded, so this should never fail.
    const auto& dispatch_to_subtrace = SUBTRACE_INFO_MAP.at(exec_opcode);
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
                  { C::execution_out_of_gas_l2, gas_event.oog_l2 ? 1 : 0 },
                  { C::execution_out_of_gas_da, gas_event.oog_da ? 1 : 0 },
                  { C::execution_sel_out_of_gas, oog ? 1 : 0 },
                  // Base gas.
                  { C::execution_addressing_gas, gas_event.addressing_gas },
                  { C::execution_limit_used_l2_cmp_diff, gas_event.limit_used_l2_comparison_witness },
                  { C::execution_limit_used_da_cmp_diff, gas_event.limit_used_da_comparison_witness },
                  { C::execution_constant_64, 64 },
                  // Dynamic gas.
                  { C::execution_dynamic_l2_gas_factor, gas_event.dynamic_gas_factor.l2Gas },
                  { C::execution_dynamic_da_gas_factor, gas_event.dynamic_gas_factor.daGas },
              } });

    if (gas_event.dynamic_gas_factor.l2Gas != 0 || gas_event.dynamic_gas_factor.daGas != 0) {
        const auto& exec_spec = EXEC_INSTRUCTION_SPEC.at(exec_opcode);
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
    const ExecInstructionSpec& ex_spec = EXEC_INSTRUCTION_SPEC.at(exec_opcode);

    auto resolution_info_vec = addr_event.resolution_info;
    assert(resolution_info_vec.size() <= AVM_MAX_OPERANDS);
    resolution_info_vec.resize(AVM_MAX_OPERANDS,
                               {
                                   // This is the default we want: both tag and value 0.
                                   .after_relative = simulation::Operand::from<FF>(0),
                                   .resolved_operand = simulation::Operand::from<FF>(0),
                               });

    std::array<bool, AVM_MAX_OPERANDS> should_apply_indirection{};
    std::array<bool, AVM_MAX_OPERANDS> is_relative_effective{};
    std::array<bool, AVM_MAX_OPERANDS> is_indirect_effective{};
    std::array<bool, AVM_MAX_OPERANDS> relative_oob{};
    std::array<FF, AVM_MAX_OPERANDS> after_relative{};
    std::array<FF, AVM_MAX_OPERANDS> resolved_operand{};
    std::array<uint8_t, AVM_MAX_OPERANDS> resolved_operand_tag{};
    uint8_t num_relative_operands = 0;

    // Gather operand information.
    for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
        const auto& resolution_info = resolution_info_vec.at(i);
        bool op_is_address = i < ex_spec.num_addresses;
        relative_oob[i] = resolution_info.error.has_value() &&
                          *resolution_info.error == AddressingEventError::RELATIVE_COMPUTATION_OOB;
        is_indirect_effective[i] = op_is_address && is_operand_indirect(instruction.indirect, i);
        is_relative_effective[i] = op_is_address && is_operand_relative(instruction.indirect, i);
        should_apply_indirection[i] = is_indirect_effective[i] && !relative_oob[i];
        resolved_operand_tag[i] = static_cast<uint8_t>(resolution_info.resolved_operand.get_tag());
        after_relative[i] = resolution_info.after_relative;
        resolved_operand[i] = resolution_info.resolved_operand;
        if (is_relative_effective[i]) {
            num_relative_operands++;
        }
    }

    // Set the operand columns.
    for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
        FF relative_oob_check_diff = 0;
        if (is_relative_effective[i]) {
            relative_oob_check_diff =
                !relative_oob[i] ? FF(1ULL << 32) - after_relative[i] - 1 : after_relative[i] - FF(1ULL << 32);
        }
        trace.set(row,
                  { {
                      { OPERAND_RELATIVE_OVERFLOW_COLUMNS[i], relative_oob[i] ? 1 : 0 },
                      { OPERAND_AFTER_RELATIVE_COLUMNS[i], after_relative[i] },
                      { OPERAND_SHOULD_APPLY_INDIRECTION_COLUMNS[i], should_apply_indirection[i] ? 1 : 0 },
                      { OPERAND_IS_RELATIVE_EFFECTIVE_COLUMNS[i], is_relative_effective[i] ? 1 : 0 },
                      { OPERAND_RELATIVE_OOB_CHECK_DIFF_COLUMNS[i], relative_oob_check_diff },
                      { RESOLVED_OPERAND_COLUMNS[i], resolved_operand[i] },
                      { RESOLVED_OPERAND_TAG_COLUMNS[i], resolved_operand_tag[i] },
                  } });
    }

    // We need to compute relative and indirect over the whole 16 bits of the indirect flag.
    // See comment in PIL file about indirect upper bits.
    for (size_t i = 0; i < TOTAL_INDIRECT_BITS / 2; i++) {
        bool is_relative = is_operand_relative(instruction.indirect, i);
        bool is_indirect = is_operand_indirect(instruction.indirect, i);
        trace.set(row,
                  { {
                      { OPERAND_IS_RELATIVE_WIRE_COLUMNS[i], is_relative ? 1 : 0 },
                      { OPERAND_IS_INDIRECT_WIRE_COLUMNS[i], is_indirect ? 1 : 0 },
                  } });
    }

    // Base address check.
    bool do_base_check = num_relative_operands != 0;
    bool base_address_invalid = do_base_check && addr_event.base_address.get_tag() != MemoryTag::U32;
    FF base_address_tag_diff_inv =
        base_address_invalid
            ? (FF(static_cast<uint8_t>(addr_event.base_address.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::U32)))
                  .invert()
            : 0;

    // Tag check after indirection.
    bool some_final_check_failed =
        std::any_of(addr_event.resolution_info.begin(), addr_event.resolution_info.end(), [](const auto& info) {
            return info.error.has_value() && *info.error == AddressingEventError::INVALID_ADDRESS_AFTER_INDIRECTION;
        });
    FF batched_tags_diff_inv = 0;
    if (some_final_check_failed) {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < AVM_MAX_OPERANDS; ++i) {
            batched_tags_diff +=
                FF(is_indirect_effective[i]) * power_of_2 * (FF(resolved_operand_tag[i]) - FF(MEM_TAG_U32));
            power_of_2 *= 8; // 2^3
        }
        batched_tags_diff_inv = batched_tags_diff != 0 ? batched_tags_diff.invert() : 0;
    }

    // Collect addressing errors. See PIL file for reference.
    bool addressing_failed = std::any_of(addr_event.resolution_info.begin(),
                                         addr_event.resolution_info.end(),
                                         [](const auto& info) { return info.error.has_value(); });
    FF addressing_error_collection_inv =
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
                  .invert()
            : 0;

    trace.set(row,
              { {
                  { C::execution_sel_addressing_error, addressing_failed ? 1 : 0 },
                  { C::execution_addressing_error_collection_inv, addressing_error_collection_inv },
                  { C::execution_base_address_val, addr_event.base_address.as_ff() },
                  { C::execution_base_address_tag, static_cast<uint8_t>(addr_event.base_address.get_tag()) },
                  { C::execution_base_address_tag_diff_inv, base_address_tag_diff_inv },
                  { C::execution_sel_base_address_failure, base_address_invalid ? 1 : 0 },
                  { C::execution_num_relative_operands_inv, do_base_check ? FF(num_relative_operands).invert() : 0 },
                  { C::execution_sel_do_base_check, do_base_check ? 1 : 0 },
                  { C::execution_constant_32, 32 },
                  { C::execution_two_to_32, 1ULL << 32 },
              } });
}

void ExecutionTraceBuilder::process_registers(ExecutionOpCode exec_opcode,
                                              const std::vector<TaggedValue>& inputs,
                                              const TaggedValue& output,
                                              std::span<TaggedValue> registers,
                                              TraceContainer& trace,
                                              uint32_t row)
{
    assert(registers.size() == AVM_MAX_REGISTERS);
    // At this point we can assume instruction fetching succeeded, so this should never fail.
    const auto& register_info = EXEC_INSTRUCTION_SPEC.at(exec_opcode).register_info;

    // Registers.
    size_t input_counter = 0;
    for (uint8_t i = 0; i < AVM_MAX_REGISTERS; ++i) {
        if (register_info.is_active(i)) {
            if (register_info.is_write(i)) {
                // If this is a write operation, we need to get the value from the output.
                registers[i] = output;
            } else {
                // If this is a read operation, we need to get the value from the input.
                auto input = inputs.size() > input_counter ? inputs.at(input_counter) : TaggedValue::from<FF>(0);
                registers[i] = input;
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

    // Tag check.
    bool some_tag_check_failed = false;
    for (size_t i = 0; i < AVM_MAX_REGISTERS; i++) {
        if (register_info.need_tag_check(i)) {
            if (registers[i].get_tag() != *register_info.expected_tag(i)) {
                some_tag_check_failed = true;
                break;
            }
        }
    }

    FF batched_tags_diff_inv_reg = 0;
    if (some_tag_check_failed) {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < AVM_MAX_REGISTERS; ++i) {
            if (register_info.need_tag_check(i)) {
                batched_tags_diff += power_of_2 * (FF(static_cast<uint8_t>(registers[i].get_tag())) -
                                                   FF(static_cast<uint8_t>(*register_info.expected_tag(i))));
            }
            power_of_2 *= 8; // 2^3
        }
        batched_tags_diff_inv_reg = batched_tags_diff != 0 ? batched_tags_diff.invert() : 0;
    }

    trace.set(row,
              { {
                  { C::execution_sel_should_read_registers, 1 },
                  { C::execution_batched_tags_diff_inv_reg, batched_tags_diff_inv_reg },
                  { C::execution_sel_register_read_error, some_tag_check_failed ? 1 : 0 },
              } });
}

void ExecutionTraceBuilder::process_registers_write(ExecutionOpCode exec_opcode, TraceContainer& trace, uint32_t row)
{
    const auto& register_info = EXEC_INSTRUCTION_SPEC.at(exec_opcode).register_info;
    trace.set(C::execution_sel_should_write_registers, row, 1);

    for (size_t i = 0; i < AVM_MAX_REGISTERS; i++) {
        // This one is special because it sets the writes.
        // If we got here, sel_should_write_registers=1.
        if (register_info.is_active(i) && register_info.is_write(i)) {
            trace.set(REGISTER_OP_REG_EFFECTIVE_COLUMNS[i], row, 1);
        }
    }
}

void ExecutionTraceBuilder::process_get_env_var_opcode(TaggedValue envvar_enum,
                                                       TaggedValue output,
                                                       TraceContainer& trace,
                                                       uint32_t row)
{
    assert(envvar_enum.get_tag() == ValueTag::U8);
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
        // Execution
        .add<lookup_execution_exec_spec_read_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_execution_check_written_storage_slot_settings, InteractionType::LookupSequential>()
        // Bytecode retrieval
        .add<lookup_execution_bytecode_retrieval_result_settings, InteractionType::LookupGeneric>()
        // Instruction fetching
        .add<lookup_execution_instruction_fetching_result_settings, InteractionType::LookupGeneric>()
        .add<lookup_execution_instruction_fetching_body_settings, InteractionType::LookupGeneric>()
        // Addressing
        .add<lookup_addressing_base_address_from_memory_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_indirect_from_memory_0_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_indirect_from_memory_1_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_indirect_from_memory_2_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_indirect_from_memory_3_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_indirect_from_memory_4_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_indirect_from_memory_5_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_indirect_from_memory_6_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_relative_overflow_range_0_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_relative_overflow_range_1_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_relative_overflow_range_2_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_relative_overflow_range_3_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_relative_overflow_range_4_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_relative_overflow_range_5_settings, InteractionType::LookupGeneric>()
        .add<lookup_addressing_relative_overflow_range_6_settings, InteractionType::LookupGeneric>()
        // Registers
        .add<lookup_registers_mem_op_0_settings, InteractionType::LookupGeneric>()
        .add<lookup_registers_mem_op_1_settings, InteractionType::LookupGeneric>()
        .add<lookup_registers_mem_op_2_settings, InteractionType::LookupGeneric>()
        .add<lookup_registers_mem_op_3_settings, InteractionType::LookupGeneric>()
        .add<lookup_registers_mem_op_4_settings, InteractionType::LookupGeneric>()
        .add<lookup_registers_mem_op_5_settings, InteractionType::LookupGeneric>()
        .add<lookup_registers_mem_op_6_settings, InteractionType::LookupGeneric>()
        // Internal Call Stack
        .add<lookup_internal_call_push_call_stack_settings_, InteractionType::LookupSequential>()
        .add<lookup_internal_call_unwind_call_stack_settings_, InteractionType::LookupGeneric>()
        // Gas
        .add<lookup_gas_addressing_gas_read_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_gas_limit_used_l2_range_settings, InteractionType::LookupGeneric>()
        .add<lookup_gas_limit_used_da_range_settings, InteractionType::LookupGeneric>()
        .add<lookup_execution_dyn_l2_factor_bitwise_settings, InteractionType::LookupGeneric>()
        // External Call
        .add<lookup_external_call_call_allocated_left_l2_range_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_external_call_call_allocated_left_da_range_settings, InteractionType::LookupIntoIndexedByClk>()
        // Dispatch to gadget sub-traces
        .add<perm_execution_dispatch_keccakf1600_settings, InteractionType::Permutation>()
        // GetEnvVar opcode
        .add<lookup_get_env_var_precomputed_info_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_get_env_var_read_from_public_inputs_col0_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_get_env_var_read_from_public_inputs_col1_settings, InteractionType::LookupIntoIndexedByClk>()
        // Sload opcode
        .add<lookup_sload_storage_read_settings, InteractionType::LookupGeneric>()
        // Sstore opcode
        .add<lookup_sstore_record_written_storage_slot_settings, InteractionType::LookupSequential>()
        .add<lookup_sstore_storage_write_settings, InteractionType::LookupGeneric>()
        // GetContractInstance opcode
        .add<perm_execution_dispatch_get_contract_instance_settings, InteractionType::Permutation>();

} // namespace bb::avm2::tracegen
