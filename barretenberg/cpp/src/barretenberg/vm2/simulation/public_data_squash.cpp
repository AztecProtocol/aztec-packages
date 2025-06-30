#include "barretenberg/vm2/simulation/public_data_squash.hpp"

#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::simulation {

void PublicDataSquasher::on_simulation_started()
{
    // We start with a global vector of writes in the stack.
    writes_stack.push({});
}

void PublicDataSquasher::on_checkpoint_created()
{
    // We start a new vector of writes in the stack.
    writes_stack.push({});
}

void PublicDataSquasher::record_write(const FF& leaf_slot, bool is_protocol_write)
{
    uint32_t execution_id =
        is_protocol_write ? std::numeric_limits<uint32_t>::max() : execution_id_manager.get_execution_id();
    assert(!writes_stack.empty());
    writes_stack.top().push_back({ leaf_slot, execution_id });
}

void PublicDataSquasher::on_checkpoint_committed()
{
    merge_top_into_parent();
}

void PublicDataSquasher::on_checkpoint_reverted()
{
    writes_stack.pop();
}

void PublicDataSquasher::on_simulation_ended()
{
    // This can be changed to an assert of size 1 when we have checkpointing properly implemented.
    while (writes_stack.size() > 1) {
        merge_top_into_parent();
    }
    std::vector<RecordedWrite> finished_writes = writes_stack.top();
    // Sort increasing slot, within the same slot, sort by increasing execution_id.
    std::sort(finished_writes.begin(), finished_writes.end(), [](const RecordedWrite& a, const RecordedWrite& b) {
        if (a.leaf_slot == b.leaf_slot) {
            return a.execution_id < b.execution_id;
        }
        return static_cast<uint256_t>(a.leaf_slot) < static_cast<uint256_t>(b.leaf_slot);
    });
    // Perform the sorting range checks. This is a circuit behavior that reaches simulation.
    for (size_t i = 0; i < finished_writes.size(); i++) {
        bool is_last_write = i == finished_writes.size() - 1;
        const auto& current_write = finished_writes[i];
        if (!is_last_write) {
            const auto& next_write = finished_writes[i + 1];
            if (current_write.leaf_slot == next_write.leaf_slot) {
                range_check.assert_range(next_write.execution_id - current_write.execution_id, 32);
            } else {
                field_gt.ff_gt(next_write.leaf_slot, current_write.leaf_slot);
            }
        }
        events.emit(
            PublicDataSquashEvent{ .leaf_slot = current_write.leaf_slot, .execution_id = current_write.execution_id });
    }
}

void PublicDataSquasher::merge_top_into_parent()
{
    assert(writes_stack.size() > 1);
    std::vector<RecordedWrite> top = writes_stack.top();
    writes_stack.pop();
    for (auto recorded_write : top) {
        writes_stack.top().push_back(recorded_write);
    }
}

} // namespace bb::avm2::simulation
