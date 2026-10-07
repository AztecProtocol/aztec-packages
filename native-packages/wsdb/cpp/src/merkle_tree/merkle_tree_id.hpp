#pragma once
#include "merkle_tree/types.hpp"
#include "wsdb/generated/wsdb_types.hpp"
#include <limits>
#include <string>

namespace azteclabs::wsdb::merkle_tree {

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
 * The lightweight handle exchanged across the merkle-DB IPC boundary; the generated wire
 * record is the domain type.
 */
using WorldStateRevision = wire::WorldStateRevision;

// Sentinel value for `WorldStateRevision::blockNumber` indicating "not pinned to any historical
// block; use the latest committed state of the underlying tree". This is distinct from
// `blockNumber == 0`, which means "pin to block 0 (the initial / genesis state)". We use the
// maximum uint32_t rather than 0 because 0 is a valid historical block number (the genesis
// header), and overloading 0 caused silent regressions where genesis-anchored witnesses would
// return the current tip instead of genesis.
inline constexpr block_number_t LATEST_BLOCK = std::numeric_limits<block_number_t>::max();

inline WorldStateRevision committed_revision()
{
    return { .forkId = 0, .blockNumber = LATEST_BLOCK, .includeUncommitted = false };
}
inline WorldStateRevision uncommitted_revision()
{
    return { .forkId = 0, .blockNumber = LATEST_BLOCK, .includeUncommitted = true };
}
// True when the revision is pinned to a specific historical block rather than the latest state.
inline bool is_historical(const WorldStateRevision& revision)
{
    return revision.blockNumber != LATEST_BLOCK;
}

} // namespace azteclabs::wsdb::merkle_tree
