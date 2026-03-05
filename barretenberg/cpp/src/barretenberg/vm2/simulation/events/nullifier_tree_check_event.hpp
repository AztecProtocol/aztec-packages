#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"

#include <cstdint>
#include <optional>
#include <variant>

namespace bb::avm2::simulation {

struct NullifierSiloingData {
    FF siloed_nullifier;
    AztecAddress address;

    bool operator==(const NullifierSiloingData& other) const = default;
};

struct NullifierAppendData {
    FF updated_low_leaf_hash;
    FF new_leaf_hash;
    FF intermediate_root;

    bool operator==(const NullifierAppendData& other) const = default;
};

struct NullifierTreeReadWriteEvent {
    FF nullifier;
    AppendOnlyTreeSnapshot prev_snapshot;
    AppendOnlyTreeSnapshot next_snapshot;

    NullifierTreeLeafPreimage low_leaf_preimage;
    FF low_leaf_hash;
    uint64_t low_leaf_index;

    bool write = false;
    std::optional<NullifierSiloingData> siloing_data = std::nullopt;
    uint64_t nullifier_counter = 0;

    std::optional<NullifierAppendData> append_data = std::nullopt;

    bool operator==(const NullifierTreeReadWriteEvent& other) const = default;
};

using NullifierTreeCheckEvent = std::variant<NullifierTreeReadWriteEvent, CheckPointEventType>;

} // namespace bb::avm2::simulation
