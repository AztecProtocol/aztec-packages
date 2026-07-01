#pragma once

#include <cstdint>
#include <limits>
#include <utility>
#include <variant>

#include "barretenberg/crypto/merkle_tree/indexed_leaf.hpp"
#include "merkle_tree/tree_db_stats.hpp"
#include "merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/merkle_tree_id.hpp"
#include "barretenberg/crypto/merkle_tree/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace bb::world_state {

using namespace bb::crypto::merkle_tree;

// MerkleTreeId, getMerkleTreeName and WorldStateRevision are merkle-tree vocabulary that lives in
// crypto/merkle_tree so that consumers (e.g. the AVM) can use them without depending on world_state.
// They are pulled in here via the `using namespace bb::crypto::merkle_tree` above and re-exported for
// the (many) existing world_state:: references.

const uint64_t CANONICAL_FORK_ID = 0;
const uint64_t NUM_TREES = 5;

using TreeStateReference = std::pair<bb::fr, bb::crypto::merkle_tree::index_t>;
using StateReference = std::unordered_map<MerkleTreeId, TreeStateReference>;

struct WorldStateStatusSummary {
    index_t unfinalizedBlockNumber;
    index_t finalizedBlockNumber;
    index_t oldestHistoricalBlock;
    bool treesAreSynched;
    SERIALIZATION_FIELDS(unfinalizedBlockNumber, finalizedBlockNumber, oldestHistoricalBlock, treesAreSynched);

    WorldStateStatusSummary() = default;
    WorldStateStatusSummary(const index_t& unfinalizedBlockNumber,
                            const index_t& finalizedBlockNumber,
                            const index_t& oldestHistoricBlock,
                            bool treesAreSynched)
        : unfinalizedBlockNumber(unfinalizedBlockNumber)
        , finalizedBlockNumber(finalizedBlockNumber)
        , oldestHistoricalBlock(oldestHistoricBlock)
        , treesAreSynched(treesAreSynched)
    {}
    WorldStateStatusSummary(const WorldStateStatusSummary& other) = default;
    WorldStateStatusSummary(WorldStateStatusSummary&& other) noexcept { *this = std::move(other); }

    WorldStateStatusSummary& operator=(WorldStateStatusSummary&& other) noexcept
    {
        if (this != &other) {
            *this = other;
        }
        return *this;
    }

    ~WorldStateStatusSummary() = default;

    WorldStateStatusSummary& operator=(const WorldStateStatusSummary& other) = default;

    bool operator==(const WorldStateStatusSummary& other) const
    {
        return unfinalizedBlockNumber == other.unfinalizedBlockNumber &&
               finalizedBlockNumber == other.finalizedBlockNumber &&
               oldestHistoricalBlock == other.oldestHistoricalBlock && treesAreSynched == other.treesAreSynched;
    }

    friend std::ostream& operator<<(std::ostream& os, const WorldStateStatusSummary& status)
    {
        os << "unfinalizedBlockNumber: " << status.unfinalizedBlockNumber
           << ", finalizedBlockNumber: " << status.finalizedBlockNumber
           << ", oldestHistoricalBlock: " << status.oldestHistoricalBlock
           << ", treesAreSynched: " << status.treesAreSynched;
        return os;
    }
};

struct WorldStateDBStats {
    TreeDBStats noteHashTreeStats;
    TreeDBStats messageTreeStats;
    TreeDBStats archiveTreeStats;
    TreeDBStats publicDataTreeStats;
    TreeDBStats nullifierTreeStats;

    SERIALIZATION_FIELDS(
        noteHashTreeStats, messageTreeStats, archiveTreeStats, publicDataTreeStats, nullifierTreeStats);

    WorldStateDBStats() = default;
    WorldStateDBStats(const TreeDBStats& noteHashStats,
                      const TreeDBStats& messageStats,
                      const TreeDBStats& archiveStats,
                      const TreeDBStats& publicDataStats,
                      const TreeDBStats& nullifierStats)
        : noteHashTreeStats(noteHashStats)
        , messageTreeStats(messageStats)
        , archiveTreeStats(archiveStats)
        , publicDataTreeStats(publicDataStats)
        , nullifierTreeStats(nullifierStats)
    {}
    WorldStateDBStats(const WorldStateDBStats& other) = default;
    WorldStateDBStats(WorldStateDBStats&& other) noexcept { *this = std::move(other); }

    WorldStateDBStats& operator=(WorldStateDBStats&& other) noexcept
    {
        if (this != &other) {
            noteHashTreeStats = std::move(other.noteHashTreeStats);
            messageTreeStats = std::move(other.messageTreeStats);
            archiveTreeStats = std::move(other.archiveTreeStats);
            publicDataTreeStats = std::move(other.publicDataTreeStats);
            nullifierTreeStats = std::move(other.nullifierTreeStats);
        }
        return *this;
    }

    ~WorldStateDBStats() = default;

