#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"

namespace bb::avm2::simulation {

struct SlotAppendData {
    FF updated_low_leaf_hash;
    FF new_leaf_hash;
    FF intermediate_root;

    bool operator==(const SlotAppendData& other) const = default;
};

struct WrittenPublicDataSlotsTreeCheckEvent {
    AztecAddress contract_address;
    FF slot;
    FF leaf_slot;
    AppendOnlyTreeSnapshot prev_snapshot;
    AppendOnlyTreeSnapshot next_snapshot;

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf_preimage;
    FF low_leaf_hash;
    uint64_t low_leaf_index;

    bool write;

    std::optional<SlotAppendData> append_data;

    bool operator==(const WrittenPublicDataSlotsTreeCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
