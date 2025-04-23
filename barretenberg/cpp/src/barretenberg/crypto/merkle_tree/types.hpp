// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <optional>
namespace bb::crypto::merkle_tree {

using namespace bb::lmdblib;

using index_t = uint64_t;
using block_number_t = uint64_t;
using LeafIndexKeyType = uint64_t;
using BlockMetaKeyType = uint64_t;
using FrKeyType = uint256_t;
using MetaKeyType = uint8_t;

struct RequestContext {
    bool includeUncommitted;
    std::optional<block_number_t> blockNumber;
    bb::fr root;
    std::optional<index_t> maxIndex;
};

template <typename LeafType> fr preimage_to_key(const LeafType& leaf)
{
    return leaf.get_key();
}

inline fr preimage_to_key(const fr& leaf)
{
    return leaf;
}

template <typename LeafType> bool is_empty(const LeafType& leaf)
{
    return leaf.is_empty();
}

inline bool is_empty(const fr& leaf)
{
    return leaf == fr::zero();
}

template <typename LeafType> constexpr bool requires_preimage_for_key()
{
    return true;
}

template <> constexpr bool requires_preimage_for_key<fr>()
{
    return false;
}

const std::string BLOCKS_DB = "blocks";
const std::string NODES_DB = "nodes";
const std::string LEAF_PREIMAGES_DB = "leaf preimages";
const std::string LEAF_INDICES_DB = "leaf indices";
const std::string BLOCK_INDICES_DB = "block indices";

struct TreeDBStats {
    uint64_t mapSize;
    uint64_t physicalFileSize;
    DBStats blocksDBStats;
    DBStats nodesDBStats;
    DBStats leafPreimagesDBStats;
    DBStats leafIndicesDBStats;
    DBStats blockIndicesDBStats;

    TreeDBStats() = default;
    TreeDBStats(uint64_t mapSize, uint64_t physicalFileSize)
        : mapSize(mapSize)
        , physicalFileSize(physicalFileSize)
    {}
    TreeDBStats(uint64_t mapSize,
                uint64_t physicalFileSize,
                const DBStats& blockStats,
                const DBStats& nodesStats,
                const DBStats& leafPreimagesDBStats,
                const DBStats& leafIndicesStats,
                const DBStats& blockIndicesStats)
        : mapSize(mapSize)
        , physicalFileSize(physicalFileSize)
        , blocksDBStats(blockStats)
        , nodesDBStats(nodesStats)
        , leafPreimagesDBStats(leafPreimagesDBStats)
        , leafIndicesDBStats(leafIndicesStats)
        , blockIndicesDBStats(blockIndicesStats)
    {}
    TreeDBStats(const TreeDBStats& other) = default;
    TreeDBStats(TreeDBStats&& other) noexcept { *this = std::move(other); }

    ~TreeDBStats() = default;

    MSGPACK_FIELDS(mapSize,
                   physicalFileSize,
                   blocksDBStats,
                   nodesDBStats,
                   leafPreimagesDBStats,
                   leafIndicesDBStats,
                   blockIndicesDBStats)

    bool operator==(const TreeDBStats& other) const
    {
        return mapSize == other.mapSize && physicalFileSize == other.physicalFileSize &&
               blocksDBStats == other.blocksDBStats && nodesDBStats == other.nodesDBStats &&
               leafPreimagesDBStats == other.leafPreimagesDBStats && leafIndicesDBStats == other.leafIndicesDBStats &&
               blockIndicesDBStats == other.blockIndicesDBStats;
    }

    TreeDBStats& operator=(TreeDBStats&& other) noexcept
    {
        if (this != &other) {
            mapSize = other.mapSize;
            physicalFileSize = other.physicalFileSize;
            blocksDBStats = std::move(other.blocksDBStats);
            nodesDBStats = std::move(other.nodesDBStats);
            leafPreimagesDBStats = std::move(other.leafPreimagesDBStats);
            leafIndicesDBStats = std::move(other.leafIndicesDBStats);
            blockIndicesDBStats = std::move(other.blockIndicesDBStats);
        }
        return *this;
    }

    TreeDBStats& operator=(const TreeDBStats& other) = default;

    friend std::ostream& operator<<(std::ostream& os, const TreeDBStats& stats)
    {
        os << "Map Size: " << stats.mapSize << ", Physical File Size: " << stats.physicalFileSize << " Blocks DB "
           << stats.blocksDBStats << ", Nodes DB " << stats.nodesDBStats << ", Leaf Pre-images DB "
           << stats.leafPreimagesDBStats << ", Leaf Indices DB " << stats.leafIndicesDBStats << ", Block Indices DB "
           << stats.blockIndicesDBStats;
        return os;
    }
};

std::ostream& operator<<(std::ostream& os, const TreeDBStats& stats);
} // namespace bb::crypto::merkle_tree
