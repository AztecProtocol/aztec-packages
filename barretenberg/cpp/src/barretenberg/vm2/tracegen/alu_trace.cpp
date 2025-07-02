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

// TODO(MW): could probably combine this and get_operation_selector?
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

// TODO(MW) - will reuse this for other ops (hopefully can use the same column to deal w/ e.g. underflowed sub and
// overflowed add)
bool get_carry_flag(const simulation::AluEvent& event)
{
    switch (event.operation) {
    case simulation::AluOperation::ADD:
        // I think the only situation in which a + b != c as fields is when c overflows the bit size
        // if this is unclear, I can use > or actually check bit sizes
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
    using simulation::AluError;

    uint32_t row = 0;
    for (const auto& event : events) {
        // Operation:
        C opcode_selector = get_operation_selector(event.operation);

        // Tag checking:
        FF a_tag = static_cast<uint8_t>(event.a.get_tag());
        FF b_tag = static_cast<uint8_t>(event.b.get_tag());
        FF c_tag = static_cast<uint8_t>(event.c.get_tag());
        bool tag_check_failed = event.error.has_value() && event.error == AluError::TAG_ERROR;
        FF alu_ab_tags_diff_inv = 0;
        if (tag_check_failed) {
            // We shouldn't have emitted an event with a tag error when one doesn't exist, currently (ADD) the
            // definition of a tag error is when there is a disallowed diff between tags:
            assert((a_tag - b_tag) != 0 && "ALU Event emitted with tag error, but none exists");
            alu_ab_tags_diff_inv = static_cast<FF>(a_tag - b_tag).invert();
        }

        trace.set(row,
                  { {
                      { opcode_selector, 1 },
                      { C::alu_sel, 1 },
                      { C::alu_op_id, get_operation_id(event.operation) },
                      { C::alu_ia, event.a },
                      { C::alu_ib, event.b },
                      { C::alu_ic, event.c },
                      { C::alu_ia_tag, a_tag },
                      { C::alu_ib_tag, b_tag },
                      { C::alu_ic_tag, c_tag },
                      { C::alu_cf, get_carry_flag(event) },
                      // TODO(MW): Not required for add, reinstate when needed:
                      // { C::alu_max_bits, get_tag_bits(event.a.get_tag()) },
                      { C::alu_max_value, get_tag_max_value(event.a.get_tag()) },
                      { C::alu_sel_tag_err, tag_check_failed ? 1 : 0 },
                      { C::alu_ab_tags_diff_inv, alu_ab_tags_diff_inv },
                  } });

        row++;
    }
}

const InteractionDefinition AluTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_alu_register_tag_value_settings, InteractionType::LookupGeneric>()
        .add<lookup_alu_tag_max_value_settings, InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
