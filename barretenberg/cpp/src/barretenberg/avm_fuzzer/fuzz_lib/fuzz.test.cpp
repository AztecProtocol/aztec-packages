#include <gtest/gtest.h>
#include <iostream>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/vm2/common/field.hpp"

using namespace bb::avm2::fuzzer;

FuzzerWorldStateManager* ws_mgr = nullptr;

void register_functions(FuzzerContext& context)
{
    for (auto& function : PREDEFINED_FUNCTIONS) {
        try {
            context.register_contract_from_bytecode(function);
        } catch (...) {
            std::cout << "Failed to register predefined function: " << function.size() << std::endl;
            continue;
        }
    }
}

class FuzzTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        FuzzerWorldStateManager::initialize();
        if (ws_mgr == nullptr) {
            ws_mgr = FuzzerWorldStateManager::getInstance();
        }
        ws_mgr->fork();
        context = FuzzerContext();
        register_functions(context);
    }

    void TearDown() override { ws_mgr->reset_world_state(); }

    SimulatorResult simulate_with_default_tx(std::vector<uint8_t>& bytecode, std::vector<FF> calldata)
    {
        return simulate_with_default_tx(bytecode, calldata, {});
    }

    SimulatorResult simulate_with_default_tx(std::vector<uint8_t>& bytecode,
                                             std::vector<FF> calldata,
                                             const std::vector<FF>& note_hashes)
    {
        ws_mgr->checkpoint();

        ws_mgr->append_note_hashes(note_hashes);

        auto contract_address = context.register_contract_from_bytecode(bytecode);
        FuzzerContractDB contract_db = context.get_contract_db();

        auto tx = create_default_tx(contract_address, MSG_SENDER, calldata, TRANSACTION_FEE, IS_STATIC_CALL, GAS_LIMIT);
        FF fee_required_da = FF(tx.effective_gas_fees.fee_per_da_gas) * FF(tx.gas_settings.gas_limits.da_gas);
        FF fee_required_l2 = FF(tx.effective_gas_fees.fee_per_l2_gas) * FF(tx.gas_settings.gas_limits.l2_gas);
        ws_mgr->write_fee_payer_balance(tx.fee_payer, fee_required_da + fee_required_l2);
        auto cpp_simulator = CppSimulator();

        auto result = cpp_simulator.simulate(*ws_mgr, contract_db, tx, {}, {});

        ws_mgr->revert();

        return result;
    }

    FuzzerContext context;
};

namespace arithmetic {
class ArithmeticFuzzTest : public FuzzTest {
  protected:
    // set(addr 0, 5) set(addr 1, 2) OP(addr 0, addr 1, addr 2) return(addr 2)
    FF get_result_of_instruction(FuzzInstruction instruction,
                                 bb::avm2::MemoryTag return_value_tag = bb::avm2::MemoryTag::U8)
    {
        auto set_instruction_1 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                                                    .result_address = AddressRef{ .address = 0 },
                                                    .value = 5 };
        auto set_instruction_2 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                                                    .result_address = AddressRef{ .address = 1 },
                                                    .value = 2 };
        auto instructions = std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, instruction };
        auto return_options =
            ReturnOptions{ .return_size = 1, .return_value_tag = return_value_tag, .return_value_offset_index = 2 };
        auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
        auto control_flow = ControlFlow(instruction_blocks);
        control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
        auto bytecode = control_flow.build_bytecode(return_options);

        auto result = simulate_with_default_tx(bytecode, {});
        return result.output.at(0);
    }

    // Helper function for 16-bit instructions
    // set(addr 0, 5) set(addr 1, 2) OP_16(addr 0, addr 1, addr 2) return(addr 2)
    FF get_result_of_instruction_16(FuzzInstruction instruction,
                                    bb::avm2::MemoryTag return_value_tag = bb::avm2::MemoryTag::U8)
    {
        auto set_instruction_1 =
            SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                               .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                               .value = 5 };
        auto set_instruction_2 =
            SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                               .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                               .value = 2 };
        auto instructions = std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, instruction };

        auto return_options =
            ReturnOptions{ .return_size = 1, .return_value_tag = return_value_tag, .return_value_offset_index = 2 };
        auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
        auto control_flow = ControlFlow(instruction_blocks);
        control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
        auto bytecode = control_flow.build_bytecode(return_options);

        auto result = simulate_with_default_tx(bytecode, {});
        return result.output.at(0);
    }
};

