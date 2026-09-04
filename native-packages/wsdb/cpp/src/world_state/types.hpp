#pragma once

#include <cstdint>
#include <limits>
#include <ostream>
#include <unordered_map>
#include <utility>
#include <variant>

#include "field/field_element.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "merkle_tree/merkle_tree_id.hpp"
#include "merkle_tree/tree_db_stats.hpp"
#include "merkle_tree/tree_meta.hpp"
#include "merkle_tree/types.hpp"
#include "wsdb/generated/wsdb_types.hpp"

namespace azteclabs::wsdb::world_state {

using namespace azteclabs::wsdb::merkle_tree;

const uint64_t CANONICAL_FORK_ID = 0;
const uint64_t NUM_TREES = 5;

using TreeStateReference = std::pair<fr, index_t>;
using StateReference = std::unordered_map<MerkleTreeId, TreeStateReference>;

// The generated wire records are the domain types for status reporting.
using WorldStateStatusSummary = wire::WorldStateStatusSummary;
using WorldStateDBStats = wire::WorldStateDBStats;
using WorldStateMeta = wire::WorldStateMeta;
using WorldStateStatusFull = wire::WorldStateStatusFull;

} // namespace azteclabs::wsdb::world_state

namespace azteclabs::wsdb::wire {
inline std::ostream& operator<<(std::ostream& os, const WorldStateStatusSummary& status)
{
    os << "unfinalizedBlockNumber: " << status.unfinalizedBlockNumber
       << ", finalizedBlockNumber: " << status.finalizedBlockNumber
       << ", oldestHistoricalBlock: " << status.oldestHistoricalBlock
       << ", treesAreSynched: " << status.treesAreSynched;
    return os;
}
inline std::ostream& operator<<(std::ostream& os, const WorldStateDBStats& stats)
{
    os << "Note hash tree stats " << stats.noteHashTreeStats << ", Message tree stats " << stats.messageTreeStats
       << ", Archive tree stats " << stats.archiveTreeStats << ", Public Data tree stats " << stats.publicDataTreeStats
       << ", Nullifier tree stats " << stats.nullifierTreeStats;
    return os;
}
inline std::ostream& operator<<(std::ostream& os, const WorldStateMeta& meta)
{
    os << "Note hash tree meta " << meta.noteHashTreeMeta << ", Message tree meta " << meta.messageTreeMeta
       << ", Archive tree meta " << meta.archiveTreeMeta << ", Public Data tree meta " << meta.publicDataTreeMeta
       << ", Nullifier tree meta " << meta.nullifierTreeMeta;
    return os;
}
inline std::ostream& operator<<(std::ostream& os, const WorldStateStatusFull& status)
{
    os << "Summary: " << status.summary << ", DB Stats " << status.dbStats << ", Meta " << status.meta;
    return os;
}
} // namespace azteclabs::wsdb::wire
