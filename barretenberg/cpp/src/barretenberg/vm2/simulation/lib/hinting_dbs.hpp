#pragma once

#include <span>
#include <stack>
#include <tuple>

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
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

    std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const override;
    std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const override;
    std::optional<FF> get_bytecode_commitment(const ContractClassId& class_id) const override;
    std::optional<std::string> get_debug_function_name(const AztecAddress& address,
                                                       const FunctionSelector& selector) const override;

    void add_contracts(const ContractDeploymentData& contract_deployment_data) override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

    void dump_hints(ExecutionHints& hints);

  private:
    ContractDBInterface& db;
    uint32_t checkpoint_action_counter = 0;
    // Mirrors current ts checkpoint stack logic:
    uint32_t next_checkpoint_id = 1;
    std::stack<uint32_t> checkpoint_stack{ { 0 } };
    uint32_t get_checkpoint_id() const;

    mutable MappedContractHints contract_hints;
};

class HintingRawDB final : public LowLevelMerkleDBInterface {
  public:
    HintingRawDB(LowLevelMerkleDBInterface& db)
        : db(db)
    {}

    TreeSnapshots get_tree_roots() const override { return db.get_tree_roots(); }

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
    uint32_t get_checkpoint_id() const override { return db.get_checkpoint_id(); }

    void dump_hints(ExecutionHints& hints);

  private:
    LowLevelMerkleDBInterface& db;
    uint32_t checkpoint_action_counter = 0;

    mutable MappedMerkleHints merkle_hints;

    // Private helper methods.
    AppendOnlyTreeSnapshot get_tree_info(MerkleTreeId tree_id) const;
    AppendOnlyTreeSnapshot appendLeafInternal(const AppendOnlyTreeSnapshot& state_before,
                                              const SiblingPath& path,
                                              const FF& root_after,
                                              MerkleTreeId tree_id,
                                              const FF& leaf);
};

} // namespace bb::avm2::simulation