TEST_F(ArithmeticFuzzTest, ADD8)
{
    auto add_instruction = ADD_8_Instruction{
        .a_address =
            VariableRef{
                .tag = bb::avm2::MemoryTag::U8,
                .index = 0,
                .mode = AddressingMode::Direct,
            },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(add_instruction);
    EXPECT_EQ(result, 7);
}

TEST_F(ArithmeticFuzzTest, SUB8)
{
    auto sub_instruction = SUB_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(sub_instruction);
    EXPECT_EQ(result, 3);
}

TEST_F(ArithmeticFuzzTest, MUL8)
{
    auto mul_instruction = MUL_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(mul_instruction);
    EXPECT_EQ(result, 10);
}

TEST_F(ArithmeticFuzzTest, DIV8)
{
    auto div_instruction = DIV_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(div_instruction);
    EXPECT_EQ(result, 2);
}

TEST_F(ArithmeticFuzzTest, EQ8)
{
    auto eq_instruction = EQ_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(eq_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST_F(ArithmeticFuzzTest, LT8)
{
    auto lt_instruction = LT_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(lt_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST_F(ArithmeticFuzzTest, LTE8)
{
    auto lte_instruction = LTE_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(lte_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST_F(ArithmeticFuzzTest, AND8)
{
    auto and_instruction = AND_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(and_instruction);
    EXPECT_EQ(result, 0);
}

TEST_F(ArithmeticFuzzTest, OR8)
{
    auto or_instruction = OR_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(or_instruction);
    EXPECT_EQ(result, 7);
}

TEST_F(ArithmeticFuzzTest, XOR8)
{
    auto xor_instruction = XOR_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(xor_instruction);
    EXPECT_EQ(result, 7);
}

TEST_F(ArithmeticFuzzTest, SHL8)
{
    auto shl_instruction = SHL_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(shl_instruction);
    EXPECT_EQ(result, 20);
}

TEST_F(ArithmeticFuzzTest, SHR8)
{
    auto shr_instruction = SHR_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction(shr_instruction);
    EXPECT_EQ(result, 1);
}

// set(0, 4, FF) set(1, 2, FF) fdiv(FF, 0, 1, 2) return(2)
TEST_F(ArithmeticFuzzTest, FDIV8)
{
    auto fdiv_instruction = FDIV_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto set_instruction_1 =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                           .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                           .value = 4 };
    auto set_instruction_2 =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                           .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                           .value = 2 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, fdiv_instruction };

    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 2 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}

// set(0, 0, U8) not(U8, 0, 1) return(1)
TEST_F(ArithmeticFuzzTest, NOT8)
{
    auto set_instruction =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                           .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                           .value = 0 };
    auto not_instruction = NOT_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct }
    };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, not_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 255);
}

TEST_F(ArithmeticFuzzTest, ADD16)
{
    auto add_instruction = ADD_16_Instruction{
        .a_address =
            VariableRef{
                .tag = bb::avm2::MemoryTag::U8,
                .index = 0,
                .mode = AddressingMode::Direct,
            },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(add_instruction);
    EXPECT_EQ(result, 7);
}

TEST_F(ArithmeticFuzzTest, SUB16)
{
    auto sub_instruction = SUB_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(sub_instruction);
    EXPECT_EQ(result, 3);
}

TEST_F(ArithmeticFuzzTest, MUL16)
{
    auto mul_instruction = MUL_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(mul_instruction);
    EXPECT_EQ(result, 10);
}

TEST_F(ArithmeticFuzzTest, DIV16)
{
    auto div_instruction = DIV_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(div_instruction);
    EXPECT_EQ(result, 2);
}

TEST_F(ArithmeticFuzzTest, EQ16)
{
    auto eq_instruction = EQ_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(eq_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST_F(ArithmeticFuzzTest, LT16)
{
    auto lt_instruction = LT_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(lt_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST_F(ArithmeticFuzzTest, LTE16)
{
    auto lte_instruction = LTE_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(lte_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST_F(ArithmeticFuzzTest, AND16)
{
    auto and_instruction = AND_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(and_instruction);
    EXPECT_EQ(result, 0);
}

TEST_F(ArithmeticFuzzTest, OR16)
{
    auto or_instruction = OR_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(or_instruction);
    EXPECT_EQ(result, 7);
}

TEST_F(ArithmeticFuzzTest, XOR16)
{
    auto xor_instruction = XOR_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(xor_instruction);
    EXPECT_EQ(result, 7);
}

TEST_F(ArithmeticFuzzTest, SHL16)
{
    auto shl_instruction = SHL_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(shl_instruction);
    EXPECT_EQ(result, 20);
}

TEST_F(ArithmeticFuzzTest, SHR16)
{
    auto shr_instruction = SHR_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto result = get_result_of_instruction_16(shr_instruction);
    EXPECT_EQ(result, 1);
}

// set(0, 4, FF) set(1, 2, FF) fdiv_16(FF, 0, 1, 2) return(2)
TEST_F(ArithmeticFuzzTest, FDIV16)
{
    auto fdiv_instruction = FDIV_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct }
    };
    auto set_instruction_1 =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                           .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                           .value = 4 };
    auto set_instruction_2 =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                           .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                           .value = 2 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, fdiv_instruction };

    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 2 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}

// set(0, 0, U8) not_16(U8, 0, 1) return(1)
TEST_F(ArithmeticFuzzTest, NOT16)
{
    auto set_instruction =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                           .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                           .value = 0 };
    auto not_instruction = NOT_16_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct }
    };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, not_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 255);
}

} // namespace arithmetic

namespace type_conversion {
// set(10, 1, U16) set(0, 2, U8) cast_8(U8, 0, 1, U16) return(1)
// if cast worked, should return 2 (the U8 value cast to U16)
// if cast failed, should return 1 (the original U16 value)
TEST_F(FuzzTest, CAST8)
{
    auto set_u16 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U16,
                                      .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                                      .value = 1 };
    auto set_u8 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                                     .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                                     .value = 2 };
    auto cast_instruction = CAST_8_Instruction{
        .src_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
        .target_tag = bb::avm2::MemoryTag::U16
    };
    auto instructions = std::vector<FuzzInstruction>{ set_u16, set_u8, cast_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U16, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}

// set(10, 1, U16) set(0, 2, U8) cast_16(U8, 0, 1, U16) return(1)
// if cast worked, should return 2 (the U8 value cast to U16)
// if cast failed, should return 1 (the original U16 value)
TEST_F(FuzzTest, CAST16)
{
    auto set_u16 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U16,
                                      .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                                      .value = 1 };
    auto set_u8 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                                     .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                                     .value = 2 };
    auto cast_instruction = CAST_16_Instruction{
        .src_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
        .target_tag = bb::avm2::MemoryTag::U16
    };
    auto instructions = std::vector<FuzzInstruction>{ set_u16, set_u8, cast_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U16, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}
} // namespace type_conversion

namespace machine_memory {
// set(0, 0xabcd, U16) return(0)
TEST_F(FuzzTest, SET16)
{
    const uint16_t test_value = 0xABCD;
    auto set_instruction =
        SET_16_Instruction{ .value_tag = bb::avm2::MemoryTag::U16,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = test_value };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U16, .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}
// set(0, 0x12345678, U32) return(0)
TEST_F(FuzzTest, SET32)
{
    const uint32_t test_value = 0x12345678UL;
    auto set_instruction =
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = test_value };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U32, .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, 0xabcdef0123456789, U64) return(0)
TEST_F(FuzzTest, SET64)
{
    const uint64_t test_value = 0xABCDEF0123456789ULL;
    auto set_instruction =
        SET_64_Instruction{ .value_tag = bb::avm2::MemoryTag::U64,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = test_value };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U64, .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, something, U128) return(0)
