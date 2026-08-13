#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <stack>
#include <string>
#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/memory_merkle_db.hpp"

namespace bb::avm2::testing {

// In-memory contract database for tests. Holds contract classes and instances added through
// pseudo-deployments and serves them to the simulator's raw contract DB interface.
class TestContractDB final : public simulation::ContractDBInterface {
  public:
    std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const override;
    std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const override;
    std::optional<FF> get_bytecode_commitment(const ContractClassId& class_id) const override;
    std::optional<std::string> get_debug_function_name(const AztecAddress& address,
                                                       const FunctionSelector& selector) const override;
    void add_contracts(const ContractDeploymentData& contract_deployment_data) override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

    void add_contract_class(const ContractClassWithCommitment& contract_class);
    void add_contract_instance(const AztecAddress& address, const ContractInstance& instance);

  private:
    std::unordered_map<ContractClassId, ContractClassWithCommitment> contract_classes;
    std::unordered_map<AztecAddress, ContractInstance> contract_instances;

    struct Checkpoint {
        std::unordered_map<ContractClassId, ContractClassWithCommitment> contract_classes;
        std::unordered_map<AztecAddress, ContractInstance> contract_instances;
    };
    std::stack<Checkpoint> checkpoints;
};

// A deployed (custom-bytecode) contract.
struct DeployedContract {
    AztecAddress address;
    ContractClassWithCommitment contract_class;
    ContractInstance instance;
};

// A public call to enqueue in a simulated transaction.
struct TestEnqueuedCall {
    AztecAddress contract_address;
    std::vector<FF> calldata = {};
    bool is_static_call = false;
};

// Owns an in-process world state and contract DB, supports pseudo-deployments of custom bytecode
// (populating the merkle trees and contract DB), and simulates public transactions through the
// C++ AVM simulator. Each instance manages its own temporary world-state database, which is
// removed on destruction.
class PublicTxSimulationTester {
  public:
    // The default msg_sender / fee_payer used for deployments and enqueued calls.
    static AztecAddress default_sender();

    PublicTxSimulationTester();
    ~PublicTxSimulationTester();

    PublicTxSimulationTester(const PublicTxSimulationTester&) = delete;
    PublicTxSimulationTester& operator=(const PublicTxSimulationTester&) = delete;
    PublicTxSimulationTester(PublicTxSimulationTester&&) = delete;
    PublicTxSimulationTester& operator=(PublicTxSimulationTester&&) = delete;

    // Pseudo-deploys a contract from packed bytecode: derives its class id/instance/address,
    // registers them in the contract DB, and inserts the deployment nullifier into the world
    // state so the simulator can resolve the contract. The salt differentiates instances that
    // share the same bytecode (and therefore the same class id).
    DeployedContract deploy_contract(std::span<const uint8_t> bytecode, const FF& salt = 0);

    // World-state helpers for seeding "warm" tree reads.
    void set_public_storage(const AztecAddress& address, const FF& slot, const FF& value);
    void insert_siloed_nullifier(const FF& siloed_nullifier);
    void append_note_hash(const FF& note_hash);
    void append_l1_to_l2_message(const FF& message);

    // Simulates a public tx with the given app-logic enqueued calls, funding the fee payer
    // up front. The simulation runs on a fresh world-state checkpoint that is reverted
    // afterwards, so deployments persist across calls but per-tx writes do not.
    TxSimulationResult simulate_tx(const std::vector<TestEnqueuedCall>& app_calls,
                                   const PublicSimulatorConfig& config = default_config());

    static PublicSimulatorConfig default_config();

    TestContractDB& contract_db() { return contract_db_; }

  private:
    void fund_fee_payer(const AztecAddress& fee_payer);

    // In-memory merkle DB backing the simulation; tests/fuzzers use this in place of an on-disk
    // world state (prod uses the WSDB-IPC-backed DB). Seeded with the same 128/128 nullifier and
    // public-data prefill the on-disk genesis used.
    simulation::MemoryMerkleDB merkle_db_;
    TestContractDB contract_db_;
    uint64_t tx_count = 0;
};

} // namespace bb::avm2::testing
