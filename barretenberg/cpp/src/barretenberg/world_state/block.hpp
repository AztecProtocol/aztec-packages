#pragma once

#include "barretenberg/world_state/state_reference.hpp"

namespace bb::world_state {

struct BlockData {
    WorldStateReference state;
    bb::fr hash;
    std::vector<bb::fr> notes;
    std::vector<bb::fr> messages;
    std::vector<crypto::merkle_tree::NullifierLeafValue> nullifiers;
    std::vector<crypto::merkle_tree::PublicDataLeafValue> publicData;

    MSGPACK_FIELDS(ref, hash, notes, messages, nullifiers, publicData);
}

} // namespace bb::world_state