TEST_F(FuzzTest, SET128)
{
    const uint64_t test_value_low = 0xFEDCBA9876543210ULL;
    const uint64_t test_value_high = 0x123456789ABCDEF0ULL;
    const uint128_t test_value =
        (static_cast<uint128_t>(test_value_high) << 64) | static_cast<uint128_t>(test_value_low);
    auto set_instruction =
        SET_128_Instruction{ .value_tag = bb::avm2::MemoryTag::U128,
                             .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                             .value_low = test_value_low,
                             .value_high = test_value_high };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options = ReturnOptions{ .return_size = 1,
                                         .return_value_tag = bb::avm2::MemoryTag::U128,
                                         .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, 123456789, FF) return(0)
TEST_F(FuzzTest, SETFF)
{
    const bb::avm2::FF test_value = bb::avm2::FF(123456789);
    auto set_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = test_value };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, 0x42, U8) set(1, 0x43, U8) mov_8(U8, 0, 1) return(1)
TEST_F(FuzzTest, MOV8)
{
    const uint8_t test_value = 0x42;
    const uint8_t test_value2 = 0x43;
    auto set_instruction =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                           .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                           .value = test_value };
    auto set_instruction2 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                                               .result_address = AddressRef{ .address = 1 },
                                               .value = test_value2 };
    auto mov_instruction = MOV_8_Instruction{
        .src_address = VariableRef{ .tag = bb::avm2::MemoryTag::U8, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct }
    };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, set_instruction2, mov_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, 0xbabe, U16) set(1, 0xc0fe, U16) mov_16(U16, 0, 1) return(1)
TEST_F(FuzzTest, MOV16)
{
    const uint16_t test_value = 0xbabe;
    const uint16_t test_value2 = 0xc0fe;
    auto set_instruction =
        SET_16_Instruction{ .value_tag = bb::avm2::MemoryTag::U16,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = test_value };
    auto set_instruction2 =
        SET_16_Instruction{ .value_tag = bb::avm2::MemoryTag::U16,
                            .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                            .value = test_value2 };
    auto mov_instruction = MOV_16_Instruction{
        .src_address = VariableRef{ .tag = bb::avm2::MemoryTag::U16, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct }
    };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, set_instruction2, mov_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U16, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

} // namespace machine_memory

namespace control_flow {

class ControlFlowFuzzTest : public FuzzTest {
  protected:
    //     set u1 condition value b1
    //      ↙        ↘
    //    set u1 b2     return 4
    //    ↙   ↘
    // ret 2 ret 3
    FF simulate_jump_if_depth_2_helper(uint8_t first_boolean_value, uint8_t second_boolean_value)
    {
        auto set_instruction_block_1 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U1,
                                                          .result_address = AddressRef{ .address = 1 },
                                                          .value = first_boolean_value };
        auto instruction_block_1 = InstructionBlock{ .instructions = { set_instruction_block_1 } };
        auto set_instruction_block_2 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U1,
                                                          .result_address = AddressRef{ .address = 2 },
                                                          .value = second_boolean_value };
        auto instruction_block_2 = InstructionBlock{ .instructions = { set_instruction_block_2 } };
        auto instruction_blocks = std::vector<InstructionBlock>{ instruction_block_1, instruction_block_2 };
        for (uint8_t i = 2; i < 5; i++) {
            auto set_instruction =
                SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8,
                                   .result_address = AddressRef{ .address = i, .mode = AddressingMode::Direct },
                                   .value = i };
            instruction_blocks.push_back(InstructionBlock{ .instructions = { set_instruction } });
        }
        auto return_options = ReturnOptions{ .return_size = 1,
                                             .return_value_tag = bb::avm2::MemoryTag::U8,
                                             .return_value_offset_index = 1 };
        auto control_flow = ControlFlow(instruction_blocks);
        control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
        control_flow.process_cfg_instruction(
            JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 1, // set second boolean
                              .else_program_block_instruction_block_idx = 4, // set 4
                              .condition_offset_index = 0 });
        control_flow.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 2, // set 2
                                                               .else_program_block_instruction_block_idx = 3, // set 3
                                                               .condition_offset_index = 1 });
        auto bytecode = control_flow.build_bytecode(return_options);

        auto result = simulate_with_default_tx(bytecode, {});
        return result.output.at(0);
    }

    //     set u1 condition
    //      ↙        ↘
    //    nop  ----→  return 2
    FF simulate_jump_to_block_helper(uint8_t condition_value)
    {
        auto set_return_value_block =
            InstructionBlock{ .instructions = { SET_8_Instruction{
                                  .value_tag = bb::avm2::MemoryTag::U8,
                                  .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                                  .value = 2 } } };
        auto instruction_block_1 =
            InstructionBlock{ .instructions = { SET_8_Instruction{
                                  .value_tag = bb::avm2::MemoryTag::U1,
                                  .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                                  .value = condition_value } } };
        auto instruction_blocks =
            std::vector<InstructionBlock>{ instruction_block_1, InstructionBlock(), set_return_value_block };
        auto return_options = ReturnOptions{ .return_size = 1,
                                             .return_value_tag = bb::avm2::MemoryTag::U8,
                                             .return_value_offset_index = 1 };
        auto control_flow = ControlFlow(instruction_blocks);
        control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
        control_flow.process_cfg_instruction(
            JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 1, // noop
                              .else_program_block_instruction_block_idx = 2, // set return value
                              .condition_offset_index = 0 });
        control_flow.process_cfg_instruction(JumpToBlock{ .target_block_idx = 2 });
        auto bytecode = control_flow.build_bytecode(return_options);

        auto result = simulate_with_default_tx(bytecode, {});
        return result.output.at(0);
    }
};

