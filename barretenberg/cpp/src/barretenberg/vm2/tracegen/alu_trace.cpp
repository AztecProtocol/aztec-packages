#include "barretenberg/vm2/tracegen/alu_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>

#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::tracegen {

namespace {

Column get_operation_selector(simulation::AluOperation operation)
{
    switch (operation) {
    case simulation::AluOperation::ADD:
        return Column::alu_sel_op_add;
    default:
        throw std::runtime_error("Unknown ALU operation");
        break;
    }
}

} // namespace

void AluTraceBuilder::process(const simulation::EventEmitterInterface<simulation::AluEvent>::Container& events,
                              TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        C opcode_selector = get_operation_selector(event.operation);

        trace.set(row,
                  { {
                      { opcode_selector, 1 },
                      { C::alu_op, static_cast<uint8_t>(event.operation) },
                      { C::alu_ia, event.a },
                      { C::alu_ib, event.b },
                      { C::alu_ic, event.res },
                      { C::alu_ia_addr, event.a_addr },
                      { C::alu_ib_addr, event.b_addr },
                      { C::alu_dst_addr, event.dst_addr },
                  } });

        row++;
    }
}

} // namespace bb::avm2::tracegen