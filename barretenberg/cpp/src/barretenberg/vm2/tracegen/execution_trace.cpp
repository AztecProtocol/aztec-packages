#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>
#include <sys/types.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"

namespace bb::avm2::tracegen {
namespace {

constexpr size_t operand_columns = 7;

} // namespace

// TODO: Currently we accept the execution opcode, we need a way to map this to the actual selector for the circuit
// we should be able to leverage the instruction specification table for this
void ExecutionTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& orig_events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.

    // We need to sort the events by their order/sort id.
    // We allocate a vector of pointers so that the sorting doesn't move the whole events around.
    std::vector<const simulation::ExecutionEvent*> ex_events(orig_events.size());
    std::transform(orig_events.begin(), orig_events.end(), ex_events.begin(), [](const auto& event) { return &event; });
    std::ranges::sort(ex_events, [](const auto& lhs, const auto& rhs) { return lhs->order < rhs->order; });

    uint32_t last_seen_parent_id = 0;
    FF cached_parent_id_inv = 0;

    for (const auto& ex_event_ptr : ex_events) {
        const auto& ex_event = *ex_event_ptr;
        const auto& addr_event = ex_event.addressing_event;

        // TODO(ilyas): These operands will likely also need to obey the exec instruction spec, i.e. a SET will require
        // the sole operand in op3 instead of "compactly" in op1. Ideally this encoding is done in EXEC_INSTRUCTION_SPEC
        // and we can use that to fill in the operands here.
        auto operands = ex_event.wire_instruction.operands;
        assert(operands.size() <= operand_columns);
        operands.resize(operand_columns, simulation::Operand::from<FF>(0));
        auto resolved_operands = ex_event.resolved_operands;
        assert(resolved_operands.size() <= operand_columns);
        resolved_operands.resize(operand_columns, simulation::Operand::from<FF>(0));

        std::array<TaggedValue, operand_columns> registers = {};
        size_t input_counter = 0;
        auto register_info = REGISTER_INFO_MAP.at(ex_event.opcode);
        for (uint8_t i = 0; i < operand_columns; ++i) {
            if (register_info.is_active(i)) {
                if (register_info.is_write(i)) {
                    // If this is a write operation, we need to get the value from the output.
                    registers[i] = ex_event.output;
                } else {
                    // If this is a read operation, we need to get the value from the input.
                    registers[i] = ex_event.inputs[input_counter++];
                }
            }
        }
        const SubtraceInfo& dispatch_to_subtrace = SUBTRACE_INFO_MAP.at(ex_event.opcode);

        // Overly verbose but maximising readibility here
        bool is_call = ex_event.opcode == ExecutionOpCode::CALL;
        bool is_static_call = ex_event.opcode == ExecutionOpCode::STATICCALL;
        bool is_return = ex_event.opcode == ExecutionOpCode::RETURN;
        bool is_revert = ex_event.opcode == ExecutionOpCode::REVERT;
        bool is_err = ex_event.error;
        bool has_parent = ex_event.context_event.parent_id != 0;
        bool sel_enter_call = (is_call || is_static_call) && !is_err;
        bool sel_exit_call = is_return || is_revert || is_err;
        bool nested_exit_call = sel_exit_call && has_parent;
        // We rollback if we revert or error and we have a parent context.
        bool rollback_context = (ex_event.opcode == ExecutionOpCode::REVERT || ex_event.error) && has_parent;

        // Cache the parent id inversion since we will repeatedly just be doing the same expensive inversion
        if (last_seen_parent_id != ex_event.context_event.parent_id) {
            last_seen_parent_id = ex_event.context_event.parent_id;
            cached_parent_id_inv = has_parent ? FF(ex_event.context_event.parent_id).invert() : 0;
        }

        trace.set(
            row,
            { {
                { C::execution_sel, 1 }, // active execution trace
                { C::execution_ex_opcode, static_cast<size_t>(ex_event.opcode) },
                { C::execution_sel_call, is_call ? 1 : 0 },
                { C::execution_sel_static_call, is_static_call ? 1 : 0 },
                { C::execution_sel_enter_call, sel_enter_call ? 1 : 0 },
                { C::execution_sel_return, is_return ? 1 : 0 },
                { C::execution_sel_revert, is_revert ? 1 : 0 },
                { C::execution_sel_error, ex_event.error ? 1 : 0 },
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
                { C::execution_sel_op1_is_address, addr_event.spec->num_addresses <= 1 ? 1 : 0 },
                { C::execution_sel_op2_is_address, addr_event.spec->num_addresses <= 2 ? 1 : 0 },
                { C::execution_sel_op3_is_address, addr_event.spec->num_addresses <= 3 ? 1 : 0 },
                { C::execution_sel_op4_is_address, addr_event.spec->num_addresses <= 4 ? 1 : 0 },
                { C::execution_sel_op5_is_address, addr_event.spec->num_addresses <= 5 ? 1 : 0 },
                { C::execution_sel_op6_is_address, addr_event.spec->num_addresses <= 6 ? 1 : 0 },
                { C::execution_sel_op7_is_address, addr_event.spec->num_addresses <= 7 ? 1 : 0 },
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
        trace.set(row,
                  { {
                      { C::execution_context_id, ex_event.context_event.id },
                      { C::execution_parent_id, ex_event.context_event.parent_id },
                      { C::execution_pc, ex_event.context_event.pc },
                      { C::execution_next_pc, ex_event.context_event.next_pc },
                      { C::execution_is_static, ex_event.context_event.is_static },
                      { C::execution_msg_sender, ex_event.context_event.msg_sender },
                      { C::execution_contract_address, ex_event.context_event.contract_addr },
                      { C::execution_parent_calldata_offset_addr, ex_event.context_event.parent_cd_addr },
                      { C::execution_parent_calldata_size_addr, ex_event.context_event.parent_cd_size_addr },
                      { C::execution_last_child_returndata_offset_addr, ex_event.context_event.last_child_rd_addr },
                      { C::execution_last_child_returndata_size, ex_event.context_event.last_child_rd_size_addr },
                      { C::execution_last_child_success, ex_event.context_event.last_child_success },
                      { C::execution_next_context_id, ex_event.next_context_id },
                  } });

        row++;
    }

    if (!ex_events.empty()) {
        trace.set(C::execution_last, row - 1, 1);
    }
}

} // namespace bb::avm2::tracegen
