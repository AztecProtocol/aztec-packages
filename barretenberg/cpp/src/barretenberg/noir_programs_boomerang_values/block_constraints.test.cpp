#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/noir_programs_boomerang_values/helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

class BlockConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(BlockConstraintsTests, ValidateROMConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6, 7 },
        .trace = { { AccessType::Read, witness_from_index(0), witness_from_index(1) },
                   { AccessType::Read, witness_from_index(2), witness_from_index(3) },
                   { AccessType::Read, witness_from_index(4), witness_from_index(5) },
                   { AccessType::Read, witness_from_index(6), witness_from_index(7) } },
        .type = BlockType::ROM,
    };

    AcirFormat constraint_system = build_acir_format(8, block_constraint);

    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();

    const auto& opcode_map = analyzer.build_opcode_type_map();
    EXPECT_EQ(opcode_map.size(), 1U);
    EXPECT_EQ(opcode_map.at(0).type, AcirConstraintType::BLOCK);

    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(BlockConstraintsTests, ValidateRAMConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6 },
        .trace = { { AccessType::Read, witness_from_index(0), witness_from_index(1) },
                   { AccessType::Write, witness_from_index(2), witness_from_index(3) },
                   { AccessType::Read, witness_from_index(4), witness_from_index(5) },
                   { AccessType::Write, witness_from_index(6), witness_from_index(7) } },
        .type = BlockType::RAM,
    };
    AcirFormat constraint_system = build_acir_format(8, block_constraint);
    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();

    const auto& opcode_map = analyzer.build_opcode_type_map();
    EXPECT_EQ(opcode_map.size(), 1U);
    EXPECT_EQ(opcode_map.at(0).type, AcirConstraintType::BLOCK);

    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(BlockConstraintsTests, ValidateCallDataConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6 },
        .trace = { { AccessType::Read, witness_from_index(0), witness_from_index(1) },
                   { AccessType::Read, witness_from_index(2), witness_from_index(3) },
                   { AccessType::Read, witness_from_index(4), witness_from_index(5) },
                   { AccessType::Read, witness_from_index(6), witness_from_index(7) } },
        .type = BlockType::CallData,
        .calldata_id = CallDataType::Primary,
    };
    AcirFormat constraint_system = build_acir_format(8, block_constraint);
    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    StaticAnalyzerAcirMega analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();

    const auto& opcode_map = analyzer.build_opcode_type_map();
    EXPECT_EQ(opcode_map.size(), 1U);
    EXPECT_EQ(opcode_map.at(0).type, AcirConstraintType::BLOCK);

    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(BlockConstraintsTests, ValidateReturnDataConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6, 7 },
        .trace = {}, // trace must be empty for return data
        .type = BlockType::ReturnData,
    };
    AcirFormat constraint_system = build_acir_format(8, block_constraint);
    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    StaticAnalyzerAcirMega analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();

    const auto& opcode_map = analyzer.build_opcode_type_map();
    EXPECT_EQ(opcode_map.size(), 1U);
    EXPECT_EQ(opcode_map.at(0).type, AcirConstraintType::BLOCK);

    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(BlockConstraintsTests, DetectCorruptedROMConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6, 7 },
        .trace = { { AccessType::Read, witness_from_index(0), witness_from_index(1) },
                   { AccessType::Read, witness_from_index(2), witness_from_index(3) },
                   { AccessType::Read, witness_from_index(4), witness_from_index(5) },
                   { AccessType::Read, witness_from_index(6), witness_from_index(7) } },
        .type = BlockType::ROM,
    };
    AcirFormat constraint_system = build_acir_format(8, block_constraint);
    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    auto& memory_block = builder.blocks.memory;
    bool found_gate = false;
    for (size_t i = 0; i < memory_block.size(); i++) {
        if (memory_block.q_1()[i] == fr::one() && memory_block.q_2()[i] == fr::zero() &&
            memory_block.q_3()[i] == fr::zero() && memory_block.q_4()[i] == fr::zero() &&
            memory_block.q_m()[i] == fr::one() && memory_block.q_memory()[i] == fr::one() &&
            memory_block.w_o()[i] == builder.zero_idx()) {
            if (builder.get_variable(memory_block.w_r()[i]) != fr::zero()) {
                memory_block.w_r()[i] = 6;
                found_gate = true;
                break;
            }
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find ROM access gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}

TEST_F(BlockConstraintsTests, DetectCorruptedRAMConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6 },
        .trace = { { AccessType::Read, witness_from_index(0), witness_from_index(1) },
                   { AccessType::Write, witness_from_index(2), witness_from_index(3) },
                   { AccessType::Read, witness_from_index(4), witness_from_index(5) },
                   { AccessType::Write, witness_from_index(6), witness_from_index(7) } },
        .type = BlockType::RAM,
    };
    AcirFormat constraint_system = build_acir_format(8, block_constraint, block_constraint);
    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    auto& memory_block = builder.blocks.memory;
    bool found_gate = false;
    for (size_t i = 0; i < memory_block.size(); i++) {
        if (memory_block.q_1()[i] == fr::one() && memory_block.q_2()[i] == fr::zero() &&
            memory_block.q_3()[i] == fr::zero() && memory_block.q_4()[i] == fr::zero() &&
            memory_block.q_m()[i] == fr::one() && memory_block.q_memory()[i] == fr::one() &&
            memory_block.w_o()[i] != builder.zero_idx()) {
            if (builder.get_variable(memory_block.w_o()[i]) != fr::zero()) {
                memory_block.w_o()[i] = 6;
                found_gate = true;
                break;
            }
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find RAM access gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}

TEST_F(BlockConstraintsTests, DetectCorruptedCallDataConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6 },
        .trace = { { AccessType::Read, witness_from_index(0), witness_from_index(1) },
                   { AccessType::Read, witness_from_index(2), witness_from_index(3) },
                   { AccessType::Read, witness_from_index(4), witness_from_index(5) },
                   { AccessType::Read, witness_from_index(6), witness_from_index(7) } },
        .type = BlockType::CallData,
        .calldata_id = CallDataType::Primary,
    };
    AcirFormat constraint_system = build_acir_format(8, block_constraint);
    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    auto& busread_block = builder.blocks.busread;
    bool found_gate = false;
    for (size_t i = 0; i < busread_block.size(); i++) {
        if (busread_block.q_busread()[i] == fr::one() && busread_block.q_1()[i] == fr::one() &&
            busread_block.q_2()[i] == fr::zero() && busread_block.q_3()[i] == fr::zero()) {
            busread_block.q_1().set(i, 6);
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find calldata busread gate to corrupt";
    // Note: CircuitChecker won't catch selector corruption in the busread block.

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}

TEST_F(BlockConstraintsTests, DetectCorruptedReturnDataConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6, 7 },
        .trace = {}, // trace must be empty for return data
        .type = BlockType::ReturnData,
    };
    AcirFormat constraint_system = build_acir_format(8, block_constraint);
    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    auto& busread_block = builder.blocks.busread;
    bool found_gate = false;
    for (size_t i = 0; i < busread_block.size(); i++) {
        if (busread_block.q_busread()[i] == fr::one() && busread_block.q_1()[i] == fr::zero() &&
            busread_block.q_2()[i] == fr::zero() && busread_block.q_3()[i] == fr::one()) {
            busread_block.w_4()[i] = 6;
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find returndata busread gate to corrupt";
    // Note: CircuitChecker won't catch selector corruption in the busread block.

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}
