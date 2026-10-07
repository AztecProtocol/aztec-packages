#pragma once
#include "merkle_tree/types.hpp"
#include "wsdb/generated/wsdb_types.hpp"
#include <ostream>

namespace azteclabs::wsdb::merkle_tree {

// The generated wire record is the domain type: it is what the lmdb store persists and what
// crosses the IPC boundary.
using TreeMeta = wire::TreeMeta;

} // namespace azteclabs::wsdb::merkle_tree

namespace azteclabs::wsdb::wire {
inline std::ostream& operator<<(std::ostream& os, const TreeMeta& meta)
{
    os << "TreeMeta{name: " << meta.name << ", depth: " << meta.depth << ", size: " << std::dec << (meta.size)
       << ", committedSize: " << std::dec << meta.committedSize << ", root: " << fr(meta.root)
       << ", initialSize: " << std::dec << meta.initialSize << ", initialRoot: " << fr(meta.initialRoot)
       << ", oldestHistoricBlock: " << std::dec << meta.oldestHistoricBlock << ", finalizedBlockHeight: " << std::dec
       << meta.finalizedBlockHeight << ", unfinalizedBlockHeight: " << std::dec << meta.unfinalizedBlockHeight << "}";
    return os;
}
} // namespace azteclabs::wsdb::wire