// block1 set return value 10
//   ↓
// block2 set return value 11 and return return value
TEST_F(ControlFlowFuzzTest, JumpToNewBlockSmoke)
{
    auto block1_instructions =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U8,
                              .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                              .value = 10 } } };
    auto block2_instructions =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U8,
                              .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                              .value = 11 } } };
    auto instruction_blocks = std::vector<InstructionBlock>{ block1_instructions, block2_instructions };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(JumpToNewBlock{ .target_program_block_instruction_block_idx = 1 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 11);
}

// block1 set return value 10
//   ↓
// block2 set return value 11
//   ↓
// block3 set return value 12 and return return value
TEST_F(ControlFlowFuzzTest, JumpToNewBlockSmoke2)
{
    auto block1_instructions =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U8,
                              .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                              .value = 10 } } };
    auto block2_instructions =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U8,
                              .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                              .value = 11 } } };
    auto block3_instructions =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U8,
                              .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                              .value = 12 } } };
    auto instruction_blocks =
        std::vector<InstructionBlock>{ block1_instructions, block2_instructions, block3_instructions };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(JumpToNewBlock{ .target_program_block_instruction_block_idx = 1 });
    control_flow.process_cfg_instruction(JumpToNewBlock{ .target_program_block_instruction_block_idx = 2 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 12);
}

// block1 set u8 value 10
//   ↓
// block2 tries to return u8
// if blocks does not share defined variables, block2 will return 0
TEST_F(ControlFlowFuzzTest, JumpToNewBlockSharesVariables)
{
    auto block1 = InstructionBlock{ .instructions = { SET_8_Instruction{
                                        .value_tag = bb::avm2::MemoryTag::U8,
                                        .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                                        .value = 10 } } };

    auto instruction_blocks = std::vector<InstructionBlock>{ block1 };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(JumpToNewBlock{ .target_program_block_instruction_block_idx = 1 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 10);
}

//     block1 set u1 condition value
//   ↙        ↘
// return 11    return 12
TEST_F(ControlFlowFuzzTest, JumpIfToNewBlockSmoke)
{
    auto set_true_block =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U1,
                              .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                              .value = 1 } } };
    auto set_false_block =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U1,
                              .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                              .value = 0 } } };
    auto block2_instructions =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U8,
                              .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                              .value = 11 } } };
    auto block3_instructions =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U8,
                              .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                              .value = 12 } } };
    auto instruction_blocks =
        std::vector<InstructionBlock>{ set_true_block, set_false_block, block2_instructions, block3_instructions };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    // set true, go to block2
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 2,
                                                           .else_program_block_instruction_block_idx = 3,
                                                           .condition_offset_index = 1 });
    auto bytecode_1 = control_flow.build_bytecode(return_options);
    auto control_flow2 = ControlFlow(instruction_blocks);
    // set false, go to block3
    control_flow2.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 1 });
    control_flow2.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 2,
                                                            .else_program_block_instruction_block_idx = 3,
                                                            .condition_offset_index = 1 });
    auto bytecode_2 = control_flow2.build_bytecode(return_options);

    auto result_1 = simulate_with_default_tx(bytecode_1, {});
    auto result_2 = simulate_with_default_tx(bytecode_2, {});
    EXPECT_EQ(result_1.output.at(0), 11);
    EXPECT_EQ(result_2.output.at(0), 12);
}

TEST_F(ControlFlowFuzzTest, JumpIfDepth2Smoke)
{
    EXPECT_EQ(simulate_jump_if_depth_2_helper(1, 1), 2);
    EXPECT_EQ(simulate_jump_if_depth_2_helper(1, 0), 3);
    EXPECT_EQ(simulate_jump_if_depth_2_helper(0, 1), 4);
    EXPECT_EQ(simulate_jump_if_depth_2_helper(0, 0), 4);
}

TEST_F(ControlFlowFuzzTest, JumpToBlockSmoke)
{
    EXPECT_EQ(simulate_jump_to_block_helper(1), 2);
    EXPECT_EQ(simulate_jump_to_block_helper(0), 2);
}

// Nice catch! That's actually fully ai generated test.
// test if terminate with return works
//     set u1 condition value
//   ↙        ↘
// set FF, ret  set U128, ret
TEST_F(ControlFlowFuzzTest, JumpIfToNewBlockWithReturn)
{
    // Block 0: Set condition (U1)
    auto set_condition_block =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U1,
                              .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                              .value = 1 } } };

    // Block 1: Set FF value
    const bb::avm2::FF ff_value = bb::avm2::FF(123456789);
    auto set_ff_block =
        InstructionBlock{ .instructions = { SET_FF_Instruction{
                              .value_tag = bb::avm2::MemoryTag::FF,
                              .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                              .value = ff_value } } };

    // Block 2: Set U128 value
    const uint64_t u128_value_low = 0xFEDCBA9876543210ULL;
    const uint64_t u128_value_high = 0x123456789ABCDEF0ULL;
    auto set_u128_block =
        InstructionBlock{ .instructions = { SET_128_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U128,
                              .result_address = AddressRef{ .address = 20, .mode = AddressingMode::Direct },
                              .value_low = u128_value_low,
                              .value_high = u128_value_high } } };

    auto instruction_blocks = std::vector<InstructionBlock>{ set_condition_block, set_ff_block, set_u128_block };

    auto control_flow = ControlFlow(instruction_blocks);

    // Insert condition block
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });

    // JumpIf: if condition is true (1), go to block 1 (FF), else go to block 2 (U128)
    control_flow.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 1,
                                                           .else_program_block_instruction_block_idx = 2,
                                                           .condition_offset_index = 0 });

    // Finalize then block (FF) with Return
    control_flow.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 10 } });

    // Finalize else block (U128) with Return
    control_flow.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U128, .return_value_offset_index = 20 } });

    // Test with condition = true (should return FF value)
    auto control_flow_true = ControlFlow(instruction_blocks);
    control_flow_true.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow_true.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 1,
                                                                .else_program_block_instruction_block_idx = 2,
                                                                .condition_offset_index = 0 });
    control_flow_true.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 10 } });
    control_flow_true.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U128, .return_value_offset_index = 20 } });

    auto bytecode_true = control_flow_true.build_bytecode(ReturnOptions{
        .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 10 });

    auto result_true = simulate_with_default_tx(bytecode_true, {});
    EXPECT_EQ(result_true.output.at(0), ff_value);

    // Test with condition = false (should return U128 value)
    auto set_condition_false_block =
        InstructionBlock{ .instructions = { SET_8_Instruction{
                              .value_tag = bb::avm2::MemoryTag::U1,
                              .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                              .value = 0 } } };
    auto instruction_blocks_false =
        std::vector<InstructionBlock>{ set_condition_false_block, set_ff_block, set_u128_block };

    auto control_flow_false = ControlFlow(instruction_blocks_false);
    control_flow_false.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow_false.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 1,
                                                                 .else_program_block_instruction_block_idx = 2,
                                                                 .condition_offset_index = 0 });
    control_flow_false.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 10 } });
    control_flow_false.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U128, .return_value_offset_index = 20 } });

    const uint128_t expected_u128_value =
        (static_cast<uint128_t>(u128_value_high) << 64) | static_cast<uint128_t>(u128_value_low);
    auto bytecode_false = control_flow_false.build_bytecode(ReturnOptions{
        .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U128, .return_value_offset_index = 20 });

    auto result_false = simulate_with_default_tx(bytecode_false, {});
    EXPECT_EQ(result_false.output.at(0), expected_u128_value);
}
} // namespace control_flow

