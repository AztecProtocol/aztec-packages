#pragma once
/**
 * @file wsdb_wire_convert.hpp
 * @brief Client-side wire <-> domain conversion helpers for the aztec-wsdb service.
 *
 * These converters depend only on the generic merkle-tree vocabulary
 * (crypto/merkle_tree) plus the generated wsdb wire types, so they can be
 * compiled into bb's wsdb client (consumed by the AVM simulator) without
 * pulling in world_state or the persistent merkle storage. The server-side
 * converters that touch world_state aggregates (state references, DB stats,
 * tree/world-state meta) live alongside the server in native-packages/wsdb.
 */
#include "barretenberg/crypto/merkle_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/vm2_wsdb/generated/wsdb_types.hpp"
#include "barretenberg/world_state_reference/merkle_tree_id.hpp"

namespace bb::wsdb {

inline wire::Fr fr_to_wire(const bb::fr& d)
{
    wire::Fr r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr fr_from_wire(const wire::Fr& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline wire::BlockHeaderHash block_header_hash_to_wire(const bb::fr& d)
{
    wire::BlockHeaderHash r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr block_header_hash_from_wire(const wire::BlockHeaderHash& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline wire::PublicDataSlot public_data_slot_to_wire(const bb::fr& d)
{
    wire::PublicDataSlot r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr public_data_slot_from_wire(const wire::PublicDataSlot& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline wire::PublicDataValue public_data_value_to_wire(const bb::fr& d)
{
    wire::PublicDataValue r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr public_data_value_from_wire(const wire::PublicDataValue& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline wire::Nullifier nullifier_to_wire(const bb::fr& d)
{
    wire::Nullifier r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr nullifier_from_wire(const wire::Nullifier& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline std::vector<wire::Fr> fr_vec_to_wire(const std::vector<bb::fr>& d)
{
    std::vector<wire::Fr> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(fr_to_wire(x));
    }
    return r;
}

inline std::vector<bb::fr> fr_vec_from_wire(const std::vector<wire::Fr>& w)
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

inline wire::MerkleTreeId tree_id_to_wire(world_state::MerkleTreeId d)
{
    return static_cast<wire::MerkleTreeId>(d);
}

inline world_state::MerkleTreeId tree_id_from_wire(wire::MerkleTreeId w)
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
    const crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue>& d)
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

inline crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue> batch_public_data_from_wire(
    const wire::BatchInsertionResultPublicData& w)
{
    crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue> r;
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
    const crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::NullifierLeafValue>& d)
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

inline crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::NullifierLeafValue> batch_nullifier_from_wire(
    const wire::BatchInsertionResultNullifier& w)
{
    crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::NullifierLeafValue> r;
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
    const crypto::merkle_tree::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    return { .lowLeafWitnessData = vec_to_wire<wire::PublicDataLeafUpdateWitnessData>(d.low_leaf_witness_data,
                                                                                      public_data_witness_to_wire),
             .insertionWitnessData = vec_to_wire<wire::PublicDataLeafUpdateWitnessData>(d.insertion_witness_data,
                                                                                        public_data_witness_to_wire) };
}

inline crypto::merkle_tree::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue>
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
    const crypto::merkle_tree::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue>& d)
{
    return { .lowLeafWitnessData =
                 vec_to_wire<wire::NullifierLeafUpdateWitnessData>(d.low_leaf_witness_data, nullifier_witness_to_wire),
             .insertionWitnessData = vec_to_wire<wire::NullifierLeafUpdateWitnessData>(d.insertion_witness_data,
                                                                                       nullifier_witness_to_wire) };
}

inline crypto::merkle_tree::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue>
sequential_nullifier_from_wire(const wire::SequentialInsertionResultNullifier& w)
{
    return { .low_leaf_witness_data =
                 vec_from_wire<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>>(
                     w.lowLeafWitnessData, nullifier_witness_from_wire),
             .insertion_witness_data =
                 vec_from_wire<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>>(
                     w.insertionWitnessData, nullifier_witness_from_wire) };
}

} // namespace bb::wsdb
