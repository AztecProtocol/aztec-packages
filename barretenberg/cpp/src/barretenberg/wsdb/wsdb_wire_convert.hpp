#pragma once
/**
 * @file wsdb_wire_convert.hpp
 * @brief Wire <-> domain conversion helpers for the aztec-wsdb service.
 */
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/generated/wsdb_types.hpp"

namespace bb::wsdb {

inline Fr fr_to_wire(const bb::fr& d)
{
    Fr r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr fr_from_wire(const Fr& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline PublicDataSlot public_data_slot_to_wire(const bb::fr& d)
{
    PublicDataSlot r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr public_data_slot_from_wire(const PublicDataSlot& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline PublicDataValue public_data_value_to_wire(const bb::fr& d)
{
    PublicDataValue r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr public_data_value_from_wire(const PublicDataValue& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline Nullifier nullifier_to_wire(const bb::fr& d)
{
    Nullifier r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr nullifier_from_wire(const Nullifier& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline std::vector<Fr> fr_vec_to_wire(const std::vector<bb::fr>& d)
{
    std::vector<Fr> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(fr_to_wire(x));
    }
    return r;
}

inline std::vector<bb::fr> fr_vec_from_wire(const std::vector<Fr>& w)
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

inline MerkleTreeId tree_id_to_wire(world_state::MerkleTreeId d)
{
    return static_cast<MerkleTreeId>(d);
}

inline world_state::MerkleTreeId tree_id_from_wire(MerkleTreeId w)
{
    return static_cast<world_state::MerkleTreeId>(w);
}

inline wire::PublicDataLeafValue public_data_leaf_to_wire(const crypto::merkle_tree::PublicDataLeafValue& d)
{
    return { .slot = public_data_slot_to_wire(d.slot), .value = public_data_value_to_wire(d.value) };
}

inline crypto::merkle_tree::PublicDataLeafValue public_data_leaf_from_wire(const wire::PublicDataLeafValue& w)
{
    return { public_data_slot_from_wire(w.slot), public_data_value_from_wire(w.value) };
}

inline std::vector<wire::PublicDataLeafValue> public_data_leaf_vec_to_wire(
    const std::vector<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    std::vector<wire::PublicDataLeafValue> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(public_data_leaf_to_wire(x));
    }
    return r;
}

inline std::vector<crypto::merkle_tree::PublicDataLeafValue> public_data_leaf_vec_from_wire(
    const std::vector<wire::PublicDataLeafValue>& w)
{
    std::vector<crypto::merkle_tree::PublicDataLeafValue> r;
    r.reserve(w.size());
    for (const auto& x : w) {
        r.push_back(public_data_leaf_from_wire(x));
    }
    return r;
}

inline wire::NullifierLeafValue nullifier_leaf_to_wire(const crypto::merkle_tree::NullifierLeafValue& d)
{
    return { .nullifier = nullifier_to_wire(d.nullifier) };
}

inline crypto::merkle_tree::NullifierLeafValue nullifier_leaf_from_wire(const wire::NullifierLeafValue& w)
{
    return { nullifier_from_wire(w.nullifier) };
}

inline std::vector<wire::NullifierLeafValue> nullifier_leaf_vec_to_wire(
    const std::vector<crypto::merkle_tree::NullifierLeafValue>& d)
{
    std::vector<wire::NullifierLeafValue> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(nullifier_leaf_to_wire(x));
    }
    return r;
}

inline std::vector<crypto::merkle_tree::NullifierLeafValue> nullifier_leaf_vec_from_wire(
    const std::vector<wire::NullifierLeafValue>& w)
{
    std::vector<crypto::merkle_tree::NullifierLeafValue> r;
    r.reserve(w.size());
    for (const auto& x : w) {
        r.push_back(nullifier_leaf_from_wire(x));
    }
    return r;
}

inline wire::IndexedPublicDataLeafValue indexed_public_data_leaf_to_wire(
    const crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    return { .leaf = public_data_leaf_to_wire(d.leaf), .nextIndex = d.nextIndex, .nextKey = fr_to_wire(d.nextKey) };
}

inline crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue> indexed_public_data_leaf_from_wire(
    const wire::IndexedPublicDataLeafValue& w)
{
    return { public_data_leaf_from_wire(w.leaf), w.nextIndex, fr_from_wire(w.nextKey) };
}

inline wire::IndexedNullifierLeafValue indexed_nullifier_leaf_to_wire(
    const crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>& d)
{
    return { .leaf = nullifier_leaf_to_wire(d.leaf), .nextIndex = d.nextIndex, .nextKey = fr_to_wire(d.nextKey) };
}

inline crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue> indexed_nullifier_leaf_from_wire(
    const wire::IndexedNullifierLeafValue& w)
{
    return { nullifier_leaf_from_wire(w.leaf), w.nextIndex, fr_from_wire(w.nextKey) };
}

inline wire::PublicDataLeafUpdateWitnessData public_data_witness_to_wire(
    const crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    return { .leaf = indexed_public_data_leaf_to_wire(d.leaf), .index = d.index, .path = fr_vec_to_wire(d.path) };
}

inline crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>
public_data_witness_from_wire(const wire::PublicDataLeafUpdateWitnessData& w)
{
    return { indexed_public_data_leaf_from_wire(w.leaf), w.index, fr_vec_from_wire(w.path) };
}

inline wire::NullifierLeafUpdateWitnessData nullifier_witness_to_wire(
    const crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>& d)
{
    return { .leaf = indexed_nullifier_leaf_to_wire(d.leaf), .index = d.index, .path = fr_vec_to_wire(d.path) };
}

inline crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue> nullifier_witness_from_wire(
    const wire::NullifierLeafUpdateWitnessData& w)
{
    return { indexed_nullifier_leaf_from_wire(w.leaf), w.index, fr_vec_from_wire(w.path) };
}

template <typename Wire, typename Domain, typename Fn>
inline std::vector<Wire> vec_to_wire(const std::vector<Domain>& d, Fn fn)
{
    std::vector<Wire> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(fn(x));
    }
    return r;
}

template <typename Domain, typename Wire, typename Fn>
inline std::vector<Domain> vec_from_wire(const std::vector<Wire>& w, Fn fn)
{
    std::vector<Domain> r;
    r.reserve(w.size());
    for (const auto& x : w) {
        r.push_back(fn(x));
    }
    return r;
}

inline wire::BatchInsertionResultPublicData batch_public_data_to_wire(
    const world_state::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    std::vector<wire::SortedPublicDataLeaf> sorted;
    sorted.reserve(d.sorted_leaves.size());
    for (const auto& [leaf, index] : d.sorted_leaves) {
        sorted.push_back({ .leaf = public_data_leaf_to_wire(leaf), .index = index });
    }
    return { .lowLeafWitnessData = vec_to_wire<wire::PublicDataLeafUpdateWitnessData>(d.low_leaf_witness_data,
                                                                                      public_data_witness_to_wire),
             .sortedLeaves = std::move(sorted),
             .subtreePath = fr_vec_to_wire(d.subtree_path) };
}

inline world_state::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue> batch_public_data_from_wire(
    const wire::BatchInsertionResultPublicData& w)
{
    world_state::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue> r;
    r.low_leaf_witness_data =
        vec_from_wire<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>>(
            w.lowLeafWitnessData, public_data_witness_from_wire);
    r.sorted_leaves.reserve(w.sortedLeaves.size());
    for (const auto& x : w.sortedLeaves) {
        r.sorted_leaves.emplace_back(public_data_leaf_from_wire(x.leaf), x.index);
    }
    r.subtree_path = fr_vec_from_wire(w.subtreePath);
    return r;
}

inline wire::BatchInsertionResultNullifier batch_nullifier_to_wire(
    const world_state::BatchInsertionResult<crypto::merkle_tree::NullifierLeafValue>& d)
{
    std::vector<wire::SortedNullifierLeaf> sorted;
    sorted.reserve(d.sorted_leaves.size());
    for (const auto& [leaf, index] : d.sorted_leaves) {
        sorted.push_back({ .leaf = nullifier_leaf_to_wire(leaf), .index = index });
    }
    return { .lowLeafWitnessData =
                 vec_to_wire<wire::NullifierLeafUpdateWitnessData>(d.low_leaf_witness_data, nullifier_witness_to_wire),
             .sortedLeaves = std::move(sorted),
             .subtreePath = fr_vec_to_wire(d.subtree_path) };
}

inline world_state::BatchInsertionResult<crypto::merkle_tree::NullifierLeafValue> batch_nullifier_from_wire(
    const wire::BatchInsertionResultNullifier& w)
{
    world_state::BatchInsertionResult<crypto::merkle_tree::NullifierLeafValue> r;
    r.low_leaf_witness_data =
        vec_from_wire<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>>(
            w.lowLeafWitnessData, nullifier_witness_from_wire);
    r.sorted_leaves.reserve(w.sortedLeaves.size());
    for (const auto& x : w.sortedLeaves) {
        r.sorted_leaves.emplace_back(nullifier_leaf_from_wire(x.leaf), x.index);
    }
    r.subtree_path = fr_vec_from_wire(w.subtreePath);
    return r;
}

inline wire::SequentialInsertionResultPublicData sequential_public_data_to_wire(
    const world_state::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    return { .lowLeafWitnessData = vec_to_wire<wire::PublicDataLeafUpdateWitnessData>(d.low_leaf_witness_data,
                                                                                      public_data_witness_to_wire),
             .insertionWitnessData = vec_to_wire<wire::PublicDataLeafUpdateWitnessData>(d.insertion_witness_data,
                                                                                        public_data_witness_to_wire) };
}

inline world_state::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue>
sequential_public_data_from_wire(const wire::SequentialInsertionResultPublicData& w)
{
    return { .low_leaf_witness_data =
                 vec_from_wire<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>>(
                     w.lowLeafWitnessData, public_data_witness_from_wire),
             .insertion_witness_data =
                 vec_from_wire<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>>(
                     w.insertionWitnessData, public_data_witness_from_wire) };
}

inline wire::SequentialInsertionResultNullifier sequential_nullifier_to_wire(
    const world_state::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue>& d)
{
    return { .lowLeafWitnessData =
                 vec_to_wire<wire::NullifierLeafUpdateWitnessData>(d.low_leaf_witness_data, nullifier_witness_to_wire),
             .insertionWitnessData = vec_to_wire<wire::NullifierLeafUpdateWitnessData>(d.insertion_witness_data,
                                                                                       nullifier_witness_to_wire) };
}

inline world_state::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue> sequential_nullifier_from_wire(
    const wire::SequentialInsertionResultNullifier& w)
{
    return { .low_leaf_witness_data =
                 vec_from_wire<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>>(
                     w.lowLeafWitnessData, nullifier_witness_from_wire),
             .insertion_witness_data =
                 vec_from_wire<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>>(
                     w.insertionWitnessData, nullifier_witness_from_wire) };
}

inline std::vector<wire::TreeStateReference> state_reference_to_wire(const world_state::StateReference& d)
{
    std::vector<wire::TreeStateReference> r;
    r.reserve(d.size());
    for (const auto& [tree_id, tree_ref] : d) {
        r.push_back(
            { .treeId = tree_id_to_wire(tree_id), .root = fr_to_wire(tree_ref.first), .size = tree_ref.second });
    }
    return r;
}

inline world_state::StateReference state_reference_from_wire(const std::vector<wire::TreeStateReference>& w)
{
    world_state::StateReference r;
    r.reserve(w.size());
    for (const auto& entry : w) {
        r.emplace(tree_id_from_wire(entry.treeId),
                  world_state::TreeStateReference{ fr_from_wire(entry.root), entry.size });
    }
    return r;
}

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
