#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <variant>

namespace bb::world_state {

using namespace bb::crypto::merkle_tree;

enum MerkleTreeId {
    NULLIFIER_TREE = 0,
    NOTE_HASH_TREE = 1,
    PUBLIC_DATA_TREE = 2,
    L1_TO_L2_MESSAGE_TREE = 3,
    ARCHIVE = 4,
};

const uint64_t CANONICAL_FORK_ID = 0;

std::string getMerkleTreeName(MerkleTreeId id);

using TreeStateReference = std::pair<bb::fr, bb::crypto::merkle_tree::index_t>;
using StateReference = std::unordered_map<MerkleTreeId, TreeStateReference>;

struct WorldStateRevision {
    index_t forkId{ 0 };
    index_t blockNumber{ 0 };
    bool includeUncommitted{ false };

    MSGPACK_FIELDS(forkId, blockNumber, includeUncommitted)

    static WorldStateRevision committed() { return WorldStateRevision{ .includeUncommitted = false }; }
    static WorldStateRevision uncommitted() { return WorldStateRevision{ .includeUncommitted = true }; }
};

struct WorldStateStatus {
    index_t unfinalisedBlockNumber;
    index_t finalisedBlockNumber;
    index_t oldestHistoricalBlock;
    MSGPACK_FIELDS(unfinalisedBlockNumber, finalisedBlockNumber, oldestHistoricalBlock);

    bool operator==(const WorldStateStatus& other) const
    {
        return unfinalisedBlockNumber == other.unfinalisedBlockNumber &&
               finalisedBlockNumber == other.finalisedBlockNumber &&
               oldestHistoricalBlock == other.oldestHistoricalBlock;
    }

    friend std::ostream& operator<<(std::ostream& os, const WorldStateStatus& status)
    {
        os << "unfinalisedBlockNumber: " << status.unfinalisedBlockNumber
           << ", finalisedBlockNumber: " << status.finalisedBlockNumber
           << ", oldestHistoricalBlock: " << status.oldestHistoricalBlock;
        return os;
    }
};
} // namespace bb::world_state
