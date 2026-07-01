#pragma once

#include <cstdint>
#include <limits>
#include <string>

#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <msgpack/adaptor/define_decl.hpp>

namespace bb::crypto::merkle_tree {

enum MerkleTreeId {
    NULLIFIER_TREE = 0,
    NOTE_HASH_TREE = 1,
    PUBLIC_DATA_TREE = 2,
    L1_TO_L2_MESSAGE_TREE = 3,
    ARCHIVE = 4,
};

std::string getMerkleTreeName(MerkleTreeId id);

/**
 * @brief Identifies a (possibly forked, possibly historical) view of the merkle trees.
 *
 * This is the lightweight handle exchanged across the merkle-DB IPC boundary; it carries no
 * persistent-store dependency, which is why it lives in crypto/merkle_tree rather than world_state.
 */
struct WorldStateRevision {
    // Sentinel value for `blockNumber` indicating "not pinned to any historical block;
    // use the latest committed state of the underlying tree". This is distinct from
    // `blockNumber == 0`, which means "pin to block 0 (the initial / genesis state)".
    // We use the maximum uint32_t rather than 0 because 0 is a valid historical block
    // number (the genesis header), and overloading 0 caused silent regressions where
    // genesis-anchored witnesses would return the current tip instead of genesis.
    static constexpr block_number_t LATEST = std::numeric_limits<block_number_t>::max();

    index_t forkId{ 0 };
    block_number_t blockNumber{ LATEST };
    bool includeUncommitted{ false };

    SERIALIZATION_FIELDS(forkId, blockNumber, includeUncommitted)

    static WorldStateRevision committed() { return WorldStateRevision{ .includeUncommitted = false }; }
    static WorldStateRevision uncommitted() { return WorldStateRevision{ .includeUncommitted = true }; }

    // True when the revision is pinned to a specific historical block rather than the latest state.
    bool is_historical() const { return blockNumber != LATEST; }

    bool operator==(const WorldStateRevision& other) const = default;
};

} // namespace bb::crypto::merkle_tree

MSGPACK_ADD_ENUM(bb::crypto::merkle_tree::MerkleTreeId)