    bool operator==(const WorldStateDBStats& other) const
    {
        return noteHashTreeStats == other.noteHashTreeStats && messageTreeStats == other.messageTreeStats &&
               archiveTreeStats == other.archiveTreeStats && publicDataTreeStats == other.publicDataTreeStats &&
               nullifierTreeStats == other.nullifierTreeStats;
    }

    WorldStateDBStats& operator=(const WorldStateDBStats& other) = default;

    friend std::ostream& operator<<(std::ostream& os, const WorldStateDBStats& stats)
    {
        os << "Note hash tree stats " << stats.noteHashTreeStats << ", Message tree stats " << stats.messageTreeStats
           << ", Archive tree stats " << stats.archiveTreeStats << ", Public Data tree stats "
           << stats.publicDataTreeStats << ", Nullifier tree stats " << stats.nullifierTreeStats;
        return os;
    }
};

struct WorldStateMeta {
    TreeMeta noteHashTreeMeta;
    TreeMeta messageTreeMeta;
    TreeMeta archiveTreeMeta;
    TreeMeta publicDataTreeMeta;
    TreeMeta nullifierTreeMeta;

    SERIALIZATION_FIELDS(noteHashTreeMeta, messageTreeMeta, archiveTreeMeta, publicDataTreeMeta, nullifierTreeMeta);

    WorldStateMeta() = default;
    WorldStateMeta(const TreeMeta& noteHashMeta,
                   const TreeMeta& messageMeta,
                   const TreeMeta& archiveMeta,
                   const TreeMeta& publicDataMeta,
                   const TreeMeta& nullifierMeta)
        : noteHashTreeMeta(noteHashMeta)
        , messageTreeMeta(messageMeta)
        , archiveTreeMeta(archiveMeta)
        , publicDataTreeMeta(publicDataMeta)
        , nullifierTreeMeta(nullifierMeta)
    {}
    WorldStateMeta(const WorldStateMeta& other) = default;
    WorldStateMeta(WorldStateMeta&& other) noexcept { *this = std::move(other); }

    WorldStateMeta& operator=(WorldStateMeta&& other) noexcept
    {
        if (this != &other) {
            noteHashTreeMeta = std::move(other.noteHashTreeMeta);
            messageTreeMeta = std::move(other.messageTreeMeta);
            archiveTreeMeta = std::move(other.archiveTreeMeta);
            publicDataTreeMeta = std::move(other.publicDataTreeMeta);
            nullifierTreeMeta = std::move(other.nullifierTreeMeta);
        }
        return *this;
    }

    ~WorldStateMeta() = default;

    bool operator==(const WorldStateMeta& other) const
    {
        return noteHashTreeMeta == other.noteHashTreeMeta && messageTreeMeta == other.messageTreeMeta &&
               archiveTreeMeta == other.archiveTreeMeta && publicDataTreeMeta == other.publicDataTreeMeta &&
               nullifierTreeMeta == other.nullifierTreeMeta;
    }

    WorldStateMeta& operator=(const WorldStateMeta& other) = default;

    friend std::ostream& operator<<(std::ostream& os, const WorldStateMeta& stats)
    {
        os << "Note hash tree meta " << stats.noteHashTreeMeta << ", Message tree meta " << stats.messageTreeMeta
           << ", Archive tree meta " << stats.archiveTreeMeta << ", Public Data tree meta " << stats.publicDataTreeMeta
           << ", Nullifier tree meta " << stats.nullifierTreeMeta;
        return os;
    }
};

struct WorldStateStatusFull {
    WorldStateStatusSummary summary;
    WorldStateDBStats dbStats;
    WorldStateMeta meta;

    SERIALIZATION_FIELDS(summary, dbStats, meta);

    WorldStateStatusFull() = default;
    WorldStateStatusFull(const WorldStateStatusSummary& summary,
                         const WorldStateDBStats& dbStats,
                         const WorldStateMeta& meta)
        : summary(summary)
        , dbStats(dbStats)
        , meta(meta)
    {}
    WorldStateStatusFull(const WorldStateStatusFull& other) = default;
    WorldStateStatusFull(WorldStateStatusFull&& other) noexcept { *this = std::move(other); }

    WorldStateStatusFull& operator=(WorldStateStatusFull&& other) noexcept
    {
        if (this != &other) {
            summary = std::move(other.summary);
            dbStats = std::move(other.dbStats);
            meta = std::move(other.meta);
        }
        return *this;
    }

    ~WorldStateStatusFull() = default;

    WorldStateStatusFull& operator=(const WorldStateStatusFull& other) = default;

    bool operator==(const WorldStateStatusFull& other) const
    {
        return summary == other.summary && dbStats == other.dbStats && meta == other.meta;
    }

    friend std::ostream& operator<<(std::ostream& os, const WorldStateStatusFull& status)
    {
        os << "Summary: " << status.summary << ", DB Stats " << status.dbStats << ", Meta " << status.meta;
        return os;
    }
};
} // namespace bb::world_state
