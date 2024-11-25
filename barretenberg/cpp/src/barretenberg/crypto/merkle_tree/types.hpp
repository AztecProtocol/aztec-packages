#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "lmdb.h"
#include <cstdint>
#include <optional>
namespace bb::crypto::merkle_tree {
using index_t = uint64_t;

struct RequestContext {
    bool includeUncommitted;
    std::optional<index_t> blockNumber;
    bb::fr root;
};

const std::string BLOCKS_DB = "blocks";
const std::string NODES_DB = "nodes";
const std::string LEAF_PREIMAGES_DB = "leaf preimages";
const std::string LEAF_INDICES_DB = "leaf indices";

struct DBStats {
    std::string name;
    uint64_t numDataItems;
    uint64_t totalUsedSize;

    DBStats() = default;
    DBStats(const DBStats& other) = default;
    DBStats(DBStats&& other) noexcept { *this = std::move(other); }
    ~DBStats() = default;
    DBStats(std::string name, MDB_stat& stat)
        : name(std::move(name))
        , numDataItems(stat.ms_entries)
        , totalUsedSize(stat.ms_psize * (stat.ms_branch_pages + stat.ms_leaf_pages + stat.ms_overflow_pages))
    {}
    DBStats(const std::string& name, uint64_t numDataItems, uint64_t totalUsedSize)
        : name(name)
        , numDataItems(numDataItems)
        , totalUsedSize(totalUsedSize)
    {}

    MSGPACK_FIELDS(name, numDataItems, totalUsedSize)

    bool operator==(const DBStats& other) const
    {
        return name == other.name && numDataItems == other.numDataItems && totalUsedSize == other.totalUsedSize;
    }

    DBStats& operator=(const DBStats& other) = default;

    DBStats& operator=(DBStats&& other) noexcept
    {
        if (this != &other) {
            name = std::move(other.name);
            numDataItems = other.numDataItems;
            totalUsedSize = other.totalUsedSize;
        }
        return *this;
    }

    friend std::ostream& operator<<(std::ostream& os, const DBStats& stats)
    {
        os << "DB " << stats.name << ", num items: " << stats.numDataItems
           << ", total used size: " << stats.totalUsedSize;
        return os;
    }
};

struct TreeDBStats {
    uint64_t mapSize;
    DBStats blocksDBStats;
    DBStats nodesDBStats;
    DBStats leafPreimagesDBStats;
    DBStats leafIndicesDBStats;

    TreeDBStats() = default;
    TreeDBStats(uint64_t mapSize)
        : mapSize(mapSize)
    {}
    TreeDBStats(uint64_t mapSize,
                const DBStats& blockStats,
                const DBStats& nodesStats,
                const DBStats& leafPreimagesDBStats,
                const DBStats& leafIndicesStats)
        : mapSize(mapSize)
        , blocksDBStats(blockStats)
        , nodesDBStats(nodesStats)
        , leafPreimagesDBStats(leafPreimagesDBStats)
        , leafIndicesDBStats(leafIndicesStats)
    {}
    TreeDBStats(const TreeDBStats& other) = default;
    TreeDBStats(TreeDBStats&& other) noexcept { *this = std::move(other); }

    ~TreeDBStats() = default;

    MSGPACK_FIELDS(mapSize, blocksDBStats, nodesDBStats, leafPreimagesDBStats, leafIndicesDBStats)

    bool operator==(const TreeDBStats& other) const
    {
        return mapSize == other.mapSize && blocksDBStats == other.blocksDBStats && nodesDBStats == other.nodesDBStats &&
               leafPreimagesDBStats == other.leafPreimagesDBStats && leafIndicesDBStats == other.leafIndicesDBStats;
    }

    TreeDBStats& operator=(TreeDBStats&& other) noexcept
    {
        if (this != &other) {
            mapSize = other.mapSize;
            blocksDBStats = std::move(other.blocksDBStats);
            nodesDBStats = std::move(other.nodesDBStats);
            leafPreimagesDBStats = std::move(other.leafPreimagesDBStats);
            leafIndicesDBStats = std::move(other.leafIndicesDBStats);
        }
        return *this;
    }

    TreeDBStats& operator=(const TreeDBStats& other) = default;

    friend std::ostream& operator<<(std::ostream& os, const TreeDBStats& stats)
    {
        os << "Map Size: " << stats.mapSize << " Blocks DB " << stats.blocksDBStats << ", Nodes DB "
           << stats.nodesDBStats << ", Leaf Pre-images DB " << stats.leafPreimagesDBStats << ", Leaf Indices DB "
           << stats.leafIndicesDBStats;
        return os;
    }
};

std::ostream& operator<<(std::ostream& os, const TreeDBStats& stats);
} // namespace bb::crypto::merkle_tree