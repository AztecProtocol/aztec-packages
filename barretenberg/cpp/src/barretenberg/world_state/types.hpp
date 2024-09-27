#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <variant>

namespace bb::world_state {

enum MerkleTreeId {
    NULLIFIER_TREE = 0,
    NOTE_HASH_TREE = 1,
    PUBLIC_DATA_TREE = 2,
    L1_TO_L2_MESSAGE_TREE = 3,
    ARCHIVE = 4,
};

std::string getMerkleTreeName(MerkleTreeId id);

using TreeStateReference = std::pair<bb::fr, bb::crypto::merkle_tree::index_t>;
using StateReference = std::unordered_map<MerkleTreeId, TreeStateReference>;

struct WorldStateRevision {
    uint64_t forkId{ 0 };
    uint64_t blockNumber{ 0 };
    bool includeUncommitted{ false };

    MSGPACK_FIELDS(forkId, blockNumber, includeUncommitted)

    // using Revision = std::variant<WorldStateRevision::FinalisedBlock, WorldStateRevision::CurrentState,
    // WorldStateRevision::ForkId>; Revision inner;

    static WorldStateRevision committed() { return WorldStateRevision{ .includeUncommitted = false }; }
    static WorldStateRevision uncommitted() { return WorldStateRevision{ .includeUncommitted = true }; }
    // static WorldStateRevision finalised_block(uint32_t block_number) { return { WorldStateRevision{ .blockNumber =
    // block_number } }; }
};
} // namespace bb::world_state
