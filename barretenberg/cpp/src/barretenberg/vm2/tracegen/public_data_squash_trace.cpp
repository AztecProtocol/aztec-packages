#include "barretenberg/vm2/tracegen/public_data_squash_trace.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_public_data_squash.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void PublicDataSquashTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::PublicDataSquashEvent>::Container& events,
    TraceContainer& trace)
{

    using C = Column;

    // This is a shifted trace, so we start at 1
    uint32_t row = 1;

    for (size_t i = 0; i < events.size(); i++) {
        bool end = i == events.size() - 1;
        const auto& event = events[i];

        uint32_t clk = event.execution_id;

        bool leaf_slot_increase = false;
        bool check_clock = false;
        uint32_t clk_diff = 0;

        if (!end) {
            const auto& next_event = events[i + 1];

            if (event.leaf_slot == next_event.leaf_slot) {
                assert(event.execution_id < next_event.execution_id);
                clk_diff = next_event.execution_id - event.execution_id;
                check_clock = true;
            } else {
                assert(static_cast<uint256_t>(event.leaf_slot) < static_cast<uint256_t>(next_event.leaf_slot));
                leaf_slot_increase = true;
            }
        }

        bool should_write_to_public_inputs = leaf_slot_increase || end;

        trace.set(row,
                  { {
                      { C::public_data_squash_sel, 1 },
                      { C::public_data_squash_leaf_slot, event.leaf_slot },
                      { C::public_data_squash_clk, clk },
                      { C::public_data_squash_write_to_public_inputs, should_write_to_public_inputs },
                      { C::public_data_squash_leaf_slot_increase, leaf_slot_increase },
                      { C::public_data_squash_check_clock, check_clock },
                      { C::public_data_squash_clk_diff, clk_diff },
                      { C::public_data_squash_constant_32, 32 },
                  } });
        row++;
    }
}

const InteractionDefinition PublicDataSquashTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_public_data_squash_leaf_slot_increase_ff_gt_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_squash_clk_diff_range_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
