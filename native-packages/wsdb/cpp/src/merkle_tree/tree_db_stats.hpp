#pragma once

// Persistent-tree storage statistics and the merkle responses that carry them.
// These live in the wsdb package (not barretenberg's generic merkle core)
// because only the persistent, lmdb-backed trees report stats — the in-memory
// merkle tree has none. DBStats itself is owned by lmdblib (it is what lmdb
// reports).

#include "lmdblib/types.hpp"
#include "merkle_tree/tree_meta.hpp"
#include <cstdint>
#include <iostream>

namespace azteclabs::wsdb::merkle_tree {

using DBStats = azteclabs::lmdblib::DBStats;

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

    MSGPACK_DEFINE_MAP(mapSize,
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

struct CommitResponse {
    TreeMeta meta;
    TreeDBStats stats;

    CommitResponse() = default;
    ~CommitResponse() = default;
    CommitResponse(const CommitResponse& other) = default;
    CommitResponse(CommitResponse&& other) noexcept = default;
    CommitResponse& operator=(const CommitResponse& other) = default;
    CommitResponse& operator=(CommitResponse&& other) noexcept = default;
};

struct UnwindResponse {
    TreeMeta meta;
    TreeDBStats stats;

    UnwindResponse() = default;
    ~UnwindResponse() = default;
    UnwindResponse(const UnwindResponse& other) = default;
    UnwindResponse(UnwindResponse&& other) noexcept = default;
    UnwindResponse& operator=(const UnwindResponse& other) = default;
    UnwindResponse& operator=(UnwindResponse&& other) noexcept = default;
};

struct RemoveHistoricResponse {
    TreeMeta meta;
    TreeDBStats stats;

    RemoveHistoricResponse() = default;
    ~RemoveHistoricResponse() = default;
    RemoveHistoricResponse(const RemoveHistoricResponse& other) = default;
    RemoveHistoricResponse(RemoveHistoricResponse&& other) noexcept = default;
    RemoveHistoricResponse& operator=(const RemoveHistoricResponse& other) = default;
    RemoveHistoricResponse& operator=(RemoveHistoricResponse&& other) noexcept = default;
};

} // namespace azteclabs::wsdb::merkle_tree
