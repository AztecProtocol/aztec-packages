#pragma once
/**
 * @file wsdb_wire_convert_client.hpp
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

template <typename W>
concept Bin32Wire = requires { typename W::IPC_CODEGEN_BIN32_ALIAS; };

/// Converts a field element to whichever bin32 wire alias the call site expects (`wire::Fr`,
/// `wire::Nullifier`, ...): all of them carry the same 32 canonical bytes under a nominal tag.
struct ToWire {
    const bb::fr& value;
    template <Bin32Wire W> operator W() const
    {
        W r{};
        bb::fr::serialize_to_buffer(value, r.data());
        return r;
    }
};
inline ToWire to_wire(const bb::fr& d)
{
    return { d };
}

template <Bin32Wire W> inline bb::fr from_wire(const W& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

template <typename To, typename From, typename Fn> inline std::vector<To> convert_vec(const std::vector<From>& v, Fn fn)
{
    std::vector<To> r;
    r.reserve(v.size());
    for (const auto& x : v) {
        r.push_back(fn(x));
    }
    return r;
}

template <Bin32Wire W> inline std::vector<W> to_wire(const std::vector<bb::fr>& d)
{
    return convert_vec<W>(d, [](const bb::fr& x) { return W(to_wire(x)); });
}

template <Bin32Wire W> inline std::vector<bb::fr> from_wire(const std::vector<W>& w)
{
    return convert_vec<bb::fr>(w, [](const W& x) { return from_wire(x); });
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
    return { .slot = to_wire(d.slot), .value = to_wire(d.value) };
}

inline crypto::merkle_tree::PublicDataLeafValue public_data_leaf_from_wire(const wire::PublicDataLeafValue& w)
{
    return { from_wire(w.slot), from_wire(w.value) };
}

inline std::vector<wire::PublicDataLeafValue> public_data_leaf_vec_to_wire(
    const std::vector<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    return convert_vec<wire::PublicDataLeafValue>(d, public_data_leaf_to_wire);
}

inline std::vector<crypto::merkle_tree::PublicDataLeafValue> public_data_leaf_vec_from_wire(
    const std::vector<wire::PublicDataLeafValue>& w)
{
    return convert_vec<crypto::merkle_tree::PublicDataLeafValue>(w, public_data_leaf_from_wire);
}

inline wire::NullifierLeafValue nullifier_leaf_to_wire(const crypto::merkle_tree::NullifierLeafValue& d)
{
    return { .nullifier = to_wire(d.nullifier) };
}

inline crypto::merkle_tree::NullifierLeafValue nullifier_leaf_from_wire(const wire::NullifierLeafValue& w)
{
    return { from_wire(w.nullifier) };
}

inline std::vector<wire::NullifierLeafValue> nullifier_leaf_vec_to_wire(
    const std::vector<crypto::merkle_tree::NullifierLeafValue>& d)
{
    return convert_vec<wire::NullifierLeafValue>(d, nullifier_leaf_to_wire);
}

inline std::vector<crypto::merkle_tree::NullifierLeafValue> nullifier_leaf_vec_from_wire(
    const std::vector<wire::NullifierLeafValue>& w)
{
    return convert_vec<crypto::merkle_tree::NullifierLeafValue>(w, nullifier_leaf_from_wire);
}

inline wire::IndexedPublicDataLeafValue indexed_public_data_leaf_to_wire(
    const crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    return { .leaf = public_data_leaf_to_wire(d.leaf), .nextIndex = d.nextIndex, .nextKey = to_wire(d.nextKey) };
}

inline crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue> indexed_public_data_leaf_from_wire(
    const wire::IndexedPublicDataLeafValue& w)
{
    return { public_data_leaf_from_wire(w.leaf), w.nextIndex, from_wire(w.nextKey) };
}

inline wire::IndexedNullifierLeafValue indexed_nullifier_leaf_to_wire(
    const crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>& d)
{
    return { .leaf = nullifier_leaf_to_wire(d.leaf), .nextIndex = d.nextIndex, .nextKey = to_wire(d.nextKey) };
}

inline crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue> indexed_nullifier_leaf_from_wire(
    const wire::IndexedNullifierLeafValue& w)
{
    return { nullifier_leaf_from_wire(w.leaf), w.nextIndex, from_wire(w.nextKey) };
}

inline wire::PublicDataLeafUpdateWitnessData public_data_witness_to_wire(
    const crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    return { .leaf = indexed_public_data_leaf_to_wire(d.leaf), .index = d.index, .path = to_wire<wire::Fr>(d.path) };
}

inline crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>
public_data_witness_from_wire(const wire::PublicDataLeafUpdateWitnessData& w)
{
    return { indexed_public_data_leaf_from_wire(w.leaf), w.index, from_wire(w.path) };
}

inline wire::NullifierLeafUpdateWitnessData nullifier_witness_to_wire(
    const crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>& d)
{
    return { .leaf = indexed_nullifier_leaf_to_wire(d.leaf), .index = d.index, .path = to_wire<wire::Fr>(d.path) };
}

inline crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue> nullifier_witness_from_wire(
    const wire::NullifierLeafUpdateWitnessData& w)
{
    return { indexed_nullifier_leaf_from_wire(w.leaf), w.index, from_wire(w.path) };
}

inline wire::BatchInsertionResultPublicData batch_public_data_to_wire(
    const crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    std::vector<wire::SortedPublicDataLeaf> sorted;
    sorted.reserve(d.sorted_leaves.size());
    for (const auto& [leaf, index] : d.sorted_leaves) {
        sorted.push_back({ .leaf = public_data_leaf_to_wire(leaf), .index = index });
    }
    return { .lowLeafWitnessData = convert_vec<wire::PublicDataLeafUpdateWitnessData>(d.low_leaf_witness_data,
                                                                                      public_data_witness_to_wire),
             .sortedLeaves = std::move(sorted),
             .subtreePath = to_wire<wire::Fr>(d.subtree_path) };
}

inline crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue> batch_public_data_from_wire(
    const wire::BatchInsertionResultPublicData& w)
{
    crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::PublicDataLeafValue> r;
    r.low_leaf_witness_data =
        convert_vec<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>>(
            w.lowLeafWitnessData, public_data_witness_from_wire);
    r.sorted_leaves.reserve(w.sortedLeaves.size());
    for (const auto& x : w.sortedLeaves) {
        r.sorted_leaves.emplace_back(public_data_leaf_from_wire(x.leaf), x.index);
    }
    r.subtree_path = from_wire(w.subtreePath);
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
                 convert_vec<wire::NullifierLeafUpdateWitnessData>(d.low_leaf_witness_data, nullifier_witness_to_wire),
             .sortedLeaves = std::move(sorted),
             .subtreePath = to_wire<wire::Fr>(d.subtree_path) };
}

inline crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::NullifierLeafValue> batch_nullifier_from_wire(
    const wire::BatchInsertionResultNullifier& w)
{
    crypto::merkle_tree::BatchInsertionResult<crypto::merkle_tree::NullifierLeafValue> r;
    r.low_leaf_witness_data =
        convert_vec<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>>(
            w.lowLeafWitnessData, nullifier_witness_from_wire);
    r.sorted_leaves.reserve(w.sortedLeaves.size());
    for (const auto& x : w.sortedLeaves) {
        r.sorted_leaves.emplace_back(nullifier_leaf_from_wire(x.leaf), x.index);
    }
    r.subtree_path = from_wire(w.subtreePath);
    return r;
}

inline wire::SequentialInsertionResultPublicData sequential_public_data_to_wire(
    const crypto::merkle_tree::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue>& d)
{
    return { .lowLeafWitnessData = convert_vec<wire::PublicDataLeafUpdateWitnessData>(d.low_leaf_witness_data,
                                                                                      public_data_witness_to_wire),
             .insertionWitnessData = convert_vec<wire::PublicDataLeafUpdateWitnessData>(d.insertion_witness_data,
                                                                                        public_data_witness_to_wire) };
}

inline crypto::merkle_tree::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue>
sequential_public_data_from_wire(const wire::SequentialInsertionResultPublicData& w)
{
    return { .low_leaf_witness_data =
                 convert_vec<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>>(
                     w.lowLeafWitnessData, public_data_witness_from_wire),
             .insertion_witness_data =
                 convert_vec<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::PublicDataLeafValue>>(
                     w.insertionWitnessData, public_data_witness_from_wire) };
}

inline wire::SequentialInsertionResultNullifier sequential_nullifier_to_wire(
    const crypto::merkle_tree::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue>& d)
{
    return { .lowLeafWitnessData =
                 convert_vec<wire::NullifierLeafUpdateWitnessData>(d.low_leaf_witness_data, nullifier_witness_to_wire),
             .insertionWitnessData = convert_vec<wire::NullifierLeafUpdateWitnessData>(d.insertion_witness_data,
                                                                                       nullifier_witness_to_wire) };
}

inline crypto::merkle_tree::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue>
sequential_nullifier_from_wire(const wire::SequentialInsertionResultNullifier& w)
{
    return { .low_leaf_witness_data =
                 convert_vec<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>>(
                     w.lowLeafWitnessData, nullifier_witness_from_wire),
             .insertion_witness_data =
                 convert_vec<crypto::merkle_tree::LeafUpdateWitnessData<crypto::merkle_tree::NullifierLeafValue>>(
                     w.insertionWitnessData, nullifier_witness_from_wire) };
}

} // namespace bb::wsdb
