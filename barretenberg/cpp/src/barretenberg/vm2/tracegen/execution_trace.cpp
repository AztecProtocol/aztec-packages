#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>
#include <sys/types.h>
#include <unordered_map>

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/generated/relations/lookups_execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_gas.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {
namespace {

constexpr size_t operand_columns = 7;

uint32_t gas_comparison_witness(uint32_t limit, uint32_t used)
{
    return limit >= used ? limit - used : used - limit - 1;
}

std::pair<uint16_t, uint16_t> decompose_gas_value(uint32_t value)
{
    return { static_cast<uint16_t>(value & 0xFFFF), static_cast<uint16_t>(value >> 16) };
}

/**
 * @brief Helper struct to track info after "discard" preprocessing.
 */
struct ErroringContexts {
    bool app_logic_error = false;
    bool teardown_error = false;
    uint32_t app_logic_exit_context_id = 0;
    uint32_t teardown_exit_context_id = 0;
    std::unordered_map<uint32_t, bool> does_context_error;
};

/**
 * @brief Preprocess execution events to determine which contexts will error.
 *
 * @details This is used during trace-generation to populate the `discard` and `dying_context_id` columns
 * which must be set throughout a context that will EVENTUALLY error. So we need to do a
 * preprocessing pass so that we can set these columns properly during trace-generation for rows
 * in a dying context before the the actual error event is reached.
 *
 * @param ex_events The execution events.
 * @return The erroring contexts.
 */
ErroringContexts preprocess_for_discard(
    const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events)
{
    ErroringContexts dying_info;

    // Preprocessing pass 1: find the events that exit the app logic and teardown phases
    for (const auto& ex_event : ex_events) {
        bool is_exit = ex_event.opcode == ExecutionOpCode::RETURN || ex_event.opcode == ExecutionOpCode::REVERT ||
                       ex_event.exception;
        bool is_top_level = ex_event.after_context_event.parent_id == 0;

        if (is_exit && is_top_level) {
            // TODO(dbanks12): confirm this should be after_context_event and not before_context_event
            if (ex_event.after_context_event.phase == TransactionPhase::APP_LOGIC) {
                dying_info.app_logic_error = ex_event.opcode == ExecutionOpCode::REVERT || ex_event.exception;
                dying_info.app_logic_exit_context_id = ex_event.after_context_event.id;
            } else if (ex_event.after_context_event.phase == TransactionPhase::TEARDOWN) {
                dying_info.teardown_error = ex_event.opcode == ExecutionOpCode::REVERT || ex_event.exception;
                dying_info.teardown_exit_context_id = ex_event.after_context_event.id;
                break; // Teardown is the last phase we care about
            }
        }
    }

    // Preprocessing pass 2: find all contexts that error and mark them
    for (const auto& ex_event : ex_events) {
        if (ex_event.opcode == ExecutionOpCode::REVERT || ex_event.exception) {
            dying_info.does_context_error[ex_event.after_context_event.id] = true;
        }
    }

    return dying_info;
}

/**
 * @brief Check if an entire phase should "discard" [side effects].
 *
 * @param phase The phase to check.
 * @param errors The erroring contexts.
 * @return true if the phase should be discarded, false otherwise.
 */
bool is_phase_discarded(TransactionPhase phase, ErroringContexts& errors)
{
    // Note that app logic also gets discarded if teardown errors
    return (phase == TransactionPhase::APP_LOGIC && (errors.app_logic_error || errors.teardown_error)) ||
           (phase == TransactionPhase::TEARDOWN && errors.teardown_error);
}

/**
 * @brief Get the dying context ID for a phase.
 *
 * @param phase The phase to check.
 * @param errors The erroring contexts.
 * @return The dying context ID for the phase if any, 0 otherwise.
 */
uint32_t dying_context_for_phase(TransactionPhase phase, ErroringContexts& errors)
{
    switch (phase) {
    case TransactionPhase::APP_LOGIC:
        // Note that app logic also gets discarded if teardown errors
        return errors.app_logic_error  ? errors.app_logic_exit_context_id
               : errors.teardown_error ? errors.teardown_exit_context_id
                                       : 0;
    case TransactionPhase::TEARDOWN:
        return errors.teardown_error ? errors.teardown_exit_context_id : 0;
    default:
        throw std::runtime_error("Execution events should have app logic or teardown phase");
    }
}

} // namespace

// TODO: Currently we accept the execution opcode, we need a way to map this to the actual selector for the circuit
// we should be able to leverage the instruction specification table for this
void ExecutionTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.

    // Preprocess events to determine which contexts will error
    ErroringContexts errors = preprocess_for_discard(ex_events);

    uint32_t last_seen_parent_id = 0;
    FF cached_parent_id_inv = 0;

    // Some variables updated per loop iteration to track
    // whether or not the upcoming row should "discard" [side effects].
    uint32_t discard = 0;
    uint32_t dying_context_id = 0;
    bool is_first_event_in_enqueued_call = true;

    for (const auto& ex_event : ex_events) {
        const auto& addr_event = ex_event.addressing_event;

        // Check if this is the first event in an enqueued call
        if (discard == 0 && is_first_event_in_enqueued_call &&
            is_phase_discarded(ex_event.after_context_event.phase, errors)) {
            discard = 1;
            dying_context_id = dying_context_for_phase(ex_event.after_context_event.phase, errors);
        }

        // TODO(ilyas): These operands will likely also need to obey the exec instruction spec, i.e. a SET will
        // require the sole operand in op3 instead of "compactly" in op1. Ideally this encoding is done in
        // EXEC_INSTRUCTION_SPEC and we can use that to fill in the operands here.
        auto operands = ex_event.wire_instruction.operands;
        assert(operands.size() <= operand_columns);
        operands.resize(operand_columns, simulation::Operand::from<FF>(0));
        auto resolved_operands = ex_event.resolved_operands;
        assert(resolved_operands.size() <= operand_columns);
        resolved_operands.resize(operand_columns, simulation::Operand::from<FF>(0));

        // TODO: remove this once we support all opcodes.
        bool ex_opcode_exists =
            REGISTER_INFO_MAP.contains(ex_event.opcode) && SUBTRACE_INFO_MAP.contains(ex_event.opcode);

        std::array<TaggedValue, operand_columns> registers = {};
        size_t input_counter = 0;
        auto register_info =
            ex_opcode_exists ? REGISTER_INFO_MAP.at(ex_event.opcode) : REGISTER_INFO_MAP.at(ExecutionOpCode::ADD);
        for (uint8_t i = 0; i < operand_columns; ++i) {
            if (register_info.is_active(i)) {
                if (register_info.is_write(i)) {
                    // If this is a write operation, we need to get the value from the output.
                    registers[i] = ex_event.output;
                } else {
                    // If this is a read operation, we need to get the value from the input.
                    auto input = ex_event.inputs.size() > input_counter ? ex_event.inputs[input_counter]
                                                                        : TaggedValue::from<FF>(0);
                    registers[i] = input;
                    input_counter++;
                }
            }
        }

        const SubtraceInfo& dispatch_to_subtrace =
            ex_opcode_exists ? SUBTRACE_INFO_MAP.at(ex_event.opcode) : SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD);

        // Overly verbose but maximising readibility here
        bool is_call = ex_event.opcode == ExecutionOpCode::CALL;
        bool is_static_call = ex_event.opcode == ExecutionOpCode::STATICCALL;
        bool is_return = ex_event.opcode == ExecutionOpCode::RETURN;
        bool is_revert = ex_event.opcode == ExecutionOpCode::REVERT;
        bool is_exception = ex_event.exception;
        bool is_error = is_revert || is_exception;
        bool has_parent = ex_event.after_context_event.parent_id != 0;
        bool sel_enter_call = (is_call || is_static_call) && !is_exception;
        bool sel_exit_call = is_return || is_revert || is_exception;
        bool nested_exit_call = sel_exit_call && has_parent;
        // We rollback if we revert or error and we have a parent context.
        bool rollback_context = (ex_event.opcode == ExecutionOpCode::REVERT || ex_event.exception) && has_parent;

        // Cache the parent id inversion since we will repeatedly just be doing the same expensive inversion
        if (last_seen_parent_id != ex_event.after_context_event.parent_id) {
            last_seen_parent_id = ex_event.after_context_event.parent_id;
            cached_parent_id_inv = has_parent ? FF(ex_event.after_context_event.parent_id).invert() : 0;
        }

        trace.set(
            row,
            { {
                { C::execution_sel, 1 }, // active execution trace
                { C::execution_ex_opcode, static_cast<size_t>(ex_event.opcode) },
                { C::execution_indirect, ex_event.wire_instruction.indirect },
                { C::execution_sel_call, is_call ? 1 : 0 },
                { C::execution_sel_static_call, is_static_call ? 1 : 0 },
                { C::execution_sel_enter_call, sel_enter_call ? 1 : 0 },
                { C::execution_sel_return, is_return ? 1 : 0 },
                { C::execution_sel_revert, is_revert ? 1 : 0 },
                { C::execution_sel_error, is_exception ? 1 : 0 },
                { C::execution_sel_exit_call, sel_exit_call ? 1 : 0 },
                { C::execution_bytecode_id, ex_event.bytecode_id },
                // Nested Context Control Flow
                { C::execution_has_parent_ctx, has_parent ? 1 : 0 },
                { C::execution_is_parent_id_inv, cached_parent_id_inv },
                { C::execution_nested_exit_call, nested_exit_call ? 1 : 0 },
                { C::execution_rollback_context, rollback_context ? 1 : 0 },
                // Operands
                { C::execution_op1, operands.at(0) },
                { C::execution_op2, operands.at(1) },
                { C::execution_op3, operands.at(2) },
                { C::execution_op4, operands.at(3) },
                { C::execution_op5, operands.at(4) },
                { C::execution_op6, operands.at(5) },
                { C::execution_op7, operands.at(6) },
                // Resolved Operands
                { C::execution_rop1, resolved_operands.at(0) },
                { C::execution_rop2, resolved_operands.at(1) },
                { C::execution_rop3, resolved_operands.at(2) },
                { C::execution_rop4, resolved_operands.at(3) },
                { C::execution_rop5, resolved_operands.at(4) },
                { C::execution_rop6, resolved_operands.at(5) },
                { C::execution_rop7, resolved_operands.at(6) },
                // Selectors for memory operations
                { C::execution_mem_op1, register_info.is_active(0) ? 1 : 0 },
                { C::execution_mem_op2, register_info.is_active(1) ? 1 : 0 },
                { C::execution_mem_op3, register_info.is_active(2) ? 1 : 0 },
                { C::execution_mem_op4, register_info.is_active(3) ? 1 : 0 },
                { C::execution_mem_op5, register_info.is_active(4) ? 1 : 0 },
                { C::execution_mem_op6, register_info.is_active(5) ? 1 : 0 },
                { C::execution_mem_op7, register_info.is_active(6) ? 1 : 0 },
                // Read / Write Selectors
                { C::execution_rw1, register_info.is_write(0) ? 1 : 0 },
                { C::execution_rw2, register_info.is_write(1) ? 1 : 0 },
                { C::execution_rw3, register_info.is_write(2) ? 1 : 0 },
                { C::execution_rw4, register_info.is_write(3) ? 1 : 0 },
                { C::execution_rw5, register_info.is_write(4) ? 1 : 0 },
                { C::execution_rw6, register_info.is_write(5) ? 1 : 0 },
                { C::execution_rw7, register_info.is_write(6) ? 1 : 0 },
                // Register Values
                { C::execution_reg1, registers[0].as_ff() },
                { C::execution_reg2, registers[1].as_ff() },
                { C::execution_reg3, registers[2].as_ff() },
                { C::execution_reg4, registers[3].as_ff() },
                { C::execution_reg5, registers[4].as_ff() },
                { C::execution_reg6, registers[5].as_ff() },
                { C::execution_reg7, registers[6].as_ff() },
                // Associated Mem Tags of Register values
                { C::execution_mem_tag1, static_cast<uint8_t>(registers[0].get_tag()) },
                { C::execution_mem_tag2, static_cast<uint8_t>(registers[1].get_tag()) },
                { C::execution_mem_tag3, static_cast<uint8_t>(registers[2].get_tag()) },
                { C::execution_mem_tag4, static_cast<uint8_t>(registers[3].get_tag()) },
                { C::execution_mem_tag5, static_cast<uint8_t>(registers[4].get_tag()) },
                { C::execution_mem_tag6, static_cast<uint8_t>(registers[5].get_tag()) },
                { C::execution_mem_tag7, static_cast<uint8_t>(registers[6].get_tag()) },
                // Selector Id
                { C::execution_subtrace_operation_id, dispatch_to_subtrace.subtrace_operation_id },
                // Selectors
                { C::execution_sel_alu, dispatch_to_subtrace.subtrace_selector == SubtraceSel::ALU ? 1 : 0 },
                { C::execution_sel_bitwise, dispatch_to_subtrace.subtrace_selector == SubtraceSel::BITWISE ? 1 : 0 },
                { C::execution_sel_poseidon2_perm,
                  dispatch_to_subtrace.subtrace_selector == SubtraceSel::POSEIDON2PERM ? 1 : 0 },
                { C::execution_sel_to_radix, dispatch_to_subtrace.subtrace_selector == SubtraceSel::TORADIXBE ? 1 : 0 },
            } });

        auto operands_after_relative = addr_event.after_relative;
        assert(operands_after_relative.size() <= operand_columns);
        operands_after_relative.resize(operand_columns, simulation::Operand::from<FF>(0));

        const ExecInstructionSpec& ex_spec = ex_opcode_exists ? EXEC_INSTRUCTION_SPEC.at(ex_event.opcode)
                                                              : EXEC_INSTRUCTION_SPEC.at(ExecutionOpCode::ADD);
        // Addressing
        trace.set(
            row,
            { {
                { C::execution_base_address_val, addr_event.base_address.as_ff() },
                { C::execution_base_address_tag, static_cast<size_t>(addr_event.base_address.get_tag()) },
                { C::execution_sel_addressing_error, addr_event.error.has_value() ? 1 : 0 },
                { C::execution_addressing_error_idx, addr_event.error.has_value() ? addr_event.error->operand_idx : 0 },
                { C::execution_addressing_error_kind,
                  addr_event.error.has_value() ? static_cast<size_t>(addr_event.error->error) : 0 },
                { C::execution_sel_op1_is_address, ex_spec.num_addresses <= 1 ? 1 : 0 },
                { C::execution_sel_op2_is_address, ex_spec.num_addresses <= 2 ? 1 : 0 },
                { C::execution_sel_op3_is_address, ex_spec.num_addresses <= 3 ? 1 : 0 },
                { C::execution_sel_op4_is_address, ex_spec.num_addresses <= 4 ? 1 : 0 },
                { C::execution_sel_op5_is_address, ex_spec.num_addresses <= 5 ? 1 : 0 },
                { C::execution_sel_op6_is_address, ex_spec.num_addresses <= 6 ? 1 : 0 },
                { C::execution_sel_op7_is_address, ex_spec.num_addresses <= 7 ? 1 : 0 },
                // After Relative
                { C::execution_op1_after_relative, operands_after_relative.at(0) },
                { C::execution_op2_after_relative, operands_after_relative.at(1) },
                { C::execution_op3_after_relative, operands_after_relative.at(2) },
                { C::execution_op4_after_relative, operands_after_relative.at(3) },
                { C::execution_op5_after_relative, operands_after_relative.at(4) },
                { C::execution_op6_after_relative, operands_after_relative.at(5) },
                { C::execution_op7_after_relative, operands_after_relative.at(6) },
            } });

        // Context
        trace.set(
            row,
            { {
                { C::execution_context_id, ex_event.after_context_event.id },
                { C::execution_parent_id, ex_event.after_context_event.parent_id },
                { C::execution_pc, ex_event.before_context_event.pc },
                { C::execution_next_pc, ex_event.after_context_event.pc },
                { C::execution_is_static, ex_event.after_context_event.is_static },
                { C::execution_msg_sender, ex_event.after_context_event.msg_sender },
                { C::execution_contract_address, ex_event.after_context_event.contract_addr },
                { C::execution_parent_calldata_offset_addr, ex_event.after_context_event.parent_cd_addr },
                { C::execution_parent_calldata_size_addr, ex_event.after_context_event.parent_cd_size_addr },
                { C::execution_last_child_returndata_offset_addr, ex_event.after_context_event.last_child_rd_addr },
                { C::execution_last_child_returndata_size, ex_event.after_context_event.last_child_rd_size_addr },
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
            } });

        bool is_dying_context = discard == 1 && (ex_event.after_context_event.id == dying_context_id);

        // Need to generate the item below for checking "is dying context" in circuit
        FF dying_context_diff_inv = 0;
        if (discard == 1 && !is_dying_context) {
            // Compute inversion when context_id != dying_context_id
            FF diff = FF(ex_event.after_context_event.id) - FF(dying_context_id);
            if (!diff.is_zero()) {
                dying_context_diff_inv = diff.invert();
            }
        }

        // Discarding
        trace.set(row,
                  { {
                      // TODO(dbanks12): fix after rename and/or move of this sel to main execution
                      { C::execution_sel_revert_or_exception, is_error ? 1 : 0 },
                      { C::execution_discard, discard },
                      { C::execution_dying_context_id, dying_context_id },
                      { C::execution_is_dying_context, is_dying_context ? 1 : 0 },
                      { C::execution_dying_context_diff_inv, dying_context_diff_inv },
                  } });

        // Base gas
        Gas gas_used_after_base = ex_event.before_context_event.gas_used + ex_event.gas_event.base_gas;

        uint32_t limit_used_base_l2_cmp_diff =
            gas_comparison_witness(ex_event.after_context_event.gas_limit.l2Gas, gas_used_after_base.l2Gas);
        uint32_t limit_used_base_da_cmp_diff =
            gas_comparison_witness(ex_event.after_context_event.gas_limit.daGas, gas_used_after_base.daGas);

        auto [limit_used_base_l2_cmp_diff_lo, limit_used_base_l2_cmp_diff_hi] =
            decompose_gas_value(limit_used_base_l2_cmp_diff);
        auto [limit_used_base_da_cmp_diff_lo, limit_used_base_da_cmp_diff_hi] =
            decompose_gas_value(limit_used_base_da_cmp_diff);

        // Dynamic gas
        Gas gas_used_after_dynamic = gas_used_after_base + ex_event.gas_event.dynamic_gas_used;
        uint32_t limit_used_dynamic_l2_cmp_diff = 0;
        uint32_t limit_used_dynamic_da_cmp_diff = 0;
        if (!ex_event.gas_event.oog_base_l2 || !ex_event.gas_event.oog_base_da) {
            limit_used_dynamic_l2_cmp_diff =
                gas_comparison_witness(ex_event.after_context_event.gas_limit.l2Gas, gas_used_after_dynamic.l2Gas);
            limit_used_dynamic_da_cmp_diff =
                gas_comparison_witness(ex_event.after_context_event.gas_limit.daGas, gas_used_after_dynamic.daGas);
        }

        auto [limit_used_dynamic_l2_cmp_diff_lo, limit_used_dynamic_l2_cmp_diff_hi] =
            decompose_gas_value(limit_used_dynamic_l2_cmp_diff);
        auto [limit_used_dynamic_da_cmp_diff_lo, limit_used_dynamic_da_cmp_diff_hi] =
            decompose_gas_value(limit_used_dynamic_da_cmp_diff);

        // Gas
        trace.set(
            row,
            { {
                { C::execution_opcode_gas, ex_event.gas_event.opcode_gas },
                { C::execution_addressing_gas, ex_event.gas_event.addressing_gas },
                { C::execution_base_l2_gas, ex_event.gas_event.base_gas.l2Gas },
                { C::execution_base_da_gas, ex_event.gas_event.base_gas.daGas },
                { C::execution_out_of_gas_base_l2, ex_event.gas_event.oog_base_l2 },
                { C::execution_out_of_gas_base_da, ex_event.gas_event.oog_base_da },
                { C::execution_out_of_gas_base, ex_event.gas_event.oog_base_l2 || ex_event.gas_event.oog_base_da },
                { C::execution_prev_l2_gas_used, ex_event.before_context_event.gas_used.l2Gas },
                { C::execution_prev_da_gas_used, ex_event.before_context_event.gas_used.daGas },
                { C::execution_limit_used_base_l2_cmp_diff, limit_used_base_l2_cmp_diff },
                { C::execution_limit_used_base_l2_cmp_diff_lo, limit_used_base_l2_cmp_diff_lo },
                { C::execution_limit_used_base_l2_cmp_diff_hi, limit_used_base_l2_cmp_diff_hi },
                { C::execution_limit_used_base_da_cmp_diff, limit_used_base_da_cmp_diff },
                { C::execution_limit_used_base_da_cmp_diff_lo, limit_used_base_da_cmp_diff_lo },
                { C::execution_limit_used_base_da_cmp_diff_hi, limit_used_base_da_cmp_diff_hi },
                { C::execution_should_run_dyn_gas_check, !ex_event.gas_event.oog_base_l2 },
                { C::execution_dynamic_l2_gas_factor, ex_event.gas_event.dynamic_gas_factor.l2Gas },
                { C::execution_dynamic_da_gas_factor, ex_event.gas_event.dynamic_gas_factor.daGas },
                { C::execution_dynamic_l2_gas, ex_event.gas_event.dynamic_gas.l2Gas },
                { C::execution_dynamic_da_gas, ex_event.gas_event.dynamic_gas.daGas },
                { C::execution_dynamic_l2_gas_used, ex_event.gas_event.dynamic_gas_used.l2Gas },
                { C::execution_dynamic_da_gas_used, ex_event.gas_event.dynamic_gas_used.daGas },
                { C::execution_out_of_gas_dynamic_l2, ex_event.gas_event.oog_dynamic_l2 },
                { C::execution_out_of_gas_dynamic_da, ex_event.gas_event.oog_dynamic_da },
                { C::execution_out_of_gas_dynamic,
                  ex_event.gas_event.oog_dynamic_l2 || ex_event.gas_event.oog_dynamic_da },
                { C::execution_limit_used_dynamic_l2_cmp_diff, limit_used_dynamic_l2_cmp_diff },
                { C::execution_limit_used_dynamic_l2_cmp_diff_lo, limit_used_dynamic_l2_cmp_diff_lo },
                { C::execution_limit_used_dynamic_l2_cmp_diff_hi, limit_used_dynamic_l2_cmp_diff_hi },
                { C::execution_limit_used_dynamic_da_cmp_diff, limit_used_dynamic_da_cmp_diff },
                { C::execution_limit_used_dynamic_da_cmp_diff_lo, limit_used_dynamic_da_cmp_diff_lo },
                { C::execution_limit_used_dynamic_da_cmp_diff_hi, limit_used_dynamic_da_cmp_diff_hi },
            } });

        // MORE SUPPORTING LOGIC FOR DISCARDING!

        // Trace-generation is done for this event.
        // Now, use this event to determine whether we should set/reset the discard flag for the NEXT event
        bool event_kills_dying_context =
            discard == 1 && is_error && ex_event.after_context_event.id == dying_context_id;

        if (event_kills_dying_context) {
            // Set/unset discard flag if the current event is the one that kills the dying context
            dying_context_id = 0;
            discard = 0;
        } else if (sel_enter_call && discard == 0 && !sel_exit_call &&
                   errors.does_context_error.contains(ex_event.next_context_id)) {
            // If making a nested call, and discard isn't already high...
            // if the nested context being entered eventually dies, raise discard flag and remember which context is
            // dying NOTE: if a [STATIC]CALL instruction _itself_ exits execution, we don't set the discard flag
            // because we aren't actually entering a new context!
            dying_context_id = ex_event.next_context_id;
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

std::vector<std::unique_ptr<InteractionBuilderInterface>> ExecutionTraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        // Execution
        std::make_unique<LookupIntoIndexedByClk<lookup_execution_exec_spec_read_settings>>(),
        // Gas
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_addressing_gas_read_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_base_l2_range_lo_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_base_l2_range_hi_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_base_da_range_lo_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_base_da_range_hi_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_dynamic_l2_range_lo_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_dynamic_l2_range_hi_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_dynamic_da_range_lo_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_dynamic_da_range_hi_settings>>());
}

} // namespace bb::avm2::tracegen
