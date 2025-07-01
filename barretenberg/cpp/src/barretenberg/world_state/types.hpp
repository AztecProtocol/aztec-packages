#pragma once

#include <cstdint>
#include <utility>
#include <variant>

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace bb::world_state {

using namespace bb::crypto::merkle_tree;

enum MerkleTreeId {
    NULLIFIER_TREE = 0,
    NOTE_HASH_TREE = 1,
    PUBLIC_DATA_TREE = 2,
    L1_TO_L2_MESSAGE_TREE = 3,
    ARCHIVE = 4,
};

const uint64_t CANONICAL_FORK_ID = 0;
const uint64_t NUM_TREES = 5;

std::string getMerkleTreeName(MerkleTreeId id);

using TreeStateReference = std::pair<bb::fr, bb::crypto::merkle_tree::index_t>;
using StateReference = std::unordered_map<MerkleTreeId, TreeStateReference>;

struct WorldStateRevision {
    index_t forkId{ 0 };
    block_number_t blockNumber{ 0 };
    bool includeUncommitted{ false };

    MSGPACK_FIELDS(forkId, blockNumber, includeUncommitted)

    static WorldStateRevision committed() { return WorldStateRevision{ .includeUncommitted = false }; }
    static WorldStateRevision uncommitted() { return WorldStateRevision{ .includeUncommitted = true }; }
};

struct WorldStateStatusSummary {
    index_t unfinalisedBlockNumber;
    index_t finalisedBlockNumber;
    index_t oldestHistoricalBlock;
    bool treesAreSynched;
    MSGPACK_FIELDS(unfinalisedBlockNumber, finalisedBlockNumber, oldestHistoricalBlock, treesAreSynched);

    WorldStateStatusSummary() = default;
    WorldStateStatusSummary(const index_t& unfinalisedBlockNumber,
                            const index_t& finalisedBlockNumber,
                            const index_t& oldestHistoricBlock,
                            bool treesAreSynched)
        : unfinalisedBlockNumber(unfinalisedBlockNumber)
        , finalisedBlockNumber(finalisedBlockNumber)
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
        return unfinalisedBlockNumber == other.unfinalisedBlockNumber &&
               finalisedBlockNumber == other.finalisedBlockNumber &&
               oldestHistoricalBlock == other.oldestHistoricalBlock && treesAreSynched == other.treesAreSynched;
    }

    friend std::ostream& operator<<(std::ostream& os, const WorldStateStatusSummary& status)
    {
        os << "unfinalisedBlockNumber: " << status.unfinalisedBlockNumber
           << ", finalisedBlockNumber: " << status.finalisedBlockNumber
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

    MSGPACK_FIELDS(noteHashTreeStats, messageTreeStats, archiveTreeStats, publicDataTreeStats, nullifierTreeStats);

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

    MSGPACK_FIELDS(noteHashTreeMeta, messageTreeMeta, archiveTreeMeta, publicDataTreeMeta, nullifierTreeMeta);

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

    MSGPACK_FIELDS(summary, dbStats, meta);

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
