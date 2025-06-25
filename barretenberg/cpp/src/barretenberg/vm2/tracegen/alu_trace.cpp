#include "barretenberg/vm2/tracegen/alu_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>

#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/relations/lookups_alu.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

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

// MW Note: could prob combine this and get_operation_selector, might be bad cpp (sorry)
uint8_t get_operation_id(simulation::AluOperation operation)
{
    switch (operation) {
    case simulation::AluOperation::ADD:
        return static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD).subtrace_operation_id);
    default:
        throw std::runtime_error("Unknown ALU operation");
        break;
    }
}

// MW Note - will reuse this for other ops (hopefully can use the same column to deal w/ e.g. underflowed sub and
// overflowed add)
bool get_carry_flag(const simulation::AluEvent& event)
{
    switch (event.operation) {
    case simulation::AluOperation::ADD:
        // I think the only situation in which a + b != c as fields is when c overflows the bit size
        // if this in unclear, I can use > or actually check bit sizes
        return event.a.as_ff() + event.b.as_ff() != event.c.as_ff();
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
                      { C::alu_sel, 1 },
                      { C::alu_op_id, get_operation_id(event.operation) },
                      { C::alu_ia, event.a },
                      { C::alu_ib, event.b },
                      { C::alu_ic, event.c },
                      { C::alu_ia_tag, static_cast<uint8_t>(event.a.get_tag()) },
                      { C::alu_ib_tag, static_cast<uint8_t>(event.b.get_tag()) },
                      { C::alu_ic_tag, static_cast<uint8_t>(event.c.get_tag()) },
                      { C::alu_cf, get_carry_flag(event) },
                      // TODO(MW): Not required for add, reinstate when needed:
                      // { C::alu_max_bits, get_tag_bits(event.a.get_tag()) },
                      { C::alu_max_value, get_tag_max_value(event.a.get_tag()) },
                      { C::alu_tag_err, 0 },               // TODO(MW): Where to get this from?
                      { C::alu_batched_tags_diff_inv, 0 }, // TODO(MW): Edit this when we propagate the tag_err
                  } });

        row++;
    }
}

const InteractionDefinition AluTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_alu_register_tag_value_settings, InteractionType::LookupGeneric>()
        .add<lookup_alu_tag_max_value_settings, InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
