#pragma once

#include <span>
#include <stack>
#include <tuple>

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"

namespace bb::avm2::simulation {

// This class interacts with the external world, without emiting any simulation events.
// It is used for a given TX and its hinting structure assumes that the content cannot
// change during the TX.
class HintedRawContractDB final : public ContractDBInterface {
  public:
    HintedRawContractDB(const ExecutionHints& hints);

    std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const override;
    std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const override;

  private:
    FF get_bytecode_commitment(const ContractClassId& class_id) const;

    unordered_flat_map<AztecAddress, ContractInstanceHint> contract_instances;
    unordered_flat_map<ContractClassId, ContractClassHint> contract_classes;
    unordered_flat_map<ContractClassId, FF> bytecode_commitments;
};

// This class interacts with the external world, without emiting any simulation events.
class HintedRawMerkleDB final : public LowLevelMerkleDBInterface {
  public:
    HintedRawMerkleDB(const ExecutionHints& hints);

    const TreeSnapshots& get_tree_roots() const override { return tree_roots; }

    // Query methods.
    SiblingPath get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) const override;
    GetLowIndexedLeafResponse get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const override;
    FF get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const override;
    IndexedLeaf<PublicDataLeafValue> get_leaf_preimage_public_data_tree(index_t leaf_index) const override;
    IndexedLeaf<NullifierLeafValue> get_leaf_preimage_nullifier_tree(index_t leaf_index) const override;

    // State modification methods.
    SequentialInsertionResult<PublicDataLeafValue> insert_indexed_leaves_public_data_tree(
        const PublicDataLeafValue& leaf_value) override;
    SequentialInsertionResult<NullifierLeafValue> insert_indexed_leaves_nullifier_tree(
        const NullifierLeafValue& leaf_value) override;
    std::vector<AppendLeafResult> append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves) override;
    void pad_tree(MerkleTreeId tree_id, size_t num_leaves) override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

  private:
    TreeSnapshots tree_roots;
    uint32_t checkpoint_action_counter = 0;
    // We start with a checkpoint id of 0, which is the assumed initial state checkpoint.
    // This stack is for debugging purposes only.
    std::stack<uint32_t> checkpoint_stack{ { 0 } };

    // Query hints.
    using GetSiblingPathKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, index_t>;
    unordered_flat_map<GetSiblingPathKey, SiblingPath> get_sibling_path_hints;
    using GetPreviousValueIndexKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, FF>;
    unordered_flat_map<GetPreviousValueIndexKey, GetLowIndexedLeafResponse> get_previous_value_index_hints;
    using GetLeafPreimageKey = std::tuple<AppendOnlyTreeSnapshot, index_t>;
    unordered_flat_map<GetLeafPreimageKey, IndexedLeaf<PublicDataLeafValue>> get_leaf_preimage_hints_public_data_tree;
    unordered_flat_map<GetLeafPreimageKey, IndexedLeaf<NullifierLeafValue>> get_leaf_preimage_hints_nullifier_tree;
    using GetLeafValueKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, index_t>;
    unordered_flat_map<GetLeafValueKey, FF> get_leaf_value_hints;
    // State modification hints.
    using SequentialInsertHintPublicDataTreeKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, PublicDataLeafValue>;
    unordered_flat_map<SequentialInsertHintPublicDataTreeKey, SequentialInsertHint<PublicDataLeafValue>>
        sequential_insert_hints_public_data_tree;
    using SequentialInsertHintNullifierTreeKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, NullifierLeafValue>;
    unordered_flat_map<SequentialInsertHintNullifierTreeKey, SequentialInsertHint<NullifierLeafValue>>
        sequential_insert_hints_nullifier_tree;
    using AppendLeavesHintKey = std::tuple<AppendOnlyTreeSnapshot, MerkleTreeId, std::vector<FF>>;
    unordered_flat_map<AppendLeavesHintKey, AppendOnlyTreeSnapshot> append_leaves_hints;
    unordered_flat_map</*action_counter*/ uint32_t, CreateCheckpointHint> create_checkpoint_hints;
    unordered_flat_map</*action_counter*/ uint32_t, CommitCheckpointHint> commit_checkpoint_hints;
    unordered_flat_map</*action_counter*/ uint32_t, RevertCheckpointHint> revert_checkpoint_hints;

    // Private helper methods.
    const AppendOnlyTreeSnapshot& get_tree_info(MerkleTreeId tree_id) const;
    AppendOnlyTreeSnapshot& get_tree_info(MerkleTreeId tree_id);
    AppendLeafResult appendLeafInternal(MerkleTreeId tree_id, const FF& leaf);
};

} // namespace bb::avm2::simulation

// Specialization of std::hash for std::vector<FF> to be used as a key in unordered_flat_map.
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
