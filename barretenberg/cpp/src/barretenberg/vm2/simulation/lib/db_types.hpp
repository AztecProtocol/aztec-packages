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
using GetContractInstanceKey = std::tuple<uint32_t, AztecAddress>;
using GetContractClassKey = std::tuple<uint32_t, ContractClassId>;
using GetBytecodeCommitmentKey = std::tuple<uint32_t, ContractClassId>;
using GetDebugFunctionNameKey = std::tuple<AztecAddress, FunctionSelector>;

// TODO(MW): Temp struct for hints to allow using a ref in the HintingContractsDB class constructor
struct MappedContractHints {
    unordered_flat_map<GetContractInstanceKey, ContractInstanceHint> contract_instances;
    unordered_flat_map<GetContractClassKey, ContractClassHint> contract_classes;
    unordered_flat_map<GetBytecodeCommitmentKey, BytecodeCommitmentHint> bytecode_commitments;
    unordered_flat_map<GetDebugFunctionNameKey, DebugFunctionNameHint> debug_function_names;
    unordered_flat_map</*action_counter*/ uint32_t, ContractDBCreateCheckpointHint> create_checkpoint_hints;
    unordered_flat_map</*action_counter*/ uint32_t, ContractDBCommitCheckpointHint> commit_checkpoint_hints;
    unordered_flat_map</*action_counter*/ uint32_t, ContractDBRevertCheckpointHint> revert_checkpoint_hints;
};

// TODO(MW): Temp struct for hints to allow using a ref in the HintingRawDB class constructor
struct MappedMerkleHints {
    // Query hints:
    unordered_flat_map<GetSiblingPathKey, GetSiblingPathHint> get_sibling_path_hints;
    unordered_flat_map<GetPreviousValueIndexKey, GetPreviousValueIndexHint> get_previous_value_index_hints;
    unordered_flat_map<GetLeafPreimageKey, GetLeafPreimageHint<PublicDataTreeLeafPreimage>>
        get_leaf_preimage_hints_public_data_tree;
    unordered_flat_map<GetLeafPreimageKey, GetLeafPreimageHint<NullifierTreeLeafPreimage>>
        get_leaf_preimage_hints_nullifier_tree;
    unordered_flat_map<GetLeafValueKey, GetLeafValueHint> get_leaf_value_hints;
    // State modification hints:
    unordered_flat_map<SequentialInsertHintPublicDataTreeKey, SequentialInsertHint<PublicDataLeafValue>>
        sequential_insert_hints_public_data_tree;
    unordered_flat_map<SequentialInsertHintNullifierTreeKey, SequentialInsertHint<NullifierLeafValue>>
        sequential_insert_hints_nullifier_tree;
    unordered_flat_map<AppendLeavesHintKey, AppendLeavesHint> append_leaves_hints;
    unordered_flat_map</*action_counter*/ uint32_t, CreateCheckpointHint> create_checkpoint_hints;
    unordered_flat_map</*action_counter*/ uint32_t, CommitCheckpointHint> commit_checkpoint_hints;
    unordered_flat_map</*action_counter*/ uint32_t, RevertCheckpointHint> revert_checkpoint_hints;
};

struct TreeCounters {
    uint32_t note_hash_counter;
    uint32_t nullifier_counter;
    uint32_t l2_to_l1_msg_counter;
    // public data tree counter is tracked via the written public data slots tree

    bool operator==(const TreeCounters& other) const = default;
};

} // namespace bb::avm2::simulation

// We need this helper to avoid having const and non-const versions methods in db classes.
auto& get_tree_info_helper(world_state::MerkleTreeId tree_id, auto& tree_roots)
{
    switch (tree_id) {
    case world_state::MerkleTreeId::NULLIFIER_TREE:
        return tree_roots.nullifierTree;
    case world_state::MerkleTreeId::PUBLIC_DATA_TREE:
        return tree_roots.publicDataTree;
    case world_state::MerkleTreeId::NOTE_HASH_TREE:
        return tree_roots.noteHashTree;
    case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return tree_roots.l1ToL2MessageTree;
    default:
        throw std::runtime_error("AVM cannot process tree id: " + std::to_string(static_cast<uint64_t>(tree_id)));
    }
}

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
