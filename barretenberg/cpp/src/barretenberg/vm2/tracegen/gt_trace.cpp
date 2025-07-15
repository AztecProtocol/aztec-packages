#include "barretenberg/vm2/tracegen/gt_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_gt.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void GreaterThanTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::GreaterThanEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        FF a_ff = FF(event.a);
        FF b_ff = FF(event.b);
        FF abs_diff = event.result ? a_ff - b_ff - 1 : b_ff - a_ff;
        trace.set(row,
                  { {
                      { C::gt_sel, 1 },
                      { C::gt_input_a, event.a },
                      { C::gt_input_b, event.b },
                      { C::gt_res, event.result ? 1 : 0 },
                      { C::gt_abs_diff, abs_diff },
                      { C::gt_constant_128, 128 },
                  } });
        row++;
    };
}

const InteractionDefinition GreaterThanTraceBuilder::interactions =
    InteractionDefinition().add<lookup_gt_gt_range_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
