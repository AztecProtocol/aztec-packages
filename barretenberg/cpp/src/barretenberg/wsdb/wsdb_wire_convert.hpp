#pragma once
/**
 * @file wsdb_wire_convert.hpp
 * @brief Wire <-> domain conversion helpers for the aztec-wsdb service.
 *
 * All conversions are field-by-field. The codegen-emitted wire types in
 * generated/wsdb_types.hpp are POD-shaped (uint32_t for tree IDs,
 * std::array<uint8_t, 32> for field elements, etc); domain types come from
 * world_state/, crypto/merkle_tree/, ecc/, lmdblib/. This file is the
 * single place that translates between them — used by handlers (server
 * side) and by wsdb_ipc_merkle_db.cpp (AVM client side).
 */
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "barretenberg/world_state/types.hpp"
#include "generated/wsdb_types.hpp"

#include <cstring>

namespace bb::wsdb {

inline std::array<uint8_t, 32> fr_to_wire(const bb::fr& d)
{
    std::array<uint8_t, 32> r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr fr_from_wire(const std::array<uint8_t, 32>& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline std::vector<std::array<uint8_t, 32>> fr_vec_to_wire(const std::vector<bb::fr>& d)
{
    std::vector<std::array<uint8_t, 32>> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(fr_to_wire(x));
    }
    return r;
}

inline std::vector<bb::fr> fr_vec_from_wire(const std::vector<std::array<uint8_t, 32>>& w)
{
    std::vector<bb::fr> r;
    r.reserve(w.size());
    for (const auto& x : w) {
        r.push_back(fr_from_wire(x));
    }
    return r;
}

inline wire::WorldStateRevision revision_to_wire(const world_state::WorldStateRevision& d)
{
    return wire::WorldStateRevision{
        .forkId = d.forkId,
        .blockNumber = d.blockNumber,
        .includeUncommitted = d.includeUncommitted,
    };
}

inline world_state::WorldStateRevision revision_from_wire(const wire::WorldStateRevision& w)
{
    return world_state::WorldStateRevision{
        .forkId = w.forkId,
        .blockNumber = w.blockNumber,
        .includeUncommitted = w.includeUncommitted,
    };
}

inline uint32_t tree_id_to_wire(world_state::MerkleTreeId d)
{
    return static_cast<uint32_t>(d);
}

inline world_state::MerkleTreeId tree_id_from_wire(uint32_t w)
{
    return static_cast<world_state::MerkleTreeId>(w);
}

// StateReference: domain unordered_map<MerkleTreeId, pair<fr, index_t>>.
// Wire: unordered_map<uint32_t, pair<vector<uint8_t>, uint64_t>>, where the
// inner vector<uint8_t> holds the msgpack-encoded `fr` (preserving the
// canonical 34-byte bin8-prefixed encoding for AVM <-> wsdb roundtrip).
inline std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>> state_reference_to_wire(
    const world_state::StateReference& d)
{
    std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>> r;
    r.reserve(d.size());
    for (const auto& [tree_id, tree_ref] : d) {
        msgpack::sbuffer buf;
        msgpack::pack(buf, tree_ref.first);
        std::vector<uint8_t> root_bytes(buf.data(), buf.data() + buf.size());
        r.emplace(static_cast<uint32_t>(tree_id), std::make_pair(std::move(root_bytes), tree_ref.second));
    }
    return r;
}

inline world_state::StateReference state_reference_from_wire(
    const std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>>& w)
{
    world_state::StateReference r;
    r.reserve(w.size());
    for (const auto& [tree_id, p] : w) {
        const auto& root_bytes = p.first;
        bb::fr root_fr;
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(root_bytes.data()), root_bytes.size());
        unpacked.get().convert(root_fr);
        r.emplace(static_cast<world_state::MerkleTreeId>(tree_id),
                  world_state::TreeStateReference{ root_fr, static_cast<crypto::merkle_tree::index_t>(p.second) });
    }
    return r;
}

// World-state status conversions. Field-by-field walk of the
// WorldStateStatusFull / WorldStateStatusSummary aggregates and their
// nested DBStats / TreeDBStats / TreeMeta / WorldStateDBStats /
// WorldStateMeta components. The wire types live in `bb::wsdb::wire`,
// the domain types in `bb::lmdblib`, `bb::crypto::merkle_tree`,
// `bb::world_state`.

inline wire::DBStats db_stats_to_wire(const bb::lmdblib::DBStats& d)
{
    return { .name = d.name, .numDataItems = d.numDataItems, .totalUsedSize = d.totalUsedSize };
}

inline bb::lmdblib::DBStats db_stats_from_wire(const wire::DBStats& w)
{
    return bb::lmdblib::DBStats(w.name, w.numDataItems, w.totalUsedSize);
}

inline wire::TreeDBStats tree_db_stats_to_wire(const bb::crypto::merkle_tree::TreeDBStats& d)
{
    return { .mapSize = d.mapSize,
             .physicalFileSize = d.physicalFileSize,
             .blocksDBStats = db_stats_to_wire(d.blocksDBStats),
             .nodesDBStats = db_stats_to_wire(d.nodesDBStats),
             .leafPreimagesDBStats = db_stats_to_wire(d.leafPreimagesDBStats),
             .leafIndicesDBStats = db_stats_to_wire(d.leafIndicesDBStats),
             .blockIndicesDBStats = db_stats_to_wire(d.blockIndicesDBStats) };
}

inline bb::crypto::merkle_tree::TreeDBStats tree_db_stats_from_wire(const wire::TreeDBStats& w)
{
    return { w.mapSize,
             w.physicalFileSize,
             db_stats_from_wire(w.blocksDBStats),
             db_stats_from_wire(w.nodesDBStats),
             db_stats_from_wire(w.leafPreimagesDBStats),
             db_stats_from_wire(w.leafIndicesDBStats),
             db_stats_from_wire(w.blockIndicesDBStats) };
}

inline wire::TreeMeta tree_meta_to_wire(const bb::crypto::merkle_tree::TreeMeta& d)
{
    return { .name = d.name,
             .depth = d.depth,
             .size = d.size,
             .committedSize = d.committedSize,
             .root = fr_to_wire(d.root),
             .initialSize = d.initialSize,
             .initialRoot = fr_to_wire(d.initialRoot),
             .oldestHistoricBlock = d.oldestHistoricBlock,
             .unfinalizedBlockHeight = d.unfinalizedBlockHeight,
             .finalizedBlockHeight = d.finalizedBlockHeight };
}

inline bb::crypto::merkle_tree::TreeMeta tree_meta_from_wire(const wire::TreeMeta& w)
{
    return { w.name,
             w.depth,
             w.size,
             w.committedSize,
             fr_from_wire(w.root),
             w.initialSize,
             fr_from_wire(w.initialRoot),
             w.oldestHistoricBlock,
             w.unfinalizedBlockHeight,
             w.finalizedBlockHeight };
}

inline wire::WorldStateDBStats world_state_db_stats_to_wire(const bb::world_state::WorldStateDBStats& d)
{
    return { .noteHashTreeStats = tree_db_stats_to_wire(d.noteHashTreeStats),
             .messageTreeStats = tree_db_stats_to_wire(d.messageTreeStats),
             .archiveTreeStats = tree_db_stats_to_wire(d.archiveTreeStats),
             .publicDataTreeStats = tree_db_stats_to_wire(d.publicDataTreeStats),
             .nullifierTreeStats = tree_db_stats_to_wire(d.nullifierTreeStats) };
}

inline bb::world_state::WorldStateDBStats world_state_db_stats_from_wire(const wire::WorldStateDBStats& w)
{
    return { tree_db_stats_from_wire(w.noteHashTreeStats),
             tree_db_stats_from_wire(w.messageTreeStats),
             tree_db_stats_from_wire(w.archiveTreeStats),
             tree_db_stats_from_wire(w.publicDataTreeStats),
             tree_db_stats_from_wire(w.nullifierTreeStats) };
}

inline wire::WorldStateMeta world_state_meta_to_wire(const bb::world_state::WorldStateMeta& d)
{
    return { .noteHashTreeMeta = tree_meta_to_wire(d.noteHashTreeMeta),
             .messageTreeMeta = tree_meta_to_wire(d.messageTreeMeta),
             .archiveTreeMeta = tree_meta_to_wire(d.archiveTreeMeta),
             .publicDataTreeMeta = tree_meta_to_wire(d.publicDataTreeMeta),
             .nullifierTreeMeta = tree_meta_to_wire(d.nullifierTreeMeta) };
}

inline bb::world_state::WorldStateMeta world_state_meta_from_wire(const wire::WorldStateMeta& w)
{
    return { tree_meta_from_wire(w.noteHashTreeMeta),
             tree_meta_from_wire(w.messageTreeMeta),
             tree_meta_from_wire(w.archiveTreeMeta),
             tree_meta_from_wire(w.publicDataTreeMeta),
             tree_meta_from_wire(w.nullifierTreeMeta) };
}

inline wire::WorldStateStatusSummary world_state_status_summary_to_wire(
    const bb::world_state::WorldStateStatusSummary& d)
{
    return { .unfinalizedBlockNumber = d.unfinalizedBlockNumber,
             .finalizedBlockNumber = d.finalizedBlockNumber,
             .oldestHistoricalBlock = d.oldestHistoricalBlock,
             .treesAreSynched = d.treesAreSynched };
}

inline bb::world_state::WorldStateStatusSummary world_state_status_summary_from_wire(
    const wire::WorldStateStatusSummary& w)
{
    return { w.unfinalizedBlockNumber, w.finalizedBlockNumber, w.oldestHistoricalBlock, w.treesAreSynched };
}

inline wire::WorldStateStatusFull world_state_status_full_to_wire(const bb::world_state::WorldStateStatusFull& d)
{
    return { .summary = world_state_status_summary_to_wire(d.summary),
             .dbStats = world_state_db_stats_to_wire(d.dbStats),
             .meta = world_state_meta_to_wire(d.meta) };
}

inline bb::world_state::WorldStateStatusFull world_state_status_full_from_wire(const wire::WorldStateStatusFull& w)
{
    return { world_state_status_summary_from_wire(w.summary),
             world_state_db_stats_from_wire(w.dbStats),
             world_state_meta_from_wire(w.meta) };
}

} // namespace bb::wsdb
