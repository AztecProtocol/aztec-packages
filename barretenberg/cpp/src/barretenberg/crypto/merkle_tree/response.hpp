// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 22d6fc368da0fbe5412f4f7b2890a052aa48d803 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <vector>

// The async tree engine (content-addressed trees + world_state) that produced the full set of
// merkle response/callback types now lives in the wsdb native package; barretenberg keeps only the
// types the AVM's LowLevelMerkleDBInterface returns and the ones its hints serialize.
namespace bb::crypto::merkle_tree {

template <typename LeafType> struct LeafUpdateWitnessData {
    IndexedLeaf<LeafType> leaf;
    index_t index;
    fr_sibling_path path;

    LeafUpdateWitnessData(const IndexedLeaf<LeafType>& l, const index_t& i, fr_sibling_path p)
        : leaf(l)
        , index(i)
        , path(std::move(p))
    {}
    LeafUpdateWitnessData() = default;
    ~LeafUpdateWitnessData() = default;
    LeafUpdateWitnessData(const LeafUpdateWitnessData& other) = default;
    LeafUpdateWitnessData(LeafUpdateWitnessData&& other) noexcept = default;
    LeafUpdateWitnessData& operator=(const LeafUpdateWitnessData& other) = default;
    LeafUpdateWitnessData& operator=(LeafUpdateWitnessData&& other) noexcept = default;
    bool operator==(const LeafUpdateWitnessData& other) const = default;

    // Serialized as part of the AVM's SequentialInsertHint (see vm2/common/avm_io.hpp).
    SERIALIZATION_FIELDS(leaf, index, path);
};

template <typename LeafValueType> struct BatchInsertionResult {
    std::vector<LeafUpdateWitnessData<LeafValueType>> low_leaf_witness_data;
    std::vector<std::pair<LeafValueType, index_t>> sorted_leaves;
    fr_sibling_path subtree_path;
};

template <typename LeafValueType> struct SequentialInsertionResult {
    std::vector<LeafUpdateWitnessData<LeafValueType>> low_leaf_witness_data;
    std::vector<LeafUpdateWitnessData<LeafValueType>> insertion_witness_data;
};

struct GetLowIndexedLeafResponse {
    bool is_already_present;
    index_t index;

    GetLowIndexedLeafResponse(bool p, const index_t& i)
        : is_already_present(p)
        , index(i)
    {}
    GetLowIndexedLeafResponse() = default;
    ~GetLowIndexedLeafResponse() = default;
    GetLowIndexedLeafResponse(const GetLowIndexedLeafResponse& other) = default;
    GetLowIndexedLeafResponse(GetLowIndexedLeafResponse&& other) noexcept = default;
    GetLowIndexedLeafResponse& operator=(const GetLowIndexedLeafResponse& other) = default;
    GetLowIndexedLeafResponse& operator=(GetLowIndexedLeafResponse&& other) noexcept = default;

    bool operator==(const GetLowIndexedLeafResponse& other) const
    {
        return is_already_present == other.is_already_present && index == other.index;
    }
};

} // namespace bb::crypto::merkle_tree