namespace public_storage {
TEST_F(FuzzTest, SstoreThenSload)
{
    // M[10] = 10
    auto set_value_instruction =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                           .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                           .value = 10 };
    // S[10] = M[10]
    auto sstore_instruction = SSTORE_Instruction{
        .src_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
        .slot = 10
    };
    // M[2] = S[10], FF tag
    auto sload_instruction =
        SLOAD_Instruction{ .slot_index = 0,
                           .slot_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                           .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct } };
    // M[10] = 11
    auto set_value_instruction2 =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                           .result_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
                           .value = 11 };

    auto set_sstore_sload_block = InstructionBlock{
        .instructions = { set_value_instruction, sstore_instruction, sload_instruction, set_value_instruction2 }
    };

    auto instruction_blocks = std::vector<InstructionBlock>{ set_sstore_sload_block };
    // FF should be set via sload instruction
    auto return_options = ReturnOptions{ .return_size = 1,
                                         .return_value_tag = bb::avm2::MemoryTag::FF,
                                         .return_value_offset_index = 1 /* after sload instruction */ };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 10);
}
} // namespace public_storage

namespace execution_environment {

class ExecutionEnvironmentFuzzTest : public FuzzTest {
  protected:
    FF getenvvar_helper(uint8_t type, bb::avm2::MemoryTag return_value_tag = bb::avm2::MemoryTag::FF)
    {
        auto getenvvar_instruction =
            GETENVVAR_Instruction{ .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                                   .type = type };
        auto instruction_blocks =
            std::vector<InstructionBlock>{ InstructionBlock{ .instructions = { getenvvar_instruction } } };
        auto control_flow = ControlFlow(instruction_blocks);
        control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
        auto return_options =
            ReturnOptions{ .return_size = 1, .return_value_tag = return_value_tag, .return_value_offset_index = 0 };
        auto bytecode = control_flow.build_bytecode(return_options);

        auto result = simulate_with_default_tx(bytecode, {});
        return result.output.at(0);
    }
};

TEST_F(ExecutionEnvironmentFuzzTest, GetEnvVarSmoke)
{
    EXPECT_EQ(getenvvar_helper(0),
              FF("0x0dcd235d388105fa4154fc2d1c0143686d5da4d4aa9826d8f6609a02dc2d7c56")); // address with bytecode
    EXPECT_EQ(getenvvar_helper(1), MSG_SENDER);                                          // sender, see simulator.cpp
    EXPECT_EQ(getenvvar_helper(2), TRANSACTION_FEE);                   // transaction fee, see simulator.cpp
    EXPECT_EQ(getenvvar_helper(3), CHAIN_ID);                          // chain id, see simulator.cpp globals
    EXPECT_EQ(getenvvar_helper(4), VERSION);                           // version, see simulator.cpp globals
    EXPECT_EQ(getenvvar_helper(5), BLOCK_NUMBER);                      // block number, see simulator.cpp globals
    EXPECT_EQ(getenvvar_helper(6, bb::avm2::MemoryTag::U64), 1000000); // timestamp, see simulator.cpp globals
    EXPECT_EQ(getenvvar_helper(7), FEE_PER_L2_GAS);                    // FEEPERL2GAS = 1, see simulator.cpp gas_fees
    EXPECT_EQ(getenvvar_helper(8), FEE_PER_DA_GAS);                    // FEEPERDAGAS = 1, see simulator.cpp gas_fees
    EXPECT_EQ(getenvvar_helper(9), 0);                                 // is static call is always false
    EXPECT_EQ(getenvvar_helper(10),
              GAS_LIMIT.l2_gas - AVM_SET_BASE_L2_GAS - 2 * 6); // L2GASLEFT, gas spent on set + getenvvar + return
    EXPECT_EQ(getenvvar_helper(11), GAS_LIMIT.da_gas);         // DAGASLEFT, see simulator.cpp
}
} // namespace execution_environment

namespace notes_and_nullifiers {
TEST_F(FuzzTest, EmitNullifierThenNullifierExists)
{
    auto set_field_instruction =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                           .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                           .value = 1 };
    auto emit_nullifier_instruction = EMITNULLIFIER_Instruction{
        .nullifier_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct }
    };
    auto nullifier_exists_instruction = NULLIFIEREXISTS_Instruction{
        .nullifier_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .contract_address_address = AddressRef{ .address = 10, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 20, .mode = AddressingMode::Direct }
    };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, emit_nullifier_instruction, nullifier_exists_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(ReturnOptions{
        .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U1, .return_value_offset_index = 20 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 1);
}

