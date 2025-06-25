#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

struct NoteHashSiloingData {
    FF siloed_note_hash;
    AztecAddress address;

    bool operator==(const NoteHashSiloingData& other) const = default;
};

struct NoteHashUniquenessData {
    FF nonce;
    FF unique_note_hash;
    FF first_nullifier;

    bool operator==(const NoteHashUniquenessData& other) const = default;
};

struct NoteHashAppendData {
    std::optional<NoteHashSiloingData> siloing_data;
    std::optional<NoteHashUniquenessData> uniqueness_data;
    uint64_t note_hash_counter;
    AppendOnlyTreeSnapshot next_snapshot;

    bool operator==(const NoteHashAppendData& other) const = default;
};

struct NoteHashTreeReadWriteEvent {
    FF note_hash;
    uint64_t leaf_index;
    AppendOnlyTreeSnapshot prev_snapshot;

    std::optional<NoteHashAppendData> append_data;

    bool operator==(const NoteHashTreeReadWriteEvent& other) const = default;
};

using NoteHashTreeCheckEvent = std::variant<NoteHashTreeReadWriteEvent, CheckPointEventType>;

} // namespace bb::avm2::simulation
