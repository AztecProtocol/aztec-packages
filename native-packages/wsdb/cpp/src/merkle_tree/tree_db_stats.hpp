#pragma once
// Persistent-tree storage statistics and the merkle responses that carry them.
// These live in the wsdb package (not barretenberg's generic merkle core)
// because only the persistent, lmdb-backed trees report stats — the in-memory
// merkle tree has none. The generated wire records are the domain types.
#include "merkle_tree/tree_meta.hpp"
#include "wsdb/generated/wsdb_types.hpp"
#include <cstdint>
#include <ostream>

namespace azteclabs::wsdb::merkle_tree {

using DBStats = wire::DBStats;
using TreeDBStats = wire::TreeDBStats;

struct CommitResponse {
    TreeMeta meta;
    TreeDBStats stats;
};

struct UnwindResponse {
    TreeMeta meta;
    TreeDBStats stats;
};

struct RemoveHistoricResponse {
    TreeMeta meta;
    TreeDBStats stats;
};

} // namespace azteclabs::wsdb::merkle_tree

namespace azteclabs::wsdb::wire {
inline std::ostream& operator<<(std::ostream& os, const DBStats& stats)
{
    os << "DB " << stats.name << ", num items: " << stats.numDataItems << ", total used size: " << stats.totalUsedSize;
    return os;
}
inline std::ostream& operator<<(std::ostream& os, const TreeDBStats& stats)
{
    os << "Map Size: " << stats.mapSize << ", Physical File Size: " << stats.physicalFileSize << " Blocks DB "
       << stats.blocksDBStats << ", Nodes DB " << stats.nodesDBStats << ", Leaf Pre-images DB "
       << stats.leafPreimagesDBStats << ", Leaf Indices DB " << stats.leafIndicesDBStats << ", Block Indices DB "
       << stats.blockIndicesDBStats;
    return os;
}
} // namespace azteclabs::wsdb::wire