TEST_F(FuzzTest, EmitNullifierThenNullifierExistsOverwritingPreviousNullifier)
{
    auto set_field_instruction =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                           .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                           .value = 1 };
    auto emit_nullifier_instruction = EMITNULLIFIER_Instruction{
        .nullifier_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct }
    };
    auto nullifier_exists_instruction = NULLIFIEREXISTS_Instruction{
        .nullifier_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .contract_address_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct }
    }; // GETENVVAR overwrites previous nullifier
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, emit_nullifier_instruction, nullifier_exists_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U1, .return_value_offset_index = 0 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 0);
}

TEST_F(FuzzTest, EmitNoteHashThenNoteHashExists)
{
    FF note_hash = 42;
    uint64_t leaf_index = 0;
    auto set_note_hash_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = note_hash };
    auto set_leaf_index_instruction =
        SET_64_Instruction{ .value_tag = bb::avm2::MemoryTag::U64,
                            .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                            .value = leaf_index };
    auto note_hash_exists_instruction =
        NOTEHASHEXISTS_Instruction{ .notehash_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                                    .leaf_index_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                                    .result_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct } };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_note_hash_instruction, set_leaf_index_instruction, note_hash_exists_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U1, .return_value_offset_index = 0 });
    auto result = simulate_with_default_tx(bytecode, {}, { note_hash });
    EXPECT_FALSE(result.reverted);
    EXPECT_EQ(result.output.at(0), 1);
}
} // namespace notes_and_nullifiers

namespace calldata_returndata {
TEST_F(FuzzTest, CopyCalldataThenReturnData)
{
    auto calldatacopy_instruction = CALLDATACOPY_Instruction{ .dst_address = AddressRef{ .address = 0 },
                                                              .copy_size = 1,
                                                              .copy_size_address = AddressRef{ .address = 1 },
                                                              .cd_start = 0,
                                                              .cd_start_address = AddressRef{ .address = 2 } };
    auto instruction_blocks =
        std::vector<InstructionBlock>{ InstructionBlock{ .instructions = { calldatacopy_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 });

    auto result = simulate_with_default_tx(bytecode, { FF(1337) });
    EXPECT_EQ(result.output.at(0), 1337);
}

// call internal function overwrites memory address
TEST_F(FuzzTest, InternalCall)
{
    auto set_field_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 1337 };
    auto set_field_instruction2 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 313373 };
    auto internal_call_instruction = InsertInternalCall{ .target_program_block_instruction_block_idx = 1 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, set_field_instruction2 } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(internal_call_instruction);
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 313373);
}
} // namespace calldata_returndata

namespace internal_calls {

// check if internal call does not halt execution on return
TEST_F(FuzzTest, InternalCalledBlockUsesInternalReturn)
{
    auto set_field_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 1337 };
    auto set_boolean_instruction =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U1,
                           .result_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct },
                           .value = 1 };
    auto internal_call_instruction = InsertInternalCall{ .target_program_block_instruction_block_idx = 1 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, set_boolean_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 1 });
    control_flow.process_cfg_instruction(internal_call_instruction);
    // this should do nothing, just insert INTERNALRETURN instruction
    // otherwise it will halt execution and return 1
    control_flow.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U1, .return_value_offset_index = 0 } });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 1337);
}

// SSTORE(0, 1337); call f1; return SLOAD(0);
// f1: SSTORE(0, 31337); call f2; INTERNALRETURN
// f2: SSTORE(0, 313373); INTERNALRETURN
TEST_F(FuzzTest, SeveralInternalCalls)
{
    auto set_field_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 1337 };
    auto set_field_instruction2 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 31337 };
    auto set_field_instruction3 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 313373 };
    auto internal_call_instruction = InsertInternalCall{ .target_program_block_instruction_block_idx = 1 };
    auto internal_call_instruction2 = InsertInternalCall{ .target_program_block_instruction_block_idx = 2 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, set_field_instruction2, set_field_instruction3 } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(internal_call_instruction);
    control_flow.process_cfg_instruction(internal_call_instruction2);
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 313373);
}

/// START
/// InternaCall
///    ...
///    InternalCall
///    ...
///    InternalReturn
/// InternalReturn
/// InternaCall
/// ...
/// InternalReturn
/// ...
/// RETURN
///
/// SSTORE(0, 1); call f1; call f3; RETURN SLOAD(0);  // should return 313373
/// f1: SSTORE(0, 1337); call f2; SSTORE(0, 1337); INTERNALRETURN
/// f2: SSTORE(0, 31337); INTERNALRETURN
/// f3: SSTORE(0, 313373); INTERNALRETURN
TEST_F(FuzzTest, Reentrancy)
{
    auto set_field_instruction0 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 1 };
    auto set_field_instruction1 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 1337 };
    auto set_field_instruction2 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 31337 };
    auto set_field_instruction3 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = 313373 };
    auto internal_call_instruction = InsertInternalCall{ .target_program_block_instruction_block_idx = 1 };
    auto internal_call_instruction2 = InsertInternalCall{ .target_program_block_instruction_block_idx = 2 };
    auto internal_call_instruction3 = InsertInternalCall{ .target_program_block_instruction_block_idx = 3 };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        { set_field_instruction0, set_field_instruction1, set_field_instruction2, set_field_instruction3 } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    // call f1
    control_flow.process_cfg_instruction(internal_call_instruction);
    // call f2
    control_flow.process_cfg_instruction(internal_call_instruction2);
    // Should switch context to f1
    control_flow.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 } });
    // SSTORE(0, 1337);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 1 });
    // Should switch context to f0 (START)
    control_flow.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 } });
    // call f3
    control_flow.process_cfg_instruction(internal_call_instruction3);
    // Should switch context to f0 (START)
    control_flow.process_cfg_instruction(FinalizeWithReturn{
        .return_options = ReturnOptions{
            .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 } });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 313373);
}
} // namespace internal_calls

