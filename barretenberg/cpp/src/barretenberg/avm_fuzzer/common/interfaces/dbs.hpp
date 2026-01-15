#pragma once

#include <memory>
#include <stack>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"

namespace bb::avm2::fuzzer {

class FuzzerContractDB : public simulation::ContractDBInterface {
  public:
    FuzzerContractDB() = default;

    std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const override;
    std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const override;
    std::optional<FF> get_bytecode_commitment(const ContractClassId& class_id) const override;
    std::optional<std::string> get_debug_function_name(const AztecAddress& address,
                                                       const FunctionSelector& selector) const override;

    void add_contracts(const ContractDeploymentData& contract_deployment_data) override;

    // Direct methods to add contract class and instance
    void add_contract_class(const ContractClassId& class_id, const ContractClass& contract_class);
    void add_contract_instance(const AztecAddress& address, const ContractInstance& contract_instance);

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

    // Getters for serialization
    const std::vector<ContractClass>& get_contract_classes() const { return contract_classes_vector; }
    const std::vector<std::pair<AztecAddress, ContractInstance>>& get_contract_instances() const
    {
        return contract_instances_vector;
    }

  private:
    ContractClass from_logs(const ContractClassLog& log) const;
    ContractInstance from_logs(const PrivateLog& log) const;

    std::unordered_map<ContractClassId, ContractClass> contract_classes;
    std::unordered_map<AztecAddress, ContractInstance> contract_instances;

    // Used for serialization keeping track of the order of the contracts and instances
    std::vector<ContractClass> contract_classes_vector;
    std::vector<std::pair<AztecAddress, ContractInstance>> contract_instances_vector;

    struct Checkpoint {
        std::unordered_map<ContractClassId, ContractClass> contract_classes;
        std::unordered_map<AztecAddress, ContractInstance> contract_instances;
    };
    std::stack<Checkpoint> checkpoints;
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
    void write_fee_payer_balance(const AztecAddress& fee_payer, const FF& balance);
    void public_data_write(const bb::crypto::merkle_tree::PublicDataLeafValue& public_data);
    void append_note_hashes(const std::vector<FF>& note_hashes);

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
