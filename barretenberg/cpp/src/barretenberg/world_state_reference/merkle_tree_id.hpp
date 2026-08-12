#pragma once

#include <cstdint>
#include <limits>
#include <string>

#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <msgpack/adaptor/define_decl.hpp>

namespace bb::world_state {

// Shared low-level merkle-tree scalar aliases.
using crypto::merkle_tree::block_number_t;
using crypto::merkle_tree::index_t;

// The set of Aztec world-state trees. Store-agnostic world-state vocabulary shared by every backend
// (the in-memory reference here, the lmdb-backed service, and the merkle-DB IPC client).
enum MerkleTreeId {
    NULLIFIER_TREE = 0,
    NOTE_HASH_TREE = 1,
    PUBLIC_DATA_TREE = 2,
    L1_TO_L2_MESSAGE_TREE = 3,
    ARCHIVE = 4,
};

std::string getMerkleTreeName(MerkleTreeId id);

/**
 * @brief Identifies a (possibly forked, possibly historical) view of the world-state trees.
 *
 * A lightweight, store-agnostic handle: it carries no persistent-store dependency, so it is exchanged
 * across the merkle-DB IPC boundary and shared by every world-state backend.
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

} // namespace bb::world_state

MSGPACK_ADD_ENUM(bb::world_state::MerkleTreeId)
