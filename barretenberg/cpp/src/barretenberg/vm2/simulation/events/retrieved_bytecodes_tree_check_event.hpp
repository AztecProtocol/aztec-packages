#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/retrieved_bytecodes_tree.hpp"

namespace bb::avm2::simulation {

struct RetrievedBytecodeAppendData {
    FF updated_low_leaf_hash;
    FF new_leaf_hash;
    FF intermediate_root;

    bool operator==(const RetrievedBytecodeAppendData& other) const = default;
};

struct RetrievedBytecodesTreeCheckEvent {
    FF class_id;
    AppendOnlyTreeSnapshot prev_snapshot;
    AppendOnlyTreeSnapshot next_snapshot;

    RetrievedBytecodesTreeLeafPreimage low_leaf_preimage;
    FF low_leaf_hash;
    uint64_t low_leaf_index;

    bool write;

    std::optional<RetrievedBytecodeAppendData> append_data;

    bool operator==(const RetrievedBytecodesTreeCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
