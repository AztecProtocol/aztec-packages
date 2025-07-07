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

// TODO(MW): Rename to something useful! Helper fn to get operation specific values.
std::vector<std::pair<Column, FF>> get_operation_columns(const simulation::AluEvent& event)
{
    switch (event.operation) {
    case simulation::AluOperation::ADD:
        return { { Column::alu_sel_op_add, 1 },
                 { Column::alu_op_id,
                   static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD).subtrace_operation_id) },
                 // I think the only situation in which a + b != c as fields is when c overflows the bit size
                 // if this in unclear, I can use > or actually check bit sizes:
                 { Column::alu_cf, event.a.as_ff() + event.b.as_ff() != event.c.as_ff() } };
    case simulation::AluOperation::LT: {
        bool is_ff = event.a.get_tag() == ValueTag::FF;
        FF abs_diff = static_cast<uint8_t>(event.c.as_ff()) == 1 ? event.b.as_ff() - event.a.as_ff() - 1
                                                                 : event.a.as_ff() - event.b.as_ff();
        return {
            { Column::alu_sel_op_lt, 1 },
            { Column::alu_op_id,
              static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::LT).subtrace_operation_id) },
            { Column::alu_sel_is_ff, is_ff },
            { Column::alu_sel_ff_lt, is_ff },
            { Column::alu_tag_ff_diff_inv,
              is_ff
                  ? 0
                  : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() },
            { Column::alu_lt_abs_diff, is_ff ? 0 : abs_diff },
        };
    }

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
        // Tag checking:
        FF a_tag = static_cast<uint8_t>(event.a.get_tag());
        FF b_tag = static_cast<uint8_t>(event.b.get_tag());
        FF c_tag = static_cast<uint8_t>(event.c.get_tag());
        bool tag_check_failed = event.error.has_value() && event.error == AluError::TAG_ERROR;
        FF alu_ab_tags_diff_inv = 0;
        if (tag_check_failed) {
            // We shouldn't have emitted an event with a tag error when one doesn't exist, currently (ADD, LT) the
            // definition of a tag error is when there is a disallowed diff between tags:
            assert((a_tag - b_tag) != 0 && "ALU Event emitted with tag error, but none exists");
            alu_ab_tags_diff_inv = static_cast<FF>(a_tag - b_tag).invert();
        }

        // Operation specific columns:
        trace.set(row, get_operation_columns(event));

        trace.set(row,
                  { {
                      { C::alu_sel, 1 },
                      { C::alu_ia, event.a },
                      { C::alu_ib, event.b },
                      { C::alu_ic, event.c },
                      { C::alu_ia_tag, a_tag },
                      { C::alu_ib_tag, b_tag },
                      { C::alu_ic_tag, c_tag },
                      { C::alu_max_bits, get_tag_bits(event.a.get_tag()) },
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
        .add<lookup_alu_tag_max_bits_value_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_alu_ff_lt_settings, InteractionType::LookupGeneric>()
        .add<lookup_alu_lt_range_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
