#pragma once

#include <memory>
#include <stack>
#include <string>

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/memory_merkle_db.hpp"

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
    void add_contract_class(const ContractClassId& class_id, const ContractClassWithCommitment& contract_class);
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

// Seeds and manages the genesis state the fuzzer simulates against. The C++ simulator runs against a copy
// of the in-memory MemoryMerkleDB seeded here, so the seed is never mutated by simulation. The genesis
// uses a fixed 128 nullifier/public-data tree prefill so every input starts from the same state, with no
// shared on-disk database. Construct a fresh manager per fuzzer input (or per test) to reset to genesis.
class FuzzerWorldStateManager {
  public:
    FuzzerWorldStateManager();


    void register_contract_address(const AztecAddress& contract_address);
    void write_fee_payer_balance(const AztecAddress& fee_payer, const FF& balance);
    void public_data_write(const bb::crypto::merkle_tree::PublicDataLeafValue& public_data);
    void append_note_hashes(const std::vector<FF>& note_hashes);

    // The in-memory merkle DB holds the genesis state plus every mutation applied for the current
    // transaction. The C++ simulator runs against a copy of this DB so the genesis state is preserved
    // across the fast and hint-collecting simulations.
    const simulation::MemoryMerkleDB& get_memory_merkle_db() const { return *mem_db; }


  private:
    std::unique_ptr<simulation::MemoryMerkleDB> mem_db;
};

} // namespace bb::avm2::fuzzer
