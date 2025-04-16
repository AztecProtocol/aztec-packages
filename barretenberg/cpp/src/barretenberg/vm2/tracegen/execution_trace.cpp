#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::tracegen {
namespace {

constexpr size_t operand_columns = 4;

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

    for (const auto& ex_event_ptr : ex_events) {
        const auto& ex_event = *ex_event_ptr;
        const auto& addr_event = ex_event.addressing_event;

        auto operands = ex_event.wire_instruction.operands;
        assert(operands.size() <= operand_columns);
        operands.resize(operand_columns, simulation::Operand::from<FF>(0));
        auto resolved_operands = ex_event.resolved_operands;
        assert(resolved_operands.size() <= operand_columns);
        resolved_operands.resize(operand_columns, simulation::Operand::from<FF>(0));

        trace.set(row,
                  { {
                      { C::execution_sel, 1 },   // active execution trace
                      { C::execution_clk, row }, // TODO: we may want this in the event
                      { C::execution_ex_opcode, static_cast<size_t>(ex_event.opcode) },
                      { C::execution_op1, static_cast<FF>(operands.at(0)) },
                      { C::execution_op2, static_cast<FF>(operands.at(1)) },
                      { C::execution_op3, static_cast<FF>(operands.at(2)) },
                      { C::execution_op4, static_cast<FF>(operands.at(3)) },
                      { C::execution_bytecode_id, ex_event.bytecode_id },
                      { C::execution_rop1, static_cast<FF>(resolved_operands.at(0)) },
                      { C::execution_rop2, static_cast<FF>(resolved_operands.at(1)) },
                      { C::execution_rop3, static_cast<FF>(resolved_operands.at(2)) },
                      { C::execution_rop4, static_cast<FF>(resolved_operands.at(3)) },
                  } });

        auto operands_after_relative = addr_event.after_relative;
        assert(operands_after_relative.size() <= operand_columns);
        operands_after_relative.resize(operand_columns, simulation::Operand::from<FF>(0));

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
                { C::execution_op1_after_relative, static_cast<FF>(operands_after_relative.at(0)) },
                { C::execution_op2_after_relative, static_cast<FF>(operands_after_relative.at(1)) },
                { C::execution_op3_after_relative, static_cast<FF>(operands_after_relative.at(2)) },
                { C::execution_op4_after_relative, static_cast<FF>(operands_after_relative.at(3)) },
            } });

        // Context
        trace.set(row,
                  { {
                      { C::execution_context_id, ex_event.context_event.id },
                      { C::execution_pc, ex_event.context_event.pc },
                      { C::execution_is_static, ex_event.context_event.is_static },
                      { C::execution_msg_sender, ex_event.context_event.msg_sender },
                      { C::execution_contract_address, ex_event.context_event.contract_addr },
                      { C::execution_parent_calldata_offset_addr, ex_event.context_event.parent_cd_addr },
                      { C::execution_parent_calldata_size_addr, ex_event.context_event.parent_cd_size_addr },
                      { C::execution_last_child_returndata_offset_addr, ex_event.context_event.last_child_rd_addr },
                      { C::execution_last_child_returndata_size_addr, ex_event.context_event.last_child_rd_size_addr },
                      { C::execution_last_child_success, ex_event.context_event.last_child_success },
                  } });

        row++;
    }

    if (!ex_events.empty()) {
        trace.set(C::execution_last, row - 1, 1);
    }
}

} // namespace bb::avm2::tracegen
