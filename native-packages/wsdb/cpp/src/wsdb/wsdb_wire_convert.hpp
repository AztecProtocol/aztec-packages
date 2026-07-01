#pragma once
/**
 * @file wsdb_wire_convert.hpp
 * @brief Server-side wire <-> domain conversion helpers for the aztec-wsdb
 * service.
 *
 * The converters that depend only on the generic merkle-tree vocabulary live
 * in a local wsdb_wire_convert_client.hpp, bound to this package's generated
 * wire types (bb's wsdb client keeps its own copy bound to bb's generated
 * types; the two can't share one header because each side codegens its own
 * wsdb_types.hpp). This header pulls those in and adds the server-only
 * converters that touch world_state aggregates (state references, DB stats,
 * tree/world-state meta), which require world_state and the persistent merkle
 * storage.
 */
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "merkle_tree/tree_db_stats.hpp"
#include "barretenberg/crypto/merkle_tree/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "lmdblib/types.hpp"
#include "world_state/types.hpp"
#include "world_state/world_state.hpp"
#include "wsdb/wsdb_wire_convert_client.hpp"

namespace bb::wsdb {

inline std::vector<wire::TreeStateReference>
state_reference_to_wire(const world_state::StateReference &d) {
  std::vector<wire::TreeStateReference> r;
  r.reserve(d.size());
  for (const auto &[tree_id, tree_ref] : d) {
    r.push_back({.treeId = tree_id_to_wire(tree_id),
                 .root = fr_to_wire(tree_ref.first),
                 .size = tree_ref.second});
  }
  return r;
}

inline world_state::StateReference
state_reference_from_wire(const std::vector<wire::TreeStateReference> &w) {
  world_state::StateReference r;
  r.reserve(w.size());
  for (const auto &entry : w) {
    r.emplace(
        tree_id_from_wire(entry.treeId),
        world_state::TreeStateReference{fr_from_wire(entry.root), entry.size});
  }
  return r;
}

inline wire::DBStats db_stats_to_wire(const bb::lmdblib::DBStats &d) {
  return {.name = d.name,
          .numDataItems = d.numDataItems,
          .totalUsedSize = d.totalUsedSize};
}

inline bb::lmdblib::DBStats db_stats_from_wire(const wire::DBStats &w) {
  return bb::lmdblib::DBStats(w.name, w.numDataItems, w.totalUsedSize);
}

inline wire::TreeDBStats
tree_db_stats_to_wire(const bb::crypto::merkle_tree::TreeDBStats &d) {
  return {.mapSize = d.mapSize,
          .physicalFileSize = d.physicalFileSize,
          .blocksDBStats = db_stats_to_wire(d.blocksDBStats),
          .nodesDBStats = db_stats_to_wire(d.nodesDBStats),
          .leafPreimagesDBStats = db_stats_to_wire(d.leafPreimagesDBStats),
          .leafIndicesDBStats = db_stats_to_wire(d.leafIndicesDBStats),
          .blockIndicesDBStats = db_stats_to_wire(d.blockIndicesDBStats)};
}

inline bb::crypto::merkle_tree::TreeDBStats
tree_db_stats_from_wire(const wire::TreeDBStats &w) {
  return {w.mapSize,
          w.physicalFileSize,
          db_stats_from_wire(w.blocksDBStats),
          db_stats_from_wire(w.nodesDBStats),
          db_stats_from_wire(w.leafPreimagesDBStats),
          db_stats_from_wire(w.leafIndicesDBStats),
          db_stats_from_wire(w.blockIndicesDBStats)};
}

inline wire::TreeMeta
tree_meta_to_wire(const bb::crypto::merkle_tree::TreeMeta &d) {
  return {.name = d.name,
          .depth = d.depth,
          .size = d.size,
          .committedSize = d.committedSize,
          .root = fr_to_wire(d.root),
          .initialSize = d.initialSize,
          .initialRoot = fr_to_wire(d.initialRoot),
          .oldestHistoricBlock = d.oldestHistoricBlock,
          .unfinalizedBlockHeight = d.unfinalizedBlockHeight,
          .finalizedBlockHeight = d.finalizedBlockHeight};
}

inline bb::crypto::merkle_tree::TreeMeta
tree_meta_from_wire(const wire::TreeMeta &w) {
  return {w.name,
          w.depth,
          w.size,
          w.committedSize,
          fr_from_wire(w.root),
          w.initialSize,
          fr_from_wire(w.initialRoot),
          w.oldestHistoricBlock,
          w.unfinalizedBlockHeight,
          w.finalizedBlockHeight};
}

inline wire::WorldStateDBStats
world_state_db_stats_to_wire(const bb::world_state::WorldStateDBStats &d) {
  return {.noteHashTreeStats = tree_db_stats_to_wire(d.noteHashTreeStats),
          .messageTreeStats = tree_db_stats_to_wire(d.messageTreeStats),
          .archiveTreeStats = tree_db_stats_to_wire(d.archiveTreeStats),
          .publicDataTreeStats = tree_db_stats_to_wire(d.publicDataTreeStats),
          .nullifierTreeStats = tree_db_stats_to_wire(d.nullifierTreeStats)};
}

inline bb::world_state::WorldStateDBStats
world_state_db_stats_from_wire(const wire::WorldStateDBStats &w) {
  return {tree_db_stats_from_wire(w.noteHashTreeStats),
          tree_db_stats_from_wire(w.messageTreeStats),
          tree_db_stats_from_wire(w.archiveTreeStats),
          tree_db_stats_from_wire(w.publicDataTreeStats),
          tree_db_stats_from_wire(w.nullifierTreeStats)};
}

inline wire::WorldStateMeta
world_state_meta_to_wire(const bb::world_state::WorldStateMeta &d) {
  return {.noteHashTreeMeta = tree_meta_to_wire(d.noteHashTreeMeta),
          .messageTreeMeta = tree_meta_to_wire(d.messageTreeMeta),
          .archiveTreeMeta = tree_meta_to_wire(d.archiveTreeMeta),
          .publicDataTreeMeta = tree_meta_to_wire(d.publicDataTreeMeta),
          .nullifierTreeMeta = tree_meta_to_wire(d.nullifierTreeMeta)};
}

inline bb::world_state::WorldStateMeta
world_state_meta_from_wire(const wire::WorldStateMeta &w) {
  return {tree_meta_from_wire(w.noteHashTreeMeta),
          tree_meta_from_wire(w.messageTreeMeta),
          tree_meta_from_wire(w.archiveTreeMeta),
          tree_meta_from_wire(w.publicDataTreeMeta),
          tree_meta_from_wire(w.nullifierTreeMeta)};
}

inline wire::WorldStateStatusSummary world_state_status_summary_to_wire(
    const bb::world_state::WorldStateStatusSummary &d) {
  return {.unfinalizedBlockNumber = d.unfinalizedBlockNumber,
          .finalizedBlockNumber = d.finalizedBlockNumber,
          .oldestHistoricalBlock = d.oldestHistoricalBlock,
          .treesAreSynched = d.treesAreSynched};
}

inline bb::world_state::WorldStateStatusSummary
world_state_status_summary_from_wire(const wire::WorldStateStatusSummary &w) {
  return {w.unfinalizedBlockNumber, w.finalizedBlockNumber,
          w.oldestHistoricalBlock, w.treesAreSynched};
}

inline wire::WorldStateStatusFull world_state_status_full_to_wire(
    const bb::world_state::WorldStateStatusFull &d) {
  return {.summary = world_state_status_summary_to_wire(d.summary),
          .dbStats = world_state_db_stats_to_wire(d.dbStats),
          .meta = world_state_meta_to_wire(d.meta)};
}

inline bb::world_state::WorldStateStatusFull
world_state_status_full_from_wire(const wire::WorldStateStatusFull &w) {
  return {world_state_status_summary_from_wire(w.summary),
          world_state_db_stats_from_wire(w.dbStats),
          world_state_meta_from_wire(w.meta)};
}

} // namespace bb::wsdb
