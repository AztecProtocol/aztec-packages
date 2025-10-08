#include "simulator.hpp"

#include <iomanip>
#include <iostream>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

using bb::avm2::GlobalVariables;
using namespace bb::avm2;
using namespace bb::avm2::simulation;
using namespace bb::avm2::testing;

// Helper function to create default global variables for testing
GlobalVariables create_default_globals()
{
    return GlobalVariables{
        .chainId = 1,
        .version = 1,
        .blockNumber = 1,
        .slotNumber = 1,
        .timestamp = 1000000,
        .coinbase = EthAddress{ 0 },
        .feeRecipient = AztecAddress{ 0 },
        .gasFees = GasFees{ .feePerDaGas = 1, .feePerL2Gas = 1 },
    };
}

class TestSimulator {
  protected:
    AvmSimulationHelper helper;
    AztecAddress contract_address{ 42 };
    AztecAddress sender_address{ 100 };
    FF transaction_fee = 0;
    GlobalVariables globals = create_default_globals();
    bool is_static_call = false;
    Gas gas_limit{ 1000000, 1000000 }; // Large gas limit for tests
  public:
    EnqueuedCallResult simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
    {
        return helper.simulate_bytecode(
            contract_address, sender_address, transaction_fee, globals, is_static_call, calldata, gas_limit, bytecode);
    }
};

SimulatorResult CppSimulator::simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    TestSimulator simulator;
    EnqueuedCallResult result = simulator.simulate(bytecode, calldata);
    return { .reverted = !result.success, .output = result.output.value_or(std::vector<FF>{}) };
}

// TODO(defkit) implement communication with the javascript simulator
SimulatorResult JsSimulator::simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    TestSimulator simulator;
    EnqueuedCallResult result = simulator.simulate(bytecode, calldata);
    return { .reverted = !result.success, .output = result.output.value_or(std::vector<FF>{}) };
}

bool compare_simulator_results(const SimulatorResult& result1, const SimulatorResult& result2)
{
    return result1.reverted == result2.reverted && result1.output == result2.output;
}
