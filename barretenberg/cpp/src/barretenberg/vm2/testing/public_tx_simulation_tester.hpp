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
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"

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
    // Overrides the tx-level sender for this call's msg_sender. Used for internal functions that
    // require msg_sender to equal the contract's own address.
    std::optional<AztecAddress> msg_sender = std::nullopt;
};

// A fully-specified transaction to simulate: setup / app-logic / teardown enqueued calls plus the
// private-side insertions (nullifiers / note hashes / L2->L1 messages, split into the non-revertible
// and revertible accumulators) that a real tx would carry from its private portion. Mirrors the TS
// tester's createTx parameters; lets the proving tests exercise teardown and side-effect-limit paths.
struct TxScenario {
    std::vector<TestEnqueuedCall> setup_calls = {};
    std::vector<TestEnqueuedCall> app_calls = {};
    std::optional<TestEnqueuedCall> teardown_call = std::nullopt;
    // msg_sender / fee payer for the calls. Defaults to default_sender() when unset.
    std::optional<AztecAddress> sender = std::nullopt;
    // Overrides the tx's app-logic gas limits when set (some tests need more than the default).
    std::optional<Gas> gas_limits = std::nullopt;
    // Private insertions. When non_revertible_nullifiers is empty a unique first nullifier is supplied
    // automatically; when non-empty, its first element is used as the tx's first nullifier.
    std::vector<FF> non_revertible_nullifiers = {};
    std::vector<FF> non_revertible_note_hashes = {};
    std::vector<FF> revertible_nullifiers = {};
    std::vector<FF> revertible_note_hashes = {};
    std::vector<ScopedL2ToL1Message> revertible_l2_to_l1_messages = {};
    // When true, the tx's state changes are committed to the world state.
    bool commit = false;
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
    // share the same bytecode (and therefore, for fixed class params, the same class id).
    //
    // artifact_hash and private_functions_root feed into the class id alongside the bytecode
    // commitment. Custom-bytecode tests leave them at 0; contract-artifact deployments vary them
    // (e.g. with a seed) to obtain distinct class ids from identical bytecode.
    // initialization_hash / deployer feed the contract address derivation and let contracts with a
    // constructor (initializer) pass their initialization check (which recomputes the hash from the
    // constructor selector + args).
    DeployedContract deploy_contract(std::span<const uint8_t> bytecode,
                                     const FF& salt = 0,
                                     const FF& artifact_hash = 0,
                                     const FF& private_functions_root = 0,
                                     const FF& initialization_hash = 0,
                                     const AztecAddress& deployer = default_sender());

    // World-state helpers for seeding "warm" tree reads.
    void set_public_storage(const AztecAddress& address, const FF& slot, const FF& value);
    void insert_siloed_nullifier(const FF& siloed_nullifier);
    void append_note_hash(const FF& note_hash);
    void append_l1_to_l2_message(const FF& message);

    // Inserts the deployment (contract-address) nullifier for a contract at `address`, so the
    // simulator resolves it as deployed. deploy_contract() does this automatically; standalone
    // registrations (e.g. canonical standard contracts) call it directly.
    void insert_contract_deployment_nullifier(const AztecAddress& address);

    // Inserts a nullifier siloed by `contract_address`, mirroring the TS tester's insertNullifier.
    // Used to seed nullifiers that would normally be emitted by private functions not run here.
    void insert_nullifier(const AztecAddress& contract_address, const FF& nullifier);

    // Simulates a public tx with the given app-logic enqueued calls, funding the fee payer
    // up front. The simulation runs on a fresh world-state checkpoint that is reverted
    // afterwards, so deployments persist across calls but per-tx writes do not.
    TxSimulationResult simulate_tx(const std::vector<TestEnqueuedCall>& app_calls,
                                   const PublicSimulatorConfig& config = default_config());

    // As above, but with setup-phase enqueued calls. A revert in the setup phase is non-recoverable
    // and causes the simulator to throw (rather than returning a non-OK revert code).
    TxSimulationResult simulate_tx_with_setup(const std::vector<TestEnqueuedCall>& setup_calls,
                                              const std::vector<TestEnqueuedCall>& app_calls,
                                              const PublicSimulatorConfig& config = default_config());

    // Simulates a tx where `sender` is the msg_sender of the enqueued calls and the fee payer. When
    // `commit` is true the tx's state changes are committed to the world state so subsequent txs
    // observe them (needed for stateful multi-tx app tests such as token/amm); otherwise they are
    // reverted as usual.
    TxSimulationResult simulate_tx_as(const AztecAddress& sender,
                                      const std::vector<TestEnqueuedCall>& app_calls,
                                      bool commit,
                                      const PublicSimulatorConfig& config = default_config());

    // Simulates a fully-specified scenario (setup / app / teardown calls + private insertions + gas).
    // The richest entry point; the simulate_tx* overloads above are thin wrappers over it. Used by the
    // proving tests, which need teardown and side-effect-limit (revertible insertion) paths.
    TxSimulationResult simulate_scenario(const TxScenario& scenario,
                                         const PublicSimulatorConfig& config = default_config());

    static PublicSimulatorConfig default_config();

    world_state::WorldState& world_state() { return *ws; }
    TestContractDB& contract_db() { return contract_db_; }

    // Protocol contracts available to the simulated tx (canonical address -> derived address map).
    // Empty by default; populated by tests that exercise calls to protocol contracts (e.g. fee juice).
    ProtocolContracts protocol_contracts;

  private:
    world_state::WorldStateRevision current_revision() const;
    void fund_fee_payer(const AztecAddress& fee_payer);

    std::string data_dir;
    std::unique_ptr<world_state::WorldState> ws;
    uint64_t fork_id = 0;
    TestContractDB contract_db_;
    uint64_t tx_count = 0;
};

} // namespace bb::avm2::testing
