#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"

#include <cstdint>
#include <optional>
#include <variant>

namespace bb::avm2::simulation {

struct IndexedTreeLeafData {
    FF value;
    FF next_value;
    uint64_t next_index;

    bool operator==(const IndexedTreeLeafData& other) const = default;

    std::vector<FF> get_hash_inputs() const { return { value, next_value, next_index }; }
};

struct IndexedTreeSiloingParameters {
    AztecAddress address;
    FF siloing_separator;

    bool operator==(const IndexedTreeSiloingParameters& other) const = default;
};

struct IndexedLeafSiloingData {
    FF siloed_value;
    IndexedTreeSiloingParameters parameters;

    bool operator==(const IndexedLeafSiloingData& other) const = default;
};

struct IndexedLeafAppendData {
    FF updated_low_leaf_hash;
    FF new_leaf_hash;
    FF intermediate_root;

    bool operator==(const IndexedLeafAppendData& other) const = default;
};

struct IndexedTreeReadWriteEvent {
    FF value;
    AppendOnlyTreeSnapshot prev_snapshot;
    AppendOnlyTreeSnapshot next_snapshot;
    uint64_t tree_height;

    IndexedTreeLeafData low_leaf_data;
    FF low_leaf_hash;
    uint64_t low_leaf_index;

    bool write = false;
    std::optional<IndexedLeafSiloingData> siloing_data = std::nullopt;
    std::optional<uint64_t> public_inputs_index = std::nullopt;

    std::optional<IndexedLeafAppendData> append_data = std::nullopt;

    bool operator==(const IndexedTreeReadWriteEvent& other) const = default;
};

using IndexedTreeCheckEvent = std::variant<IndexedTreeReadWriteEvent, CheckPointEventType>;

} // namespace bb::avm2::simulation
