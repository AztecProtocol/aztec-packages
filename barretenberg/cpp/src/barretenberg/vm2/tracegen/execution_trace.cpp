#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <numeric>
#include <ranges>
#include <stdexcept>
#include <sys/types.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/addressing.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_addressing.hpp"
#include "barretenberg/vm2/generated/relations/lookups_call_opcode.hpp"
#include "barretenberg/vm2/generated/relations/lookups_execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_gas.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

using C = bb::avm2::Column;
using bb::avm2::simulation::AddressingEventError;
using bb::avm2::simulation::ExecutionError;

namespace bb::avm2::tracegen {
namespace {

constexpr size_t NUM_OPERANDS = 7;
constexpr std::array<Column, NUM_OPERANDS> OPERAND_COLUMNS = {
    C::execution_op_0_, C::execution_op_1_, C::execution_op_2_, C::execution_op_3_,
    C::execution_op_4_, C::execution_op_5_, C::execution_op_6_,
};
constexpr std::array<Column, NUM_OPERANDS> OPERAND_IS_ADDRESS_COLUMNS = {
    C::execution_sel_op_is_address_0_, C::execution_sel_op_is_address_1_, C::execution_sel_op_is_address_2_,
    C::execution_sel_op_is_address_3_, C::execution_sel_op_is_address_4_, C::execution_sel_op_is_address_5_,
    C::execution_sel_op_is_address_6_,
};
constexpr std::array<Column, NUM_OPERANDS> OPERAND_AFTER_RELATIVE_COLUMNS = {
    C::execution_op_after_relative_0_, C::execution_op_after_relative_1_, C::execution_op_after_relative_2_,
    C::execution_op_after_relative_3_, C::execution_op_after_relative_4_, C::execution_op_after_relative_5_,
    C::execution_op_after_relative_6_,
};
constexpr std::array<Column, NUM_OPERANDS> RESOLVED_OPERAND_COLUMNS = {
    C::execution_rop_0_, C::execution_rop_1_, C::execution_rop_2_, C::execution_rop_3_,
    C::execution_rop_4_, C::execution_rop_5_, C::execution_rop_6_,
};
constexpr std::array<Column, NUM_OPERANDS> RESOLVED_OPERAND_TAG_COLUMNS = {
    C::execution_rop_tag_0_, C::execution_rop_tag_1_, C::execution_rop_tag_2_, C::execution_rop_tag_3_,
    C::execution_rop_tag_4_, C::execution_rop_tag_5_, C::execution_rop_tag_6_,
};
constexpr std::array<Column, NUM_OPERANDS> OPERAND_SHOULD_APPLY_INDIRECTION_COLUMNS = {
    C::execution_sel_should_apply_indirection_0_, C::execution_sel_should_apply_indirection_1_,
    C::execution_sel_should_apply_indirection_2_, C::execution_sel_should_apply_indirection_3_,
    C::execution_sel_should_apply_indirection_4_, C::execution_sel_should_apply_indirection_5_,
    C::execution_sel_should_apply_indirection_6_,
};
constexpr std::array<Column, NUM_OPERANDS> OPERAND_RELATIVE_OVERFLOW_COLUMNS = {
    C::execution_sel_relative_overflow_0_, C::execution_sel_relative_overflow_1_, C::execution_sel_relative_overflow_2_,
    C::execution_sel_relative_overflow_3_, C::execution_sel_relative_overflow_4_, C::execution_sel_relative_overflow_5_,
    C::execution_sel_relative_overflow_6_,
};

constexpr size_t TOTAL_INDIRECT_BITS = 16;
static_assert(NUM_OPERANDS * 2 <= TOTAL_INDIRECT_BITS);
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

constexpr size_t NUM_REGISTERS = 7;
constexpr std::array<Column, NUM_REGISTERS> REGISTER_COLUMNS = {
    C::execution_register_0_, C::execution_register_1_, C::execution_register_2_, C::execution_register_3_,
    C::execution_register_4_, C::execution_register_5_, C::execution_register_6_,
};
constexpr std::array<Column, NUM_REGISTERS> REGISTER_MEM_TAG_COLUMNS = {
    C::execution_mem_tag_0_, C::execution_mem_tag_1_, C::execution_mem_tag_2_, C::execution_mem_tag_3_,
    C::execution_mem_tag_4_, C::execution_mem_tag_5_, C::execution_mem_tag_6_,
};
constexpr std::array<Column, NUM_REGISTERS> REGISTER_IS_WRITE_COLUMNS = {
    C::execution_rw_0_, C::execution_rw_1_, C::execution_rw_2_, C::execution_rw_3_,
    C::execution_rw_4_, C::execution_rw_5_, C::execution_rw_6_,
};
constexpr std::array<Column, NUM_REGISTERS> REGISTER_MEM_OP_COLUMNS = {
    C::execution_mem_op_0_, C::execution_mem_op_1_, C::execution_mem_op_2_, C::execution_mem_op_3_,
    C::execution_mem_op_4_, C::execution_mem_op_5_, C::execution_mem_op_6_,
};

} // namespace

void ExecutionTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events, TraceContainer& trace)
{
    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.

    uint32_t last_seen_parent_id = 0;
    FF cached_parent_id_inv = 0;

    for (const auto& ex_event : ex_events) {
        /**************************************************************************************************
         *  Setup.
         **************************************************************************************************/

        trace.set(
            row,
            { {
                // Context
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
                // Context - gas.
                { C::execution_prev_l2_gas_used, ex_event.before_context_event.gas_used.l2Gas },
                { C::execution_prev_da_gas_used, ex_event.before_context_event.gas_used.daGas },
                // Other.
                { C::execution_bytecode_id, ex_event.bytecode_id },
            } });

        /**************************************************************************************************
         *  Temporality group 1: Instruction fetching.
         **************************************************************************************************/

        // This will only have a value if instruction fetching succeeded.
        std::optional<ExecutionOpCode> exec_opcode;
        bool instruction_fetching_failed = ex_event.error == ExecutionError::INSTRUCTION_FETCHING;
        trace.set(C::execution_sel_instruction_fetching_failure, row, instruction_fetching_failed ? 1 : 0);
        if (!instruction_fetching_failed) {
            exec_opcode = ex_event.wire_instruction.get_exec_opcode();
            process_instr_fetching(ex_event.wire_instruction, trace, row);
        }

        /**************************************************************************************************
         *  Temporality group 2: Mapping from wire to execution and Base gas.
         **************************************************************************************************/

        // Along this function we need to set the info we get from the EXEC_SPEC_READ lookup.
        // However, we will not do it all in the same place. We do it by temporality groups, but always unconditionally.
        bool should_read_exec_spec = !instruction_fetching_failed;
        if (should_read_exec_spec) {
            process_execution_spec(ex_event, trace, row);
        }

        bool should_check_gas = !instruction_fetching_failed;
        bool oog_base = ex_event.error == ExecutionError::GAS_BASE;
        trace.set(C::execution_sel_should_check_gas, row, should_check_gas ? 1 : 0);
        if (should_check_gas) {
            process_gas_base(ex_event.gas_event, trace, row);
        }

        /**************************************************************************************************
         *  Temporality group 3: Addressing.
         **************************************************************************************************/

        bool should_resolve_address = should_check_gas && !oog_base;
        trace.set(C::execution_sel_should_resolve_address, row, should_resolve_address ? 1 : 0);
        if (should_resolve_address) {
            process_addressing(ex_event.addressing_event, ex_event.wire_instruction, trace, row);
        }
        bool addressing_failed = ex_event.error == ExecutionError::ADDRESSING;

        /**************************************************************************************************
         *  Temporality group...: Registers.
         **************************************************************************************************/

        std::array<TaggedValue, NUM_REGISTERS> registers;
        std::fill(registers.begin(), registers.end(), TaggedValue::from<FF>(0));
        bool should_process_registers = should_resolve_address && !addressing_failed;
        bool register_processing_failed = ex_event.error == ExecutionError::REGISTERS;
        if (should_process_registers) {
            process_registers(*exec_opcode, ex_event.inputs, ex_event.output, registers, trace, row);
        }

        /**************************************************************************************************
         *  Temporality group...: Dynamic gas.
         **************************************************************************************************/

        bool should_process_dynamic_gas = should_process_registers && !register_processing_failed;
        bool oog_dynamic = ex_event.error == ExecutionError::GAS_DYNAMIC;
        trace.set(C::execution_should_run_dyn_gas_check, row, should_process_dynamic_gas ? 1 : 0);
        if (should_process_dynamic_gas) {
            process_dynamic_gas(ex_event.gas_event, trace, row);
        }

        /**************************************************************************************************
         *  Temporality group...: Dispatching.
         **************************************************************************************************/

        // TODO(ilyas): This can possibly be gated with some boolean but I'm not sure what is going on.

        // Overly verbose but maximising readibility here
        bool is_call = exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::CALL;
        bool is_static_call = exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::STATICCALL;
        bool is_return = exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::RETURN;
        bool is_revert = exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::REVERT;
        bool is_err = ex_event.error != ExecutionError::NONE;
        bool has_parent = ex_event.after_context_event.parent_id != 0;
        bool sel_enter_call = (is_call || is_static_call) && !is_err;
        bool sel_exit_call = is_return || is_revert || is_err;
        bool nested_exit_call = sel_exit_call && has_parent;
        // We rollback if we revert or error and we have a parent context.
        bool rollback_context =
            ((exec_opcode.has_value() && *exec_opcode == ExecutionOpCode::REVERT) || is_err) && has_parent;

        // Cache the parent id inversion since we will repeatedly just be doing the same expensive inversion
        if (last_seen_parent_id != ex_event.after_context_event.parent_id) {
            last_seen_parent_id = ex_event.after_context_event.parent_id;
            cached_parent_id_inv = has_parent ? FF(ex_event.after_context_event.parent_id).invert() : 0;
        }

        // Nested Context Control Flow and helper columns
        trace.set(row,
                  { {
                      { C::execution_has_parent_ctx, has_parent ? 1 : 0 },
                      { C::execution_is_parent_id_inv, cached_parent_id_inv },
                      { C::execution_nested_exit_call, nested_exit_call ? 1 : 0 },
                      { C::execution_rollback_context, rollback_context ? 1 : 0 },
                      // Helper columns
                      { C::execution_sel, 1 },
                      { C::execution_sel_error, is_err ? 1 : 0 },
                      { C::execution_sel_call, is_call ? 1 : 0 },
                      { C::execution_sel_static_call, is_static_call ? 1 : 0 },
                      { C::execution_sel_enter_call, sel_enter_call ? 1 : 0 },
                      { C::execution_sel_return, is_return ? 1 : 0 },
                      { C::execution_sel_revert, is_revert ? 1 : 0 },
                      { C::execution_sel_exit_call, sel_exit_call ? 1 : 0 },
                  } });

        bool should_process_dispatching = should_process_dynamic_gas && !oog_dynamic;
        if (should_process_dispatching) {
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
                              { C::execution_constant_32, 32 },
                              { C::execution_call_is_l2_gas_allocated_lt_left, is_l2_gas_allocated_lt_left },
                              { C::execution_call_allocated_left_l2_cmp_diff, allocated_left_l2_cmp_diff },
                              { C::execution_call_is_da_gas_allocated_lt_left, is_da_gas_allocated_lt_left },
                              { C::execution_call_allocated_left_da_cmp_diff, allocated_left_da_cmp_diff },
                          } });
            }
        }

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
    assert(operands.size() <= NUM_OPERANDS);
    operands.resize(NUM_OPERANDS, simulation::Operand::from<FF>(0));

    for (size_t i = 0; i < NUM_OPERANDS; i++) {
        trace.set(OPERAND_COLUMNS[i], row, operands.at(i));
    }
}

