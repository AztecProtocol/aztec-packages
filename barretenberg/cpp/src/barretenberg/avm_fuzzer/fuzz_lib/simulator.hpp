#pragma once

#include <vector>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/common/process.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2;

/**
 * Request struct for fuzzer simulation communication between C++ and TypeScript.
 * Contains all data needed for the TS simulator to execute a transaction.
 */
struct FuzzerSimulationRequest {
    std::string ws_data_dir;
    uint64_t ws_map_size_kb;
    Tx tx;
    GlobalVariables globals;
    std::vector<ContractClass> contract_classes;
    // Having addresses here avoids doing re-work in TS.
    std::vector<std::pair<AztecAddress, ContractInstance>> contract_instances;

    MSGPACK_CAMEL_CASE_FIELDS(ws_data_dir, ws_map_size_kb, tx, globals, contract_classes, contract_instances);
};

struct SimulatorResult {
    bool reverted;
    std::vector<FF> output;
    TreeSnapshots end_tree_snapshots;
    std::string revert_reason;

    MSGPACK_CAMEL_CASE_FIELDS(reverted, output, end_tree_snapshots, revert_reason);
};

class Simulator {
  public:
    virtual ~Simulator() = default;
    Simulator(const Simulator&) = delete;
    Simulator& operator=(const Simulator&) = delete;
    Simulator(Simulator&&) = delete;
    Simulator& operator=(Simulator&&) = delete;
    Simulator() = default;
    virtual SimulatorResult simulate(fuzzer::FuzzerWorldStateManager& ws_mgr,
                                     fuzzer::FuzzerContractDB& contract_db,
                                     const Tx& tx) = 0;
};

/// @brief uses barretenberg/vm2 to simulate the bytecode
class CppSimulator : public Simulator {
  public:
    SimulatorResult simulate(fuzzer::FuzzerWorldStateManager& ws_mgr,
                             fuzzer::FuzzerContractDB& contract_db,
                             const Tx& tx) override;
};

/// @brief uses the yarn-project/simulator to simulate the bytecode
/// Singleton, because initializing the simulator is expensive
class JsSimulator : public Simulator {
  protected:
    static JsSimulator* instance;
    std::string simulator_path;
    JsSimulator(std::string& simulator_path);
    Process process;

  public:
    JsSimulator(JsSimulator& other) = delete;
    void operator=(const JsSimulator&) = delete;
    JsSimulator(JsSimulator&&) = delete;
    JsSimulator& operator=(JsSimulator&&) = delete;
    ~JsSimulator() = default;

    static JsSimulator* getInstance();
    static void initialize(std::string& simulator_path);

    SimulatorResult simulate(fuzzer::FuzzerWorldStateManager& ws_mgr,
                             fuzzer::FuzzerContractDB& contract_db,
                             const Tx& tx) override;
};

GlobalVariables create_default_globals();

Tx create_default_tx(const AztecAddress& contract_address,
                     const AztecAddress& sender_address,
                     const std::vector<FF>& calldata,
                     [[maybe_unused]] const FF& transaction_fee,
                     bool is_static_call,
                     const Gas& gas_limit);

bool compare_simulator_results(SimulatorResult& result1, SimulatorResult& result2);

GlobalVariables create_default_globals();