namespace avm_addressing {
TEST_F(FuzzTest, DirectWithIndirect)
{
    auto set_field_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 150, .mode = AddressingMode::Direct },
                            .value = 10 };
    auto set_field_instruction2 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 3000, .mode = AddressingMode::Direct },
                            .value = 20 };
    auto add_instruction = ADD_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF,
                                  .index = 1,
                                  .pointer_address_seed = 100,
                                  .mode = AddressingMode::Indirect },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 130, .mode = AddressingMode::Direct }
    };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, set_field_instruction2, add_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 2 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 30);
}

TEST_F(FuzzTest, DirectWithIndirectRelative)
{
    auto set_field_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 150, .mode = AddressingMode::Direct },
                            .value = 10 };
    auto set_field_instruction2 =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 3000, .mode = AddressingMode::Direct },
                            .value = 20 };
    auto add_instruction = ADD_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF,
                                  .index = 1,
                                  .pointer_address_seed = 100,
                                  .mode = AddressingMode::IndirectRelative },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 130, .mode = AddressingMode::Direct }
    };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, set_field_instruction2, add_instruction }, .base_offset = 100 } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 2 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 30);
}

TEST_F(FuzzTest, IndirectResultCanBeUsedInNextInstruction)
{
    auto set_field_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 150, .mode = AddressingMode::Direct },
                            .value = 10 };
    auto add_instruction = ADD_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 130, .pointer_address_seed = 100, .mode = AddressingMode::Indirect }
    };
    auto mul_instruction = MUL_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 1, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 1, .mode = AddressingMode::Direct },
        .result_address = AddressRef{ .address = 150, .mode = AddressingMode::Direct }
    };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, add_instruction, mul_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 2 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 400);
}

TEST_F(FuzzTest, Memoryaddressing32BitWidth)
{
    auto set_field_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = AddressRef{ .address = 150, .mode = AddressingMode::Direct },
                            .value = 10 };
    auto set_field_instruction2 = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                      .result_address = AddressRef{ .address = 4294967295,
                                                                                    .pointer_address_seed = 100,
                                                                                    .mode = AddressingMode::Indirect },
                                                      .value = 20 };
    auto add_instruction = MUL_8_Instruction{
        .a_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF, .index = 0, .mode = AddressingMode::Direct },
        .b_address = VariableRef{ .tag = bb::avm2::MemoryTag::FF,
                                  .index = 1,
                                  .pointer_address_seed = 200,
                                  .mode = AddressingMode::Indirect },
        .result_address = AddressRef{ .address = 150, .mode = AddressingMode::Direct }
    };
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{
        .instructions = { set_field_instruction, set_field_instruction2, add_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 2 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 200);
}
} // namespace avm_addressing

namespace misc {
// TODO(defkit): get info from world state to be sure that the message will be sent / log emitted
TEST_F(FuzzTest, SendL2ToL1Msg)
{
    auto sendl2tol1msg_instruction =
        SENDL2TOL1MSG_Instruction{ .recipient = 100,
                                   .recipient_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                                   .content = 200,
                                   .content_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct } };
    auto instruction_blocks =
        std::vector<InstructionBlock>{ InstructionBlock{ .instructions = { sendl2tol1msg_instruction } } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.reverted, false);
}

TEST_F(FuzzTest, EmitUnencryptedLog)
{
    auto log_size_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct };
    auto log_values_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct };
    uint32_t log_size = 1;
    FF log_value = 42;

    std::vector<FuzzInstruction> instructions;

    instructions.push_back(SET_32_Instruction{
        .value_tag = bb::avm2::MemoryTag::U32, .result_address = log_size_address, .value = log_size });

    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = log_values_address, .value = log_value });

    instructions.push_back(EMITUNENCRYPTEDLOG_Instruction{ .log_size_address = log_size_address,
                                                           .log_values_address = log_values_address });

    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.reverted, false);
}
} // namespace misc

namespace external_calls {

class ExternalCallsFuzzTest : public FuzzTest {
  protected:
    FF get_contract_instance_helper(uint8_t member_enum, bb::avm2::MemoryTag return_value_tag = bb::avm2::MemoryTag::FF)
    {
        FF address = context.get_contract_address(0);
        std::vector<FuzzInstruction> instructions;
        instructions.push_back(
            SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                .result_address = AddressRef{ .address = 123, .mode = AddressingMode::Direct },
                                .value = address });
        instructions.push_back(GETCONTRACTINSTANCE_Instruction{
            .contract_address_address = AddressRef{ .address = 123, .mode = AddressingMode::Direct },
            .member_enum = member_enum,
            .dst_address = AddressRef{ .address = 124, .mode = AddressingMode::Direct } });

        auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
        auto control_flow = ControlFlow(instruction_blocks);
        control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
        auto bytecode = control_flow.build_bytecode(
            ReturnOptions{ .return_size = 1, .return_value_tag = return_value_tag, .return_value_offset_index = 1 });
        auto result = simulate_with_default_tx(bytecode, {});
        return result.output.at(0);
    }
};

/// call(ADD8), returndatacopy, return
/// ADD8: 1 + 1
TEST_F(ExternalCallsFuzzTest, ExternalCallToAdd8)
{
    std::vector<FuzzInstruction> instructions;
    auto contract_address = context.get_contract_address(0);
    AddressRef contract_address_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct };
    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = contract_address_address, .value = contract_address });

    uint32_t l2_gas = 10000;
    AddressRef l2_gas_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct };
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = l2_gas_address, .value = l2_gas });

    uint32_t da_gas = 10000;
    AddressRef da_gas_address = AddressRef{ .address = 3, .mode = AddressingMode::Direct };
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = da_gas_address, .value = da_gas });

    uint16_t arg_size = 0;
    AddressRef arg_size_address = AddressRef{ .address = 4, .mode = AddressingMode::Direct };
    AddressRef args_address = AddressRef{ .address = 5, .mode = AddressingMode::Direct };

    instructions.push_back(CALL_Instruction{ .l2_gas_address = l2_gas_address,
                                             .da_gas_address = da_gas_address,
                                             .contract_address_address = contract_address_address,
                                             .calldata_address = args_address,
                                             .calldata_size_address = arg_size_address,
                                             .calldata_size = arg_size,
                                             .is_static_call = false });

    instructions.push_back(RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction{
        .copy_size_offset = 6, .dst_address = 7, .rd_start = 0, .rd_start_offset = 8 });

    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 1 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}

