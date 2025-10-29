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
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"

namespace bb::avm2::simulation {

class HintingContractsDB final : public ContractDBInterface {
  public:
    HintingContractsDB(ContractDBInterface& db)
        : db(db)
    {}

    std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) override;
    std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) override;

    // TODO(MW): Can rework for just contract hints
    void dump_hints(ExecutionHints& hints);

  private:
    ContractDBInterface& db;

    unordered_flat_map<AztecAddress, ContractInstanceHint> contract_instances;
    unordered_flat_map<ContractClassId, ContractClassHint> contract_classes;
    // TODO(MW): below required? Exists in HintedRawContractDB and used for dumping hints.
    unordered_flat_map<ContractClassId, BytecodeCommitmentHint> bytecode_commitments;
};

class HintingRawDB final : public LowLevelMerkleDBInterface {
  public:
    HintingRawDB(LowLevelMerkleDBInterface& db)
        : db(db)
    {}

    TreeSnapshots get_tree_roots() const override { return db.get_tree_roots(); }

    // Query methods.
    SiblingPath get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) override;
    GetLowIndexedLeafResponse get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) override;
    FF get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) override;
    IndexedLeaf<PublicDataLeafValue> get_leaf_preimage_public_data_tree(index_t leaf_index) override;
    IndexedLeaf<NullifierLeafValue> get_leaf_preimage_nullifier_tree(index_t leaf_index) override;

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
    uint32_t get_checkpoint_id() const override { return db.get_checkpoint_id(); }

    // TODO(MW): Can rework - simply dumps all hints into input ref for now
    void dump_hints(ExecutionHints& hints);

  private:
    LowLevelMerkleDBInterface& db;
    uint32_t checkpoint_action_counter = 0;

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

    // Private helper methods. TODO(MW): extract out? Copied from raw_data_dbs
    const AppendOnlyTreeSnapshot& get_tree_info(MerkleTreeId tree_id) const;
    AppendOnlyTreeSnapshot appendLeafInternal(AppendOnlyTreeSnapshot state_before,
                                              const FF& root_after,
                                              MerkleTreeId tree_id,
                                              const FF& leaf);
};

} // namespace bb::avm2::simulation
