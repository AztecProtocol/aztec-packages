#pragma once
/**
 * @file wsdb_wire_convert_client.hpp
 * @brief Client-side wire <-> domain conversion helpers for the aztec-wsdb service.
 *
 * Field elements need no helpers: FieldElement converts implicitly to and from every
 * bin32 wire alias. What remains here are the shape conversions between the generated
 * wire structs and the merkle-tree domain templates (indexed leaves, witness data,
 * insertion results). The server-side converters that touch world_state aggregates
 * (state references, DB stats, tree/world-state meta) live in wsdb_wire_convert.hpp.
 */
#include "field/field_element.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "merkle_tree/merkle_tree_id.hpp"
#include "merkle_tree/response.hpp"
#include "merkle_tree/types.hpp"
#include "wsdb/generated/wsdb_types.hpp"

namespace azteclabs::wsdb {

template <typename To, typename From, typename Fn> inline std::vector<To> convert_vec(const std::vector<From>& v, Fn fn)
{
    std::vector<To> r;
    r.reserve(v.size());
    for (const auto& x : v) {
        r.push_back(fn(x));
    }
    return r;
}

/// Element-wise conversion for types that convert implicitly (e.g. fr <-> wire::Fr).
template <typename To, typename From> inline std::vector<To> convert_vec(const std::vector<From>& v)
{
    return convert_vec<To>(v, [](const From& x) { return To(x); });
}

inline wire::WorldStateRevision revision_to_wire(const merkle_tree::WorldStateRevision& d)
{
    return wire::WorldStateRevision{
        .forkId = d.forkId,
        .blockNumber = d.blockNumber,
        .includeUncommitted = d.includeUncommitted,
    };
}

inline merkle_tree::WorldStateRevision revision_from_wire(const wire::WorldStateRevision& w)
{
    return merkle_tree::WorldStateRevision{
        .forkId = w.forkId,
        .blockNumber = w.blockNumber,
        .includeUncommitted = w.includeUncommitted,
    };
}

inline wire::MerkleTreeId tree_id_to_wire(merkle_tree::MerkleTreeId d)
{
    return static_cast<wire::MerkleTreeId>(d);
}

inline merkle_tree::MerkleTreeId tree_id_from_wire(wire::MerkleTreeId w)
{
    return static_cast<merkle_tree::MerkleTreeId>(w);
}

inline wire::PublicDataLeafValue public_data_leaf_to_wire(const merkle_tree::PublicDataLeafValue& d)
{
    return { .slot = d.slot, .value = d.value };
}

inline merkle_tree::PublicDataLeafValue public_data_leaf_from_wire(const wire::PublicDataLeafValue& w)
{
    return { w.slot, w.value };
}

inline wire::NullifierLeafValue nullifier_leaf_to_wire(const merkle_tree::NullifierLeafValue& d)
{
    return { .nullifier = d.nullifier };
}

inline merkle_tree::NullifierLeafValue nullifier_leaf_from_wire(const wire::NullifierLeafValue& w)
{
    return { w.nullifier };
}

inline std::vector<wire::PublicDataLeafValue> public_data_leaf_vec_to_wire(
    const std::vector<merkle_tree::PublicDataLeafValue>& d)
{
    return convert_vec<wire::PublicDataLeafValue>(d, public_data_leaf_to_wire);
}

inline std::vector<merkle_tree::PublicDataLeafValue> public_data_leaf_vec_from_wire(
    const std::vector<wire::PublicDataLeafValue>& w)
{
    return convert_vec<merkle_tree::PublicDataLeafValue>(w, public_data_leaf_from_wire);
}

inline std::vector<wire::NullifierLeafValue> nullifier_leaf_vec_to_wire(
    const std::vector<merkle_tree::NullifierLeafValue>& d)
{
    return convert_vec<wire::NullifierLeafValue>(d, nullifier_leaf_to_wire);
}

inline std::vector<merkle_tree::NullifierLeafValue> nullifier_leaf_vec_from_wire(
    const std::vector<wire::NullifierLeafValue>& w)
{
    return convert_vec<merkle_tree::NullifierLeafValue>(w, nullifier_leaf_from_wire);
}

inline wire::IndexedPublicDataLeafValue indexed_public_data_leaf_to_wire(
    const merkle_tree::IndexedLeaf<merkle_tree::PublicDataLeafValue>& d)
{
    return { .leaf = public_data_leaf_to_wire(d.leaf), .nextIndex = d.nextIndex, .nextKey = d.nextKey };
}

inline merkle_tree::IndexedLeaf<merkle_tree::PublicDataLeafValue> indexed_public_data_leaf_from_wire(
    const wire::IndexedPublicDataLeafValue& w)
{
    return { public_data_leaf_from_wire(w.leaf), w.nextIndex, w.nextKey };
}

inline wire::IndexedNullifierLeafValue indexed_nullifier_leaf_to_wire(
    const merkle_tree::IndexedLeaf<merkle_tree::NullifierLeafValue>& d)
{
    return { .leaf = nullifier_leaf_to_wire(d.leaf), .nextIndex = d.nextIndex, .nextKey = d.nextKey };
}

inline merkle_tree::IndexedLeaf<merkle_tree::NullifierLeafValue> indexed_nullifier_leaf_from_wire(
    const wire::IndexedNullifierLeafValue& w)
{
    return { nullifier_leaf_from_wire(w.leaf), w.nextIndex, w.nextKey };
}

inline wire::PublicDataLeafUpdateWitnessData public_data_witness_to_wire(
    const merkle_tree::LeafUpdateWitnessData<merkle_tree::PublicDataLeafValue>& d)
{
    return { .leaf = indexed_public_data_leaf_to_wire(d.leaf),
             .index = d.index,
             .path = convert_vec<wire::Fr>(d.path) };
}

inline merkle_tree::LeafUpdateWitnessData<merkle_tree::PublicDataLeafValue> public_data_witness_from_wire(
    const wire::PublicDataLeafUpdateWitnessData& w)
{
    return { indexed_public_data_leaf_from_wire(w.leaf), w.index, convert_vec<fr>(w.path) };
}

inline wire::NullifierLeafUpdateWitnessData nullifier_witness_to_wire(
    const merkle_tree::LeafUpdateWitnessData<merkle_tree::NullifierLeafValue>& d)
{
    return { .leaf = indexed_nullifier_leaf_to_wire(d.leaf), .index = d.index, .path = convert_vec<wire::Fr>(d.path) };
}

inline merkle_tree::LeafUpdateWitnessData<merkle_tree::NullifierLeafValue> nullifier_witness_from_wire(
    const wire::NullifierLeafUpdateWitnessData& w)
{
    return { indexed_nullifier_leaf_from_wire(w.leaf), w.index, convert_vec<fr>(w.path) };
}

inline wire::BatchInsertionResultPublicData batch_public_data_to_wire(
    const merkle_tree::BatchInsertionResult<merkle_tree::PublicDataLeafValue>& d)
{
    std::vector<wire::SortedPublicDataLeaf> sorted;
    sorted.reserve(d.sorted_leaves.size());
    for (const auto& [leaf, index] : d.sorted_leaves) {
        sorted.push_back({ .leaf = public_data_leaf_to_wire(leaf), .index = index });
    }
    return { .lowLeafWitnessData = convert_vec<wire::PublicDataLeafUpdateWitnessData>(d.low_leaf_witness_data,
                                                                                      public_data_witness_to_wire),
             .sortedLeaves = std::move(sorted),
             .subtreePath = convert_vec<wire::Fr>(d.subtree_path) };
}

inline merkle_tree::BatchInsertionResult<merkle_tree::PublicDataLeafValue> batch_public_data_from_wire(
    const wire::BatchInsertionResultPublicData& w)
{
    merkle_tree::BatchInsertionResult<merkle_tree::PublicDataLeafValue> r;
    r.low_leaf_witness_data = convert_vec<merkle_tree::LeafUpdateWitnessData<merkle_tree::PublicDataLeafValue>>(
        w.lowLeafWitnessData, public_data_witness_from_wire);
    r.sorted_leaves.reserve(w.sortedLeaves.size());
    for (const auto& x : w.sortedLeaves) {
        r.sorted_leaves.emplace_back(public_data_leaf_from_wire(x.leaf), x.index);
    }
    r.subtree_path = convert_vec<fr>(w.subtreePath);
    return r;
}

inline wire::BatchInsertionResultNullifier batch_nullifier_to_wire(
    const merkle_tree::BatchInsertionResult<merkle_tree::NullifierLeafValue>& d)
{
    std::vector<wire::SortedNullifierLeaf> sorted;
    sorted.reserve(d.sorted_leaves.size());
    for (const auto& [leaf, index] : d.sorted_leaves) {
        sorted.push_back({ .leaf = nullifier_leaf_to_wire(leaf), .index = index });
    }
    return { .lowLeafWitnessData =
                 convert_vec<wire::NullifierLeafUpdateWitnessData>(d.low_leaf_witness_data, nullifier_witness_to_wire),
             .sortedLeaves = std::move(sorted),
             .subtreePath = convert_vec<wire::Fr>(d.subtree_path) };
}

inline merkle_tree::BatchInsertionResult<merkle_tree::NullifierLeafValue> batch_nullifier_from_wire(
    const wire::BatchInsertionResultNullifier& w)
{
    merkle_tree::BatchInsertionResult<merkle_tree::NullifierLeafValue> r;
    r.low_leaf_witness_data = convert_vec<merkle_tree::LeafUpdateWitnessData<merkle_tree::NullifierLeafValue>>(
        w.lowLeafWitnessData, nullifier_witness_from_wire);
    r.sorted_leaves.reserve(w.sortedLeaves.size());
    for (const auto& x : w.sortedLeaves) {
        r.sorted_leaves.emplace_back(nullifier_leaf_from_wire(x.leaf), x.index);
    }
    r.subtree_path = convert_vec<fr>(w.subtreePath);
    return r;
}

inline wire::SequentialInsertionResultPublicData sequential_public_data_to_wire(
    const merkle_tree::SequentialInsertionResult<merkle_tree::PublicDataLeafValue>& d)
{
    return { .lowLeafWitnessData = convert_vec<wire::PublicDataLeafUpdateWitnessData>(d.low_leaf_witness_data,
                                                                                      public_data_witness_to_wire),
             .insertionWitnessData = convert_vec<wire::PublicDataLeafUpdateWitnessData>(d.insertion_witness_data,
                                                                                        public_data_witness_to_wire) };
}

inline merkle_tree::SequentialInsertionResult<merkle_tree::PublicDataLeafValue> sequential_public_data_from_wire(
    const wire::SequentialInsertionResultPublicData& w)
{
    return { .low_leaf_witness_data = convert_vec<merkle_tree::LeafUpdateWitnessData<merkle_tree::PublicDataLeafValue>>(
                 w.lowLeafWitnessData, public_data_witness_from_wire),
             .insertion_witness_data =
                 convert_vec<merkle_tree::LeafUpdateWitnessData<merkle_tree::PublicDataLeafValue>>(
                     w.insertionWitnessData, public_data_witness_from_wire) };
}

inline wire::SequentialInsertionResultNullifier sequential_nullifier_to_wire(
    const merkle_tree::SequentialInsertionResult<merkle_tree::NullifierLeafValue>& d)
{
    return { .lowLeafWitnessData =
                 convert_vec<wire::NullifierLeafUpdateWitnessData>(d.low_leaf_witness_data, nullifier_witness_to_wire),
             .insertionWitnessData = convert_vec<wire::NullifierLeafUpdateWitnessData>(d.insertion_witness_data,
                                                                                       nullifier_witness_to_wire) };
}

inline merkle_tree::SequentialInsertionResult<merkle_tree::NullifierLeafValue> sequential_nullifier_from_wire(
    const wire::SequentialInsertionResultNullifier& w)
{
    return { .low_leaf_witness_data = convert_vec<merkle_tree::LeafUpdateWitnessData<merkle_tree::NullifierLeafValue>>(
                 w.lowLeafWitnessData, nullifier_witness_from_wire),
             .insertion_witness_data = convert_vec<merkle_tree::LeafUpdateWitnessData<merkle_tree::NullifierLeafValue>>(
                 w.insertionWitnessData, nullifier_witness_from_wire) };
}

} // namespace azteclabs::wsdb