TEST_F(ExternalCallsFuzzTest, GetContractInstance)
{

    EXPECT_EQ(get_contract_instance_helper(0),
              FF("0x0000000000000000000000000000000000000000000000000000000000000064")); // DEPLOYER
    EXPECT_EQ(get_contract_instance_helper(1),
              FF("0x0dc97dd1cc90c276ca76f34abb5085e1ae3addd8ace763a5da908bacf147d972")); // CLASS_ID
    EXPECT_EQ(get_contract_instance_helper(2),
              FF("0x0000000000000000000000000000000000000000000000000000000000000000")); // INIT HASH
    EXPECT_EQ(get_contract_instance_helper(0, bb::avm2::MemoryTag::U1), FF::one());      // EXISTS
}

// Calls add8, sucesscopy, return
TEST_F(ExternalCallsFuzzTest, SuccessCopy)
{
    std::vector<FuzzInstruction> instructions;
    auto contract_address = context.get_contract_address(0);
    AddressRef contract_address_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct };
    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = contract_address_address, .value = contract_address });

    uint32_t l2_gas = 10000;
    AddressRef l2_gas_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct };
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = l2_gas_address, .value = l2_gas });

    uint32_t da_gas = 10000;
    AddressRef da_gas_address = AddressRef{ .address = 3, .mode = AddressingMode::Direct };
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = da_gas_address, .value = da_gas });

    uint16_t arg_size = 0;
    AddressRef arg_size_address = AddressRef{ .address = 4, .mode = AddressingMode::Direct };
    AddressRef args_address = AddressRef{ .address = 5, .mode = AddressingMode::Direct };

    instructions.push_back(CALL_Instruction{ .l2_gas_address = l2_gas_address,
                                             .da_gas_address = da_gas_address,
                                             .contract_address_address = contract_address_address,
                                             .calldata_address = args_address,
                                             .calldata_size_address = arg_size_address,
                                             .calldata_size = arg_size,
                                             .is_static_call = false });

    instructions.push_back(
        SUCCESSCOPY_Instruction{ .dst_address = AddressRef{ .address = 6, .mode = AddressingMode::Direct } });
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U1, .return_value_offset_index = 0 });

    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), FF::one());
}

// Performs static call to ZERO_DIVISION, SUCCESSCOPY, RETURN
// The result should be 0
TEST_F(ExternalCallsFuzzTest, CallToZeroDivisionSuccessCopy)
{
    std::vector<FuzzInstruction> instructions;
    auto contract_address = context.get_contract_address(1);
    AddressRef contract_address_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct };
    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = contract_address_address, .value = contract_address });

    uint32_t l2_gas = 10000;
    AddressRef l2_gas_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct };
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = l2_gas_address, .value = l2_gas });

    uint32_t da_gas = 10000;
    AddressRef da_gas_address = AddressRef{ .address = 3, .mode = AddressingMode::Direct };
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = da_gas_address, .value = da_gas });

    uint16_t arg_size = 0;
    AddressRef arg_size_address = AddressRef{ .address = 4, .mode = AddressingMode::Direct };
    AddressRef args_address = AddressRef{ .address = 5, .mode = AddressingMode::Direct };

    instructions.push_back(CALL_Instruction{ .l2_gas_address = l2_gas_address,
                                             .da_gas_address = da_gas_address,
                                             .contract_address_address = contract_address_address,
                                             .calldata_address = args_address,
                                             .calldata_size_address = arg_size_address,
                                             .calldata_size = arg_size,
                                             .is_static_call = true });
    instructions.push_back(
        SUCCESSCOPY_Instruction{ .dst_address = AddressRef{ .address = 6, .mode = AddressingMode::Direct } });
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U1, .return_value_offset_index = 1 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), FF::zero());
    EXPECT_EQ(result.reverted, false);
}

/// Performs static call to SSTORE_FUNCTION, SUCCESSCOPY, RETURN
TEST_F(ExternalCallsFuzzTest, StaticCallToNonStaticFunctionSuccessCopy)
{
    std::vector<FuzzInstruction> instructions;
    auto contract_address = context.get_contract_address(2);
    AddressRef contract_address_address = AddressRef{ .address = 1, .mode = AddressingMode::Direct };
    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = contract_address_address, .value = contract_address });

    uint32_t l2_gas = 10000;
    AddressRef l2_gas_address = AddressRef{ .address = 2, .mode = AddressingMode::Direct };
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = l2_gas_address, .value = l2_gas });

    uint32_t da_gas = 10000;
    AddressRef da_gas_address = AddressRef{ .address = 3, .mode = AddressingMode::Direct };
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = da_gas_address, .value = da_gas });

    uint16_t arg_size = 0;
    AddressRef arg_size_address = AddressRef{ .address = 4, .mode = AddressingMode::Direct };
    AddressRef args_address = AddressRef{ .address = 5, .mode = AddressingMode::Direct };

    instructions.push_back(CALL_Instruction{ .l2_gas_address = l2_gas_address,
                                             .da_gas_address = da_gas_address,
                                             .contract_address_address = contract_address_address,
                                             .calldata_address = args_address,
                                             .calldata_size_address = arg_size_address,
                                             .calldata_size = arg_size,
                                             .is_static_call = true });
    instructions.push_back(
        SUCCESSCOPY_Instruction{ .dst_address = AddressRef{ .address = 6, .mode = AddressingMode::Direct } });
    auto instruction_blocks = std::vector<InstructionBlock>{ InstructionBlock{ instructions } };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U1, .return_value_offset_index = 1 });
    auto result = simulate_with_default_tx(bytecode, {});
    EXPECT_EQ(result.output.at(0), FF::zero());
    EXPECT_EQ(result.reverted, false);
}
} // namespace external_calls
