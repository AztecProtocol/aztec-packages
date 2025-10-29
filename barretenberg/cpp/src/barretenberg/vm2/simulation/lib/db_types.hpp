#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::avm2::simulation {

using NullifierTreeLeafPreimage = crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>;
using PublicDataTreeLeafPreimage = crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue>;

// Keys for hints stored in unordered_flat_maps, used in raw_data_dbs and hinting_dbs.
using GetSiblingPathKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, index_t>;
using GetPreviousValueIndexKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, FF>;
using GetLeafPreimageKey = std::tuple<AppendOnlyTreeSnapshot, index_t>;
using GetLeafValueKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, index_t>;
using SequentialInsertHintPublicDataTreeKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, PublicDataLeafValue>;
using SequentialInsertHintNullifierTreeKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, NullifierLeafValue>;
using AppendLeavesHintKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, std::vector<FF>>;

// TODO(MW): Temp struct for query hints to allow using a ref in the HintingContractsDB class constructor
struct MappedContractHints {
    unordered_flat_map<AztecAddress, ContractInstanceHint> contract_instances;
    unordered_flat_map<ContractClassId, ContractClassHint> contract_classes;
    unordered_flat_map<ContractClassId, BytecodeCommitmentHint> bytecode_commitments;
};

// TODO(MW): Temp struct for query hints to allow using a ref in the HintingRawDB class constructor
struct MappedQueryHints {
    unordered_flat_map<GetSiblingPathKey, SiblingPath> get_sibling_path_hints;
    unordered_flat_map<GetPreviousValueIndexKey, GetLowIndexedLeafResponse> get_previous_value_index_hints;
    unordered_flat_map<GetLeafPreimageKey, IndexedLeaf<PublicDataLeafValue>> get_leaf_preimage_hints_public_data_tree;
    unordered_flat_map<GetLeafPreimageKey, IndexedLeaf<NullifierLeafValue>> get_leaf_preimage_hints_nullifier_tree;
    unordered_flat_map<GetLeafValueKey, FF> get_leaf_value_hints;
};

struct TreeCounters {
    uint32_t note_hash_counter;
    uint32_t nullifier_counter;
    uint32_t l2_to_l1_msg_counter;
    // public data tree counter is tracked via the written public data slots tree

    bool operator==(const TreeCounters& other) const = default;
};

} // namespace bb::avm2::simulation

// Specialization of std::hash for std::vector<FF> to be used as a key in unordered_flat_map.
// Used in raw_data_dbs and hinting_dbs
namespace std {
template <> struct hash<std::vector<bb::avm2::FF>> {
    size_t operator()(const std::vector<bb::avm2::FF>& vec) const
    {
        size_t seed = vec.size();
        for (const auto& item : vec) {
            seed ^= std::hash<bb::avm2::FF>{}(item) + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        }
        return seed;
    }
};
} // namespace std