void ExecutionTraceBuilder::process_execution_spec(const simulation::ExecutionEvent& ex_event,
                                                   TraceContainer& trace,
                                                   uint32_t row)
{
    trace.set(row,
              { {
                  // Gas.
                  { C::execution_opcode_gas, ex_event.gas_event.opcode_gas },
                  { C::execution_base_da_gas, ex_event.gas_event.base_gas.daGas },
                  { C::execution_dynamic_l2_gas, ex_event.gas_event.dynamic_gas.l2Gas },
                  { C::execution_dynamic_da_gas, ex_event.gas_event.dynamic_gas.daGas },
              } });

    // At this point we can assume instruction fetching succeeded, so this should never fail.
    ExecutionOpCode exec_opcode = ex_event.wire_instruction.get_exec_opcode();
    const auto& register_info = REGISTER_INFO_MAP.at(exec_opcode);

    for (size_t i = 0; i < NUM_REGISTERS; i++) {
        trace.set(REGISTER_IS_WRITE_COLUMNS[i], row, register_info.is_write(static_cast<uint8_t>(i)) ? 1 : 0);
        trace.set(REGISTER_MEM_OP_COLUMNS[i], row, register_info.is_active(static_cast<uint8_t>(i)) ? 1 : 0);
    }

    // At this point we can assume instruction fetching succeeded, so this should never fail.
    const auto& dispatch_to_subtrace = SUBTRACE_INFO_MAP.at(exec_opcode);

    // Subtrace dispatching.
    trace.set(
        row,
        { {
            // Selector Id
            { C::execution_subtrace_operation_id, dispatch_to_subtrace.subtrace_operation_id },
            // Selectors
            { C::execution_sel_alu, dispatch_to_subtrace.subtrace_selector == SubtraceSel::ALU ? 1 : 0 },
            { C::execution_sel_bitwise, dispatch_to_subtrace.subtrace_selector == SubtraceSel::BITWISE ? 1 : 0 },
            { C::execution_sel_poseidon2_perm,
              dispatch_to_subtrace.subtrace_selector == SubtraceSel::POSEIDON2PERM ? 1 : 0 },
            { C::execution_sel_to_radix, dispatch_to_subtrace.subtrace_selector == SubtraceSel::TORADIXBE ? 1 : 0 },
            { C::execution_sel_ecc_add, dispatch_to_subtrace.subtrace_selector == SubtraceSel::ECC ? 1 : 0 },
        } });
}

