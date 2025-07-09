#include "barretenberg/vm2/tracegen/gt_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void GreaterThanTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::GreaterThanEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 1;
    for (const auto& event : events) {
        trace.set(row,
                  { {
                      { C::gt_sel, 1 },
                      { C::gt_input_a, event.a },
                      { C::gt_input_b, event.b },
                      { C::gt_res, event.result ? 1 : 0 },
                  } });
    };
}

} // namespace bb::avm2::tracegen
