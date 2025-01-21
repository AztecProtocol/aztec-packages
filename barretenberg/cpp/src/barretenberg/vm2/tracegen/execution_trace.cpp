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

void ExecutionTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events,
    const simulation::EventEmitterInterface<simulation::AddressingEvent>::Container& addr_events,
    TraceContainer& trace)
{
    using C = Column;
    if (ex_events.size() != addr_events.size()) {
        throw std::runtime_error(format(
            "Execution and addressing events must have the same size: ", ex_events.size(), " != ", addr_events.size()));
    }
    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.

    // We process the execution events and other virtual gadgets in parallel.
    // Note that there is duplicated information in the events, for self-containment.
    // TODO: Think the best approach for that.
    for (const auto& [ex_event, addr_event] : zip_view(ex_events, addr_events)) {
        auto operands = ex_event.wire_instruction.operands;
        assert(operands.size() <= operand_columns);
        operands.resize(operand_columns, simulation::Operand::ff(0));
        auto resolved_operands = ex_event.resolved_operands;
        assert(resolved_operands.size() <= operand_columns);
        resolved_operands.resize(operand_columns, simulation::Operand::ff(0));

        trace.set(row,
                  { {
                      { C::execution_sel, 1 },   // active execution trace
                      { C::execution_clk, row }, // TODO: we may want this in the event
                      { C::execution_ex_opcode, static_cast<size_t>(ex_event.opcode) },
                      { C::execution_op1, static_cast<FF>(operands.at(0)) },
                      { C::execution_op2, static_cast<FF>(operands.at(1)) },
                      { C::execution_op3, static_cast<FF>(operands.at(2)) },
                      { C::execution_op4, static_cast<FF>(operands.at(3)) },
                      { C::execution_pc, ex_event.pc },
                      { C::execution_bytecode_id, ex_event.bytecode_id },
                      { C::execution_rop1, static_cast<FF>(resolved_operands.at(0)) },
                      { C::execution_rop2, static_cast<FF>(resolved_operands.at(1)) },
                      { C::execution_rop3, static_cast<FF>(resolved_operands.at(2)) },
                      { C::execution_rop4, static_cast<FF>(resolved_operands.at(3)) },
                  } });

        auto operands_after_relative = addr_event.after_relative;
        assert(operands_after_relative.size() <= operand_columns);
        operands_after_relative.resize(operand_columns, simulation::Operand::ff(0));

        trace.set(
            row,
            { {
                { C::execution_base_address_val, addr_event.base_address_val },
                { C::execution_base_address_tag, static_cast<size_t>(addr_event.base_address_tag) },
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

        row++;
    }

    if (!ex_events.empty()) {
        trace.set(C::execution_last, row - 1, 1);
    }
}

} // namespace bb::avm2::tracegen