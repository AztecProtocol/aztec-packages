#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
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
    return limit > used ? limit - used : used - limit - 1;
}

std::pair<uint16_t, uint16_t> decompose_gas_value(uint32_t value)
{
    return { static_cast<uint16_t>(value & 0xFFFF), static_cast<uint16_t>(value >> 16) };
}

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

    uint32_t prev_l2_gas_used = 0;
    uint32_t prev_da_gas_used = 0;
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

        trace.set(
            row,
            { {
                { C::execution_sel, 1 }, // active execution trace
                { C::execution_ex_opcode, static_cast<size_t>(ex_event.opcode) },
                { C::execution_indirect, ex_event.wire_instruction.indirect },
                { C::execution_sel_call, ex_event.opcode == ExecutionOpCode::CALL ? 1 : 0 },
                { C::execution_sel_static_call, ex_event.opcode == ExecutionOpCode::STATICCALL ? 1 : 0 },
                { C::execution_bytecode_id, ex_event.bytecode_id },
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
                      { C::execution_last_child_returndata_size_addr, ex_event.context_event.last_child_rd_size_addr },
                      { C::execution_last_child_success, ex_event.context_event.last_child_success },
                      { C::execution_l2_gas_limit, ex_event.context_event.gas_limit.l2Gas },
                      { C::execution_da_gas_limit, ex_event.context_event.gas_limit.daGas },
                      { C::execution_l2_gas_used, ex_event.context_event.gas_used.l2Gas },
                      { C::execution_da_gas_used, ex_event.context_event.gas_used.daGas },
                      { C::execution_parent_l2_gas_limit, ex_event.context_event.parent_gas_limit.l2Gas },
                      { C::execution_parent_da_gas_limit, ex_event.context_event.parent_gas_limit.daGas },
                      { C::execution_parent_l2_gas_used, ex_event.context_event.parent_gas_used.l2Gas },
                      { C::execution_parent_da_gas_used, ex_event.context_event.parent_gas_used.daGas },
                      { C::execution_next_context_id, ex_event.next_context_id },
                  } });

        // Base gas
        uint32_t l2_gas_after_base = prev_l2_gas_used + ex_event.gas_event.base_gas.l2Gas;
        uint32_t da_gas_after_base = prev_da_gas_used + ex_event.gas_event.base_gas.daGas;

        uint32_t limit_used_l2_base_cmp_diff =
            gas_comparison_witness(ex_event.context_event.gas_limit.l2Gas, l2_gas_after_base);
        uint32_t limit_used_da_base_cmp_diff =
            gas_comparison_witness(ex_event.context_event.gas_limit.daGas, da_gas_after_base);

        auto [limit_used_l2_base_cmp_diff_lo, limit_used_l2_base_cmp_diff_hi] =
            decompose_gas_value(limit_used_l2_base_cmp_diff);
        auto [limit_used_da_base_cmp_diff_lo, limit_used_da_base_cmp_diff_hi] =
            decompose_gas_value(limit_used_da_base_cmp_diff);

        // Dynamic gas
        uint32_t l2_gas_after_dynamic = l2_gas_after_base + ex_event.gas_event.dynamic_gas.l2Gas;
        uint32_t da_gas_after_dynamic = da_gas_after_base + ex_event.gas_event.dynamic_gas.daGas;
        uint32_t limit_used_l2_dynamic_cmp_diff = 0;
        uint32_t limit_used_da_dynamic_cmp_diff = 0;
        if (!ex_event.gas_event.oog_l2_base || !ex_event.gas_event.oog_da_base) {
            limit_used_l2_dynamic_cmp_diff =
                gas_comparison_witness(ex_event.context_event.gas_limit.l2Gas, l2_gas_after_dynamic);
            limit_used_da_dynamic_cmp_diff =
                gas_comparison_witness(ex_event.context_event.gas_limit.daGas, da_gas_after_dynamic);
        }

        auto [limit_used_l2_dynamic_cmp_diff_lo, limit_used_l2_dynamic_cmp_diff_hi] =
            decompose_gas_value(limit_used_l2_dynamic_cmp_diff);
        auto [limit_used_da_dynamic_cmp_diff_lo, limit_used_da_dynamic_cmp_diff_hi] =
            decompose_gas_value(limit_used_da_dynamic_cmp_diff);

        // Gas
        trace.set(
            row,
            { {
                { C::execution_opcode_gas, ex_event.gas_event.opcode_gas },
                { C::execution_addressing_gas, ex_event.gas_event.addressing_gas },
                { C::execution_l2_base_gas, ex_event.gas_event.base_gas.l2Gas },
                { C::execution_da_base_gas, ex_event.gas_event.base_gas.daGas },
                { C::execution_out_of_gas_l2_base, ex_event.gas_event.oog_l2_base },
                { C::execution_out_of_gas_da_base, ex_event.gas_event.oog_da_base },
                { C::execution_out_of_gas_base, ex_event.gas_event.oog_l2_base || ex_event.gas_event.oog_da_base },
                { C::execution_prev_l2_gas_used, prev_l2_gas_used },
                { C::execution_prev_da_gas_used, prev_da_gas_used },
                { C::execution_limit_used_l2_base_cmp_diff, limit_used_l2_base_cmp_diff },
                { C::execution_limit_used_l2_base_cmp_diff_lo, limit_used_l2_base_cmp_diff_lo },
                { C::execution_limit_used_l2_base_cmp_diff_hi, limit_used_l2_base_cmp_diff_hi },
                { C::execution_limit_used_da_base_cmp_diff, limit_used_da_base_cmp_diff },
                { C::execution_limit_used_da_base_cmp_diff_lo, limit_used_da_base_cmp_diff_lo },
                { C::execution_limit_used_da_base_cmp_diff_hi, limit_used_da_base_cmp_diff_hi },
                { C::execution_should_run_dyn_gas_check, !ex_event.gas_event.oog_l2_base },
                { C::execution_l2_dynamic_gas_factor, ex_event.gas_event.dynamic_gas_factor.l2Gas },
                { C::execution_da_dynamic_gas_factor, ex_event.gas_event.dynamic_gas_factor.daGas },
                { C::execution_l2_dynamic_gas, ex_event.gas_event.dynamic_gas.l2Gas },
                { C::execution_da_dynamic_gas, ex_event.gas_event.dynamic_gas.daGas },
                { C::execution_out_of_gas_l2_dynamic, ex_event.gas_event.oog_l2_dynamic },
                { C::execution_out_of_gas_da_dynamic, ex_event.gas_event.oog_da_dynamic },
                { C::execution_out_of_gas_dynamic,
                  ex_event.gas_event.oog_l2_dynamic || ex_event.gas_event.oog_da_dynamic },
                { C::execution_limit_used_l2_dynamic_cmp_diff, limit_used_l2_dynamic_cmp_diff },
                { C::execution_limit_used_l2_dynamic_cmp_diff_lo, limit_used_l2_dynamic_cmp_diff_lo },
                { C::execution_limit_used_l2_dynamic_cmp_diff_hi, limit_used_l2_dynamic_cmp_diff_hi },
                { C::execution_limit_used_da_dynamic_cmp_diff, limit_used_da_dynamic_cmp_diff },
                { C::execution_limit_used_da_dynamic_cmp_diff_lo, limit_used_da_dynamic_cmp_diff_lo },
                { C::execution_limit_used_da_dynamic_cmp_diff_hi, limit_used_da_dynamic_cmp_diff_hi },
            } });

        prev_l2_gas_used = ex_event.context_event.gas_used.l2Gas;
        prev_da_gas_used = ex_event.context_event.gas_used.daGas;

        row++;
    }

    if (!ex_events.empty()) {
        trace.set(C::execution_last, row - 1, 1);
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> ExecutionTraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        // Gas
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_addressing_gas_read_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_l2_base_range_lo_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_l2_base_range_hi_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_da_base_range_lo_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_da_base_range_hi_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_l2_dynamic_range_lo_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_l2_dynamic_range_hi_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_da_dynamic_range_lo_settings>>(),
        std::make_unique<LookupIntoIndexedByClk<lookup_gas_limit_used_da_dynamic_range_hi_settings>>());
}

} // namespace bb::avm2::tracegen
