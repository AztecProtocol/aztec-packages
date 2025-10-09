#include <iomanip>
#include <iostream>
#include <vector>

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

// Helper function to create bytecode from a vector of instructions
std::vector<uint8_t> create_bytecode(const std::vector<Instruction>& instructions)
{
    std::vector<uint8_t> bytecode;
    for (const auto& instruction : instructions) {
        auto serialized_instruction = instruction.serialize();
        bytecode.insert(bytecode.end(),
                        std::make_move_iterator(serialized_instruction.begin()),
                        std::make_move_iterator(serialized_instruction.end()));
    }
    return bytecode;
}

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

class Simulator {
  protected:
    AvmSimulationHelper helper;
    AztecAddress contract_address{ 42 };
    AztecAddress sender_address{ 100 };
    FF transaction_fee = 0;
    GlobalVariables globals = create_default_globals();
    bool is_static_call = false;
    Gas gas_limit{ 1000000, 1000000 }; // Large gas limit for tests
  public:
    ExecutionResult simulate(const std::vector<Instruction>& instructions)
    {
        auto bytecode = create_bytecode(instructions);
        const std::vector<FF> calldata = {}; // No calldata
        return helper.simulate_bytecode(
            contract_address, sender_address, transaction_fee, globals, is_static_call, calldata, gas_limit, bytecode);
    }
};

int main()
{
    auto revert_instr = InstructionBuilder(bb::avm2::WireOpCode::REVERT_8)
                            .operand<uint8_t>(0x10) // rev_size_offset
                            .operand<uint8_t>(0x20) // rev_offset
                            .build();

    auto bytecode = create_bytecode({ revert_instr });
    const std::vector<FF> calldata = {}; // No calldata
    auto helper = Simulator();
    auto result = helper.simulate({ revert_instr });
    std::cout << "Result: " << result.success << std::endl;
    std::cout << "Gas used: " << result.gas_used.daGas << std::endl;

    return 0;
}
