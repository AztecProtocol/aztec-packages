#pragma once

#include <cstdint>
#include <optional>
#include <variant>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"

namespace bb::avm2::simulation {

struct PublicDataWriteData {
    PublicDataTreeLeafPreimage updated_low_leaf_preimage;
    FF updated_low_leaf_hash = 0;
    FF new_leaf_hash = 0;
    FF intermediate_root = 0;
    AppendOnlyTreeSnapshot next_snapshot;

    bool operator==(const PublicDataWriteData& other) const = default;
};

struct PublicDataTreeReadWriteEvent {
    AztecAddress contract_address = 0;
    FF slot = 0;
    FF value = 0;
    FF leaf_slot = 0;
    AppendOnlyTreeSnapshot prev_snapshot;

    PublicDataTreeLeafPreimage low_leaf_preimage;
    FF low_leaf_hash = 0;
    uint64_t low_leaf_index = 0;

    std::optional<PublicDataWriteData> write_data = std::nullopt;

    uint32_t execution_id = 0;

    bool operator==(const PublicDataTreeReadWriteEvent& other) const = default;
};

using PublicDataTreeCheckEvent = std::variant<PublicDataTreeReadWriteEvent, CheckPointEventType>;

} // namespace bb::avm2::simulation