void ExecutionTraceBuilder::process_dynamic_gas(const simulation::GasEvent& gas_event,
                                                TraceContainer& trace,
                                                uint32_t row)
{
    trace.set(row,
              { {
                  { C::execution_dynamic_l2_gas_factor, gas_event.dynamic_gas_factor.l2Gas },
                  { C::execution_dynamic_da_gas_factor, gas_event.dynamic_gas_factor.daGas },
                  { C::execution_out_of_gas_dynamic_l2, gas_event.oog_dynamic_l2 },
                  { C::execution_out_of_gas_dynamic_da, gas_event.oog_dynamic_da },
                  { C::execution_out_of_gas_dynamic, (gas_event.oog_dynamic_l2 || gas_event.oog_dynamic_da) ? 1 : 0 },
              } });
}

void ExecutionTraceBuilder::process_gas_base(const simulation::GasEvent& gas_event, TraceContainer& trace, uint32_t row)
{
    trace.set(row,
              { {
                  { C::execution_addressing_gas, gas_event.addressing_gas },
                  { C::execution_out_of_gas_base_l2, gas_event.oog_base_l2 },
                  { C::execution_out_of_gas_base_da, gas_event.oog_base_da },
                  { C::execution_limit_used_l2_cmp_diff, gas_event.limit_used_l2_comparison_witness },
                  { C::execution_limit_used_da_cmp_diff, gas_event.limit_used_da_comparison_witness },
                  { C::execution_constant_64, 64 },
                  { C::execution_out_of_gas_base, (gas_event.oog_base_l2 || gas_event.oog_base_da) ? 1 : 0 },
              } });
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
    assert(resolution_info_vec.size() <= NUM_OPERANDS);
    resolution_info_vec.resize(NUM_OPERANDS);

    std::array<bool, NUM_OPERANDS> is_address{};
    std::array<bool, NUM_OPERANDS> should_apply_indirection{};
    std::array<bool, NUM_OPERANDS> relative_oob{};
    std::array<FF, NUM_OPERANDS> after_relative{};
    std::array<FF, NUM_OPERANDS> resolved_operand{};
    std::array<uint8_t, NUM_OPERANDS> resolved_operand_tag{};
    uint8_t num_relative_operands = 0;

    // Gather operand information.
    for (size_t i = 0; i < NUM_OPERANDS; i++) {
        const auto& resolution_info = resolution_info_vec.at(i);
        bool op_is_address = i < ex_spec.num_addresses;
        relative_oob[i] = resolution_info.error.has_value() &&
                          *resolution_info.error == AddressingEventError::RELATIVE_COMPUTATION_OOB;
        bool is_indirect_effective = op_is_address && is_operand_indirect(instruction.indirect, i);
        bool is_relative_effective = op_is_address && is_operand_relative(instruction.indirect, i);
        is_address[i] = op_is_address;
        should_apply_indirection[i] = is_indirect_effective && !relative_oob[i];
        resolved_operand_tag[i] = static_cast<uint8_t>(resolution_info.resolved_operand.get_tag());
        after_relative[i] = resolution_info.after_relative;
        resolved_operand[i] = resolution_info.resolved_operand;
        if (is_relative_effective) {
            num_relative_operands++;
        }
    }

    // Set the operand columns.
    for (size_t i = 0; i < NUM_OPERANDS; i++) {
        trace.set(row,
                  { {
                      { OPERAND_IS_ADDRESS_COLUMNS[i], is_address[i] ? 1 : 0 },
                      { OPERAND_RELATIVE_OVERFLOW_COLUMNS[i], relative_oob[i] ? 1 : 0 },
                      { OPERAND_AFTER_RELATIVE_COLUMNS[i], after_relative[i] },
                      { OPERAND_SHOULD_APPLY_INDIRECTION_COLUMNS[i], should_apply_indirection[i] ? 1 : 0 },
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
        base_address_invalid ? FF(static_cast<uint8_t>(addr_event.base_address.get_tag()) - MEM_TAG_U32).invert() : 0;

    // Tag check after indirection.
    bool some_final_check_failed =
        std::any_of(addr_event.resolution_info.begin(), addr_event.resolution_info.end(), [](const auto& info) {
            return info.error.has_value() && *info.error == AddressingEventError::INVALID_ADDRESS_AFTER_INDIRECTION;
        });
    FF batched_tags_diff_inv = 0;
    if (some_final_check_failed) {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < NUM_OPERANDS; ++i) {
            batched_tags_diff += FF(is_address[i]) * FF(should_apply_indirection[i]) * power_of_2 *
                                 (FF(resolved_operand_tag[i]) - FF(MEM_TAG_U32));
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
              { { { C::execution_sel_addressing_error, addressing_failed ? 1 : 0 },
                  { C::execution_addressing_error_collection_inv, addressing_error_collection_inv },
                  { C::execution_base_address_val, addr_event.base_address.as_ff() },
                  { C::execution_base_address_tag, static_cast<uint8_t>(addr_event.base_address.get_tag()) },
                  { C::execution_base_address_tag_diff_inv, base_address_tag_diff_inv },
                  { C::execution_sel_base_address_failure, base_address_invalid ? 1 : 0 },
                  { C::execution_num_relative_operands_inv, do_base_check ? FF(num_relative_operands).invert() : 0 },
                  { C::execution_sel_do_base_check, do_base_check ? 1 : 0 } } });
}

void ExecutionTraceBuilder::process_registers(ExecutionOpCode exec_opcode,
                                              const std::vector<TaggedValue>& inputs,
                                              const TaggedValue& output,
                                              std::span<TaggedValue> registers,
                                              TraceContainer& trace,
                                              uint32_t row)
{
    assert(registers.size() == NUM_REGISTERS);
    // At this point we can assume instruction fetching succeeded, so this should never fail.
    const auto& register_info = REGISTER_INFO_MAP.at(exec_opcode);

    // Registers.
    size_t input_counter = 0;
    for (uint8_t i = 0; i < NUM_REGISTERS; ++i) {
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

    for (size_t i = 0; i < NUM_REGISTERS; i++) {
        trace.set(REGISTER_COLUMNS[i], row, registers[i]);
        trace.set(REGISTER_MEM_TAG_COLUMNS[i], row, static_cast<uint8_t>(registers[i].get_tag()));
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> ExecutionTraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        // Execution
        std::make_unique<LookupIntoIndexedByClk<lookup_execution_exec_spec_read_settings>>(),
        // Instruction fetching
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_execution_instruction_fetching_result_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_execution_instruction_fetching_body_settings>>(),
        // Addressing
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_addressing_base_address_from_memory_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_addressing_indirect_from_memory_0_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_addressing_indirect_from_memory_1_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_addressing_indirect_from_memory_2_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_addressing_indirect_from_memory_3_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_addressing_indirect_from_memory_4_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_addressing_indirect_from_memory_5_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_addressing_indirect_from_memory_6_settings>>(),
        // Gas
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_addressing_gas_read_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_gas_limit_used_l2_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_gas_limit_used_da_range_settings>>(),
        // Call opcode
        std::make_unique<LookupIntoIndexedByClk<lookup_call_opcode_call_allocated_left_l2_range_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_call_opcode_call_allocated_left_da_range_settings>>());
}

} // namespace bb::avm2::tracegen
