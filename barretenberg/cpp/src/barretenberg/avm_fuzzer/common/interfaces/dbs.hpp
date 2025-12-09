#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include <memory>
#include <stack>

namespace bb::avm2::fuzzer {

// FIXME(ilyas): This is now unused for the fuzzer, but I have a plan to experiment with this later.
class FuzzerLowLevelDB : public bb::avm2::simulation::LowLevelMerkleDBInterface {
  public:
    TreeSnapshots get_tree_roots() const override;

    simulation::SiblingPath get_sibling_path(simulation::MerkleTreeId tree_id, index_t leaf_index) const override;

    GetLowIndexedLeafResponse get_low_indexed_leaf(simulation::MerkleTreeId tree_id, const FF& value) const override;

    FF get_leaf_value(simulation::MerkleTreeId tree_id, index_t leaf_index) const override;

    simulation::IndexedLeaf<PublicDataLeafValue> get_leaf_preimage_public_data_tree(index_t leaf_index) const override;

    simulation::IndexedLeaf<NullifierLeafValue> get_leaf_preimage_nullifier_tree(index_t leaf_index) const override;

    simulation::SequentialInsertionResult<PublicDataLeafValue> insert_indexed_leaves_public_data_tree(
        const PublicDataLeafValue& leaf_value) override;

    simulation::SequentialInsertionResult<NullifierLeafValue> insert_indexed_leaves_nullifier_tree(
        const NullifierLeafValue& leaf_value) override;

    std::vector<simulation::AppendLeafResult> append_leaves(simulation::MerkleTreeId tree_id,
                                                            std::span<const FF> leaves) override;

    void pad_tree(simulation::MerkleTreeId tree_id, size_t num_leaves) override;
    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;
    uint32_t get_checkpoint_id() const override;

    // Some helper functions for the fuzzer to use
    void insert_contract_address(const AztecAddress& contract_address);

  private:
    std::pair<FF, index_t> get_indexed_low_leaf_helper(const std::vector<std::pair<FF, index_t>>& value_sorted_leaves,
                                                       const FF& value) const;

    // Stored leaves sorted by value/slots for low-indexed leaf retrieval
    std::vector<std::pair<FF, index_t>> nullifier_values{ { 0, 0 } };
    std::vector<std::pair<FF, index_t>> public_data_slots{ { 0, 0 } };
    // Stored leaves with their indices
    std::unordered_map<index_t, NullifierLeafValue> nullifier_leaves{ { 0, NullifierLeafValue(0) } };
    std::unordered_map<index_t, PublicDataLeafValue> public_data_leaves{ { 0, PublicDataLeafValue(0, 0) } };
    std::vector<FF> note_hash_leaves;

    // Indices
    uint64_t next_available_nullifier_index = 1;
    uint64_t next_available_public_data_index = 1;
    uint64_t next_available_note_hash_index = 0;
};

class FuzzerContractDB : public simulation::ContractDBInterface {
  public:
    FuzzerContractDB(const std::vector<uint8_t>& bytecode)
        : bytecode(bytecode)
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

  private:
    std::vector<uint8_t> bytecode;
};

// Set up and manage a world state for the fuzzer, the plan is to use this to set up different world states
// This is a bit of hack since we need to access the world state in both cpp and ts. Normally, ws is instantiated
// inside ts and we use napi to access it from cpp, but for the fuzzer we want to instantiate it in cpp and access it
// from ts. The simplest way is to use the same database files from both cpp and ts, this is fine for now since we know
// only one thing will be writing to it at a time.
// FIXME(ilyas): This won't work with multiple concurrent fuzzing processes, but that's ok for now.
class FuzzerWorldStateManager {
  public:
    // Shared constants for C++ and TypeScript to use the same database
    // Note: TypeScript expects trees in {DATA_DIR}/world_state/, so we include that subdirectory
    static constexpr const char* DATA_DIR = "/tmp/avm_fuzzer_ws/world_state";
    static constexpr uint64_t MAP_SIZE_KB = 10240; // 10 MB

    // Static instance management (similar to JsSimulator pattern)
    static void initialize()
    {
        if (instance == nullptr) {
            instance = new FuzzerWorldStateManager();
            instance->initialize_world_state();
        }
    }

    static FuzzerWorldStateManager* getInstance()
    {
        if (instance == nullptr) {
            throw std::runtime_error("FuzzerWorldStateManager not initialized. Call initialize() first.");
        }
        return instance;
    }

    void reset_world_state();
    void register_contract_address(const AztecAddress& contract_address);

    world_state::WorldStateRevision get_current_revision() const;
    world_state::WorldStateRevision fork();
    world_state::WorldState& get_world_state() { return *ws; }

    void checkpoint() { ws->checkpoint(fork_ids.top()); }

    void commit() { ws->commit_checkpoint(fork_ids.top()); }

    void revert() { ws->revert_checkpoint(fork_ids.top()); }

    static const char* get_data_dir() { return DATA_DIR; }

    static uint64_t get_map_size_kb() { return MAP_SIZE_KB; }

  private:
    static FuzzerWorldStateManager* instance;

    void initialize_world_state();

    std::unique_ptr<world_state::WorldState> ws;
    std::stack<uint64_t> fork_ids;
};

} // namespace bb::avm2::fuzzer
