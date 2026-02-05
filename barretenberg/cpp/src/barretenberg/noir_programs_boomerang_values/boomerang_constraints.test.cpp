#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

/**
 * @brief Test suite for verification of ACIR constraint system for class UltraCircuitBuilder
 * @details Every test creates ACIR constraint system. Then it runs
 * StaticAnalyzerAcir tool that tries to find incorrect opcodes. Some tests corrupt the created by
 * ACIR constraint system circuit in order to check analyzer's ability to detect issues in the circuit
 */

class BoomerangConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Helper to create WitnessOrConstant from index
WitnessOrConstant<fr> witness_from_index(uint32_t idx)
{
    return WitnessOrConstant<fr>::from_index(idx);
}

// Helper to create WitnessOrConstant from constant value
WitnessOrConstant<fr> constant_from_value(uint8_t val)
{
    return WitnessOrConstant<fr>::from_constant(fr(val));
}

/**
 * @brief Test that build_opcode_type_map correctly maps opcode indices to constraint pointers
 * @details Creates a constraint system with XOR and AND logic constraints, then verifies
 *          the reverse mapping from opcode index to constraint pointer works correctly
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMapXorAndCase)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    LogicConstraint and_constraint{
        .a = witness_from_index(3),
        .b = witness_from_index(4),
        .result = 5,
        .num_bits = 32,
        .is_xor_gate = 0,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };
    RangeConstraint range_3{ .witness = 3, .num_bits = 32 };
    RangeConstraint range_4{ .witness = 4, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 5,
        .num_acir_opcodes = 6,
        .public_inputs = {},
        .logic_constraints = { xor_constraint, and_constraint },
        .range_constraints = { range_0, range_1, range_3, range_4 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0, 1 }, .range_constraints = { 2, 3, 4, 5 } },
    };

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 6u);

    size_t xor_count = 0;
    size_t and_count = 0;
    size_t range_count = 0;
    for (const auto& [opcode_idx, constraint_info] : opcode_map) {
        if (constraint_info.type == AcirConstraintType::LOGIC) {
            const auto* logic = std::get<const LogicConstraint*>(constraint_info.ptr);
            if (logic->is_xor_gate) {
                xor_count++;
            } else {
                and_count++;
            }
        } else if (constraint_info.type == AcirConstraintType::RANGE) {
            range_count++;
        }
    }

    EXPECT_EQ(xor_count, 1);
    EXPECT_EQ(and_count, 1);
    EXPECT_EQ(range_count, 4);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test 64-bit logic constraint - verifies accumulation chain with 2 chunks
 * @details 64-bit XOR requires 2 32-bit chunks, testing the accumulation chain tracing
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMap64BitXorCase)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 64,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 64 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 64 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 3u);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

TEST_F(BoomerangConstraintsTests, ValidateROMConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6 },
        .trace = { { AccessType::Read, witness_from_index(0), witness_from_index(1) },
                   { AccessType::Read, witness_from_index(2), witness_from_index(3) },
                   { AccessType::Read, witness_from_index(4), witness_from_index(5) },
                   { AccessType::Read, witness_from_index(6), witness_from_index(7) } },
        .type = BlockType::ROM,
    };

    AcirFormat constraint_system{
        .max_witness_index = 7,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .block_constraints = { block_constraint },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .block_constraints = { { 0 } } },
    };

    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();

    const auto& opcode_map = analyzer.build_opcode_type_map();
    EXPECT_EQ(opcode_map.size(), 1U);
    EXPECT_EQ(opcode_map.at(0).type, AcirConstraintType::BLOCK);

    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(BoomerangConstraintsTests, ValidateRAMConstraint)
{
    BlockConstraint block_constraint{
        .init = { 0, 1, 2, 3, 4, 5, 6 },
        .trace = { { AccessType::Read, witness_from_index(0), witness_from_index(1) },
                   { AccessType::Write, witness_from_index(2), witness_from_index(3) },
                   { AccessType::Read, witness_from_index(4), witness_from_index(5) },
                   { AccessType::Write, witness_from_index(6), witness_from_index(7) } },
        .type = BlockType::RAM,
    };
    AcirFormat constraint_system{
        .max_witness_index = 7,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .block_constraints = { block_constraint },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .block_constraints = { { 0 } } },
    };
    auto witness = WitnessVector{ fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7) };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();

    const auto& opcode_map = analyzer.build_opcode_type_map();
    EXPECT_EQ(opcode_map.size(), 1U);
    EXPECT_EQ(opcode_map.at(0).type, AcirConstraintType::BLOCK);

    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief Test 1-bit logic constraint (boolean XOR)
 * @details 1-bit is the smallest valid num_bits for logic constraints
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMap1BitXorCase)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 1,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 1 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 1 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(1), fr(0), fr(1) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 3U);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test 8-bit logic constraint
 * @details 8-bit AND operation - common for byte-level operations
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMap8BitAndCase)
{
    LogicConstraint and_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 8,
        .is_xor_gate = 0,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 8 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 8 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { and_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(171), fr(205), fr(137) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 3u);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test 128-bit logic constraint - verifies 4 chunk accumulation
 * @details 128 bits = 4 full 32-bit chunks, tests longer accumulation chains
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMap128BitXorCase)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 128,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 128 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 128 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    uint256_t a_val = (uint256_t(0xDEADBEEF) << 96) | (uint256_t(0xCAFEBABE) << 64) | (uint256_t(0x12345678) << 32) |
                      uint256_t(0xAABBCCDD);
    uint256_t b_val = (uint256_t(0x12345678) << 96) | (uint256_t(0x87654321) << 64) | (uint256_t(0xDEADBEEF) << 32) |
                      uint256_t(0x11223344);
    uint256_t result_val = a_val ^ b_val;

    WitnessVector witness = { fr(a_val), fr(b_val), fr(result_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 3u);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test mixed logic constraints with different valid bit widths
 * @details Combines 8-bit XOR, 32-bit AND, and 64-bit XOR to verify independent processing
 *          Valid num_bits: 1, 8, 32, 64, 128
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMapMixedBitWidths)
{
    LogicConstraint xor_8{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 8,
        .is_xor_gate = 1,
    };
    LogicConstraint and_32{
        .a = witness_from_index(3),
        .b = witness_from_index(4),
        .result = 5,
        .num_bits = 32,
        .is_xor_gate = 0,
    };
    LogicConstraint xor_64{
        .a = witness_from_index(6),
        .b = witness_from_index(7),
        .result = 8,
        .num_bits = 64,
        .is_xor_gate = 1,
    };

    RangeConstraint range_0{ .witness = 0, .num_bits = 8 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 8 };
    RangeConstraint range_3{ .witness = 3, .num_bits = 32 };
    RangeConstraint range_4{ .witness = 4, .num_bits = 32 };
    RangeConstraint range_6{ .witness = 6, .num_bits = 64 };
    RangeConstraint range_7{ .witness = 7, .num_bits = 64 };

    AcirFormat constraint_system{
        .max_witness_index = 8,
        .num_acir_opcodes = 9,
        .public_inputs = {},
        .logic_constraints = { xor_8, and_32, xor_64 },
        .range_constraints = { range_0, range_1, range_3, range_4, range_6, range_7 },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0, 1, 2 },
                                                                    .range_constraints = { 3, 4, 5, 6, 7, 8 } },
    };

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 9U);

    size_t logic_count = 0;
    size_t range_count = 0;
    for (const auto& [opcode_idx, constraint_info] : opcode_map) {
        if (constraint_info.type == AcirConstraintType::LOGIC) {
            logic_count++;
        } else if (constraint_info.type == AcirConstraintType::RANGE) {
            range_count++;
        }
    }

    EXPECT_EQ(logic_count, 3U);
    EXPECT_EQ(range_count, 6U);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test logic constraint with one constant operand (32-bit)
 * @details When b is constant, chunks are still witness variables but derived from constant
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMapConstantOperand32Bit)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = constant_from_value(42), // Constant operand
        .result = 1,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 1,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1 } },
    };

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 2u);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test 1-bit logic constraint with one constant operand
 * @details Boolean XOR with one constant operand
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMapConstantOperand1Bit)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = constant_from_value(1), // Constant operand
        .result = 1,
        .num_bits = 1,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 1 };

    AcirFormat constraint_system{
        .max_witness_index = 1,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1 } },
    };

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 2u);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test 8-bit logic constraint with one constant operand
 * @details Byte-level AND with one constant operand
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMapConstantOperand8Bit)
{
    LogicConstraint and_constraint{
        .a = witness_from_index(0),
        .b = constant_from_value(0xFF), // Constant operand (all bits set)
        .result = 1,
        .num_bits = 8,
        .is_xor_gate = 0,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 8 };

    AcirFormat constraint_system{
        .max_witness_index = 1,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { and_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1 } },
    };

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 2u);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test 64-bit logic constraint with one constant operand
 * @details 64-bit XOR with one constant, tests multi-chunk with constant
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMapConstantOperand64Bit)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = constant_from_value(123), // Constant operand
        .result = 1,
        .num_bits = 64,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 64 };

    AcirFormat constraint_system{
        .max_witness_index = 1,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1 } },
    };

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 2u);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

/**
 * @brief Test 128-bit logic constraint with one constant operand
 * @details 128-bit AND with one constant, tests 4-chunk accumulation with constant
 */
TEST_F(BoomerangConstraintsTests, OpcodeTypeMapConstantOperand128Bit)
{
    LogicConstraint and_constraint{
        .a = witness_from_index(0),
        .b = constant_from_value(255), // Constant operand
        .result = 1,
        .num_bits = 128,
        .is_xor_gate = 0,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 128 };

    AcirFormat constraint_system{
        .max_witness_index = 1,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { and_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1 } },
    };

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 2u);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(opcodes.empty());
}

// =====================================================================================
// Tests for detecting incorrect/corrupted gate implementations
// These tests create valid circuits, corrupt specific selectors, and verify detection
// =====================================================================================

/**
 * @brief Test that corrupting a 1-bit range constraint's boolean gate q_m selector is detected
 * @details A 1-bit range constraint creates a boolean gate with specific selectors:
 *          q_arith=1, q_m=1, q_1=-1, q_2=0, q_3=0, q_4=0, q_c=0
 *          Corrupting q_m from 1 to 0 should cause the constraint to fail validation
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedBooleanGate_qm)
{
    // Create a simple 1-bit range constraint
    RangeConstraint range_1bit{ .witness = 0, .num_bits = 1 };

    AcirFormat constraint_system{
        .max_witness_index = 0,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .range_constraints = { range_1bit },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .range_constraints = { 0 } },
    };

    // Build circuit normally
    WitnessVector witness = { fr(1) }; // Valid boolean value
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Find the boolean gate in the arithmetic block and corrupt q_m selector
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_m()[i] == fr::one() && arith_block.q_1()[i] == fr(-1)) {
            // Found the boolean gate, corrupt q_m
            arith_block.q_m().set(i, fr::zero()); // Change from 1 to 0
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find boolean gate to corrupt";

    // Create analyzer with corrupted builder - need a copy of constraint_system
    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    // The range constraint opcode (index 0) should be detected as incorrect
    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a 1-bit range constraint's boolean gate q_arith selector is detected
 * @details Corrupting q_arith from 1 to 0 should cause the constraint to fail validation
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedBooleanGate_qArith)
{
    RangeConstraint range_1bit{ .witness = 0, .num_bits = 1 };

    AcirFormat constraint_system{
        .max_witness_index = 0,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .range_constraints = { range_1bit },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .range_constraints = { 0 } },
    };

    WitnessVector witness = { fr(1) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Find and corrupt q_arith selector
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_m()[i] == fr::one() && arith_block.q_1()[i] == fr(-1)) {
            arith_block.q_arith().set(i, fr::zero()); // Change from 1 to 0
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find boolean gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a 1-bit range constraint's boolean gate q_1 selector is detected
 * @details Corrupting q_1 from -1 to 0 should cause the constraint to fail validation
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedBooleanGate_q1)
{
    RangeConstraint range_1bit{ .witness = 0, .num_bits = 1 };

    AcirFormat constraint_system{
        .max_witness_index = 0,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .range_constraints = { range_1bit },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .range_constraints = { 0 } },
    };

    WitnessVector witness = { fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_m()[i] == fr::one() && arith_block.q_1()[i] == fr(-1)) {
            arith_block.q_1().set(i, fr::zero()); // Change from -1 to 0
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find boolean gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a small range constraint by removing witness from range_lists is detected
 * @details For num_bits <= 14, range constraints use range_lists. Removing the witness should fail validation.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedSmallRangeConstraint)
{
    RangeConstraint range_8bit{ .witness = 0, .num_bits = 8 };

    AcirFormat constraint_system{
        .max_witness_index = 0,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .range_constraints = { range_8bit },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .range_constraints = { 0 } },
    };

    WitnessVector witness = { fr(200) }; // Valid 8-bit value
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt by clearing the range_lists entry for this range
    uint64_t target_range = (1ULL << 8) - 1; // 255
    auto it = builder.range_lists.find(target_range);
    if (it != builder.range_lists.end()) {
        it->second.variable_indices.clear();
    }

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a large range constraint's decompose chain is detected
 * @details For num_bits > 14, range constraints use decompose chains with specific selector patterns.
 *          The q_1, q_2, q_3 selectors must satisfy: is_power_of_two && q_2^2 == q_1 * q_3
 *          Corrupting q_1 should break this validation.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedLargeRangeConstraint_DecomposeChain)
{
    // 32-bit range requires decompose chain (> 14 bits)
    RangeConstraint range_32bit{ .witness = 0, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 0,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .range_constraints = { range_32bit },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .range_constraints = { 0 } },
    };

    WitnessVector witness = { fr(1000000) }; // Valid 32-bit value
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Find and corrupt the decompose chain's q_1 selector in arithmetic block
    // The decompose chain uses big_add gates with specific selector patterns
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;

    auto is_power_two = [](const fr& val) {
        uint256_t num = val;
        return num > 0 && ((num & (num - 1)) == 0);
    };

    for (size_t i = 0; i < arith_block.size(); i++) {
        auto q_1 = arith_block.q_1()[i];
        auto q_2 = arith_block.q_2()[i];
        auto q_3 = arith_block.q_3()[i];
        // Look for decompose chain gates (power-of-two pattern)
        if (is_power_two(q_1) && is_power_two(q_2) && is_power_two(q_3) && (q_2 * q_2 == q_1 * q_3)) {
            // Corrupt q_1 to break the power-of-two pattern
            arith_block.q_1().set(i, fr(3)); // 3 is not a power of 2
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find decompose chain gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a large range constraint's sublimb range_list is detected
 * @details Decompose chains create sublimbs that must be in range_lists. Removing them should fail.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedLargeRangeConstraint_SublimbRangeList)
{
    RangeConstraint range_32bit{ .witness = 0, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 0,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .range_constraints = { range_32bit },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .range_constraints = { 0 } },
    };

    WitnessVector witness = { fr(1000000) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt by clearing the default sublimb range_list (14-bit range)
    constexpr uint64_t default_sublimb_range = (1ULL << 14) - 1; // 16383
    auto it = builder.range_lists.find(default_sublimb_range);
    if (it != builder.range_lists.end()) {
        it->second.variable_indices.clear();
    }

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

// =====================================================================================
// Logic constraint corruption tests
// =====================================================================================

/**
 * @brief Test that corrupting a 32-bit XOR constraint's lookup table selector is detected
 * @details Logic constraints use plookup tables. The q_3 selector in lookup block holds the table index.
 *          Corrupting it should cause validation to fail.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedXorConstraint_LookupTableSelector)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(100), fr(200), fr(100 ^ 200) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt by disabling the lookup gate (set q_lookup to 0)
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            // Disable the lookup gate
            lookup_block.q_lookup().set(i, fr::zero());
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a 32-bit AND constraint's lookup table selector is detected
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedAndConstraint_LookupTableSelector)
{
    LogicConstraint and_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 0,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { and_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(100), fr(200), fr(100 & 200) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt by disabling the lookup gate (set q_lookup to 0)
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.q_lookup().set(i, fr::zero());
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_3 selector (table index) in lookup gate is detected
 * @details q_3 in the lookup block holds the table index. Changing it to an invalid value
 *          should cause the analyzer to detect the corruption.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedLookup_q3_TableIndex)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(100), fr(200), fr(100 ^ 200) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt q_3 (table index) by changing it to a different value
    // This should make the analyzer think it's using a different (wrong) lookup table
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            // Change the table index to point to a different table (e.g., AND instead of XOR)
            fr original_q3 = lookup_block.q_3()[i];
            lookup_block.q_3().set(i, original_q3 + fr::one());
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_l (left input wire) in lookup gate is detected
 * @details w_l holds the first input to the lookup. Corrupting it should break
 *          the connection between the constraint's input and the lookup.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedLookup_wl_InputWire)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(100), fr(200), fr(100 ^ 200) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt w_l in the lookup gate
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.w_l()[i] = builder.zero_idx();
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_r (right input wire) in lookup gate is detected
 * @details w_r holds the second input to the lookup. Corrupting it should break
 *          the connection between the constraint's input and the lookup.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedLookup_wr_InputWire)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(100), fr(200), fr(100 ^ 200) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt w_r in the lookup gate
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.w_r()[i] = builder.zero_idx();
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_o (output wire) in lookup gate is detected
 * @details w_o holds the result of the lookup. Corrupting it should break
 *          the connection between the lookup result and the constraint's output.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedLookup_wo_OutputWire)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(100), fr(200), fr(100 ^ 200) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt w_o in the lookup gate
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.w_o()[i] = builder.zero_idx();
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that we can correctly find the accumulation gate using the result witness index
 * @details For 64-bit logic, verify that we can locate the accumulation gate by tracing
 *          from the ACIR result witness through the builder's variable mapping.
 */
TEST_F(BoomerangConstraintsTests, FindAccumulationGateFromResultWitness)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 64,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 64 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 64 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    uint64_t a_val = (1ULL << 32) + 100;
    uint64_t b_val = (2ULL << 32) + 200;
    WitnessVector witness = { fr(a_val), fr(b_val), fr(a_val ^ b_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // The ACIR witness index IS the builder variable index directly
    // (UltraCircuitBuilder constructor adds witnesses first, then zero_idx)
    uint32_t result_var_idx = xor_constraint.result;
    uint32_t real_result_idx = builder.real_variable_index[result_var_idx];

    // Find the accumulation gate where w_o corresponds to the result variable
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    size_t found_gate_idx = 0;

    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_arith()[i] == fr::one() && arith_block.q_m()[i] == fr::zero()) {
            uint32_t w_o_idx = arith_block.w_o()[i];
            uint32_t w_o_real = builder.real_variable_index[w_o_idx];
            if (w_o_real == real_result_idx) {
                found_gate_idx = i;
                found_gate = true;
                break;
            }
        }
    }

    EXPECT_TRUE(found_gate) << "Should find accumulation gate for result witness";

    // Verify the gate has the expected structure for accumulation: result = chunk * scale + prev
    // w_o = result, w_l = prev_result (or first chunk), w_r = current_chunk
    if (found_gate) {
        uint32_t w_l = arith_block.w_l()[found_gate_idx];
        uint32_t w_r = arith_block.w_r()[found_gate_idx];
        // The gate should have non-trivial wires (not just constants)
        EXPECT_NE(w_l, builder.zero_idx());
        EXPECT_NE(w_r, builder.zero_idx());
    }
}

/**
 * @brief Test that corrupting a 64-bit XOR constraint's accumulation chain is detected
 * @details 64-bit logic requires 2 chunks with accumulation. Corrupting the accumulation
 *          gate's output wire should break the chain tracing.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedXorConstraint_64bit_AccumulationChain)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 64,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 64 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 64 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    // Use actual 64-bit values that span both 32-bit chunks
    uint64_t a_val = (1ULL << 32) + 100; // High bits: 1, Low bits: 100
    uint64_t b_val = (2ULL << 32) + 200; // High bits: 2, Low bits: 200
    WitnessVector witness = { fr(a_val), fr(b_val), fr(a_val ^ b_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Find the accumulation gate using the result witness index
    // The ACIR witness index IS the builder variable index directly
    uint32_t result_var_idx = xor_constraint.result;
    uint32_t real_result_idx = builder.real_variable_index[result_var_idx];

    // Find the accumulation gate where w_o corresponds to the result variable
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    size_t gate_to_corrupt = 0;

    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_arith()[i] == fr::one() && arith_block.q_m()[i] == fr::zero()) {
            uint32_t w_o_idx = arith_block.w_o()[i];
            if (builder.real_variable_index[w_o_idx] == real_result_idx) {
                gate_to_corrupt = i;
                found_gate = true;
                break;
            }
        }
    }

    ASSERT_TRUE(found_gate) << "Could not find accumulation gate for result variable";
    arith_block.w_o()[gate_to_corrupt] = builder.zero_idx();

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a 128-bit XOR constraint's lookup selector is detected
 * @details 128-bit requires 4 chunks. Corrupting the q_lookup selector should fail validation.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedXorConstraint_128bit_LookupSelector)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 128,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 128 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 128 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    // Use smaller values that fit in fr
    WitnessVector witness = { fr(300), fr(400), fr(300 ^ 400) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt q_lookup selector
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.q_lookup().set(i, fr::zero()); // Disable the lookup
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a logic constraint with constant operand is detected
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedXorConstraint_ConstantOperand)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = constant_from_value(66),
        .result = 1,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 1,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1 } },
    };

    WitnessVector witness = { fr(500), fr(500 ^ 66) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt by disabling the lookup gate
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.q_lookup().set(i, fr::zero());
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test detection when multiple constraints have corruptions
 * @details Create a circuit with multiple constraints and corrupt several of them.
 *          Verify that all corrupted opcodes are detected.
 */
TEST_F(BoomerangConstraintsTests, DetectMultipleCorruptedConstraints)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };
    RangeConstraint range_bool{ .witness = 3, .num_bits = 1 };

    AcirFormat constraint_system{
        .max_witness_index = 3,
        .num_acir_opcodes = 4,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1, range_bool },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2, 3 } },
    };

    WitnessVector witness = { fr(100), fr(200), fr(100 ^ 200), fr(1) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt the XOR constraint's lookup gate
    auto& lookup_block = builder.blocks.lookup;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.q_lookup().set(i, fr::zero());
            break;
        }
    }

    // Corrupt the boolean constraint's gate
    auto& arith_block = builder.blocks.arithmetic;
    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_m()[i] == fr::one() && arith_block.q_1()[i] == fr(-1)) {
            arith_block.q_m().set(i, fr::zero());
            break;
        }
    }

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    // Both the XOR constraint (opcode 0) and boolean range constraint (opcode 3) should be detected
    EXPECT_GE(incorrect_opcodes.size(), 2u);
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0); // XOR constraint
    EXPECT_TRUE(incorrect_opcodes.count(3) > 0); // Boolean range constraint
}

/**
 * @brief Test that an uncorrupted circuit with mixed constraints passes validation
 * @details Sanity check to ensure our detection doesn't have false positives
 */
TEST_F(BoomerangConstraintsTests, ValidCircuitPassesValidation)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    LogicConstraint and_constraint{
        .a = witness_from_index(3),
        .b = witness_from_index(4),
        .result = 5,
        .num_bits = 32,
        .is_xor_gate = 0,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };
    RangeConstraint range_3{ .witness = 3, .num_bits = 32 };
    RangeConstraint range_4{ .witness = 4, .num_bits = 32 };
    RangeConstraint range_bool{ .witness = 6, .num_bits = 1 };
    RangeConstraint range_8bit{ .witness = 7, .num_bits = 8 };

    AcirFormat constraint_system{
        .max_witness_index = 7,
        .num_acir_opcodes = 8,
        .public_inputs = {},
        .logic_constraints = { xor_constraint, and_constraint },
        .range_constraints = { range_0, range_1, range_3, range_4, range_bool, range_8bit },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0, 1 }, .range_constraints = { 2, 3, 4, 5, 6, 7 } },
    };

    WitnessVector witness = { fr(100), fr(200), fr(100 ^ 200), fr(300), fr(400), fr(300 & 400), fr(1), fr(150) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Don't corrupt anything - circuit should be valid
    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    // All constraints should pass validation
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that recover_chunks_from_lookups correctly recovers a_chunk and b_chunk
 * @details Creates a 32-bit XOR constraint, finds the first lookup gate,
 *          and verifies that the recovered values match the original inputs.
 */
TEST_F(BoomerangConstraintsTests, RecoverChunksFromLookups_32BitXor)
{
    // Use distinct non-zero values for a and b
    uint32_t a_val = 0xDEADBEEF;
    uint32_t b_val = 0xCAFEBABE;

    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(a_val), fr(b_val), fr(a_val ^ b_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Find the first lookup gate (where q_lookup == 1)
    auto& lookup_block = builder.blocks.lookup;
    size_t first_lookup_gate = 0;
    bool found = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            first_lookup_gate = i;
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "Could not find any lookup gate";

    // Get the multi_table for XOR
    const auto& multi_table = bb::plookup::get_multitable(bb::plookup::MultiTableId::UINT32_XOR);

    // Create analyzer and call recover_chunks_from_lookups
    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));

    auto [recovered_a, recovered_b] = analyzer.recover_chunks_from_lookups(multi_table, first_lookup_gate);

    // The function recovers from gates 1-5, so the bottom 6 bits are lost
    // Compare with original values masked to clear bottom 6 bits
    constexpr uint256_t mask = ~uint256_t(0x3F);
    EXPECT_EQ(recovered_a, uint256_t(a_val) & mask) << "Recovered a_chunk doesn't match original (masked)";
    EXPECT_EQ(recovered_b, uint256_t(b_val) & mask) << "Recovered b_chunk doesn't match original (masked)";
}

/**
 * @brief Test recover_chunks_from_lookups with 8-bit AND constraint
 */
TEST_F(BoomerangConstraintsTests, RecoverChunksFromLookups_8BitAnd)
{
    uint32_t a_val = 0xAB;
    uint32_t b_val = 0xCD;

    LogicConstraint and_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 8,
        .is_xor_gate = 0,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 8 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 8 };

    AcirFormat constraint_system{
        .max_witness_index = 2,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { and_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .logic_constraints = { 0 }, .range_constraints = { 1, 2 } },
    };

    WitnessVector witness = { fr(a_val), fr(b_val), fr(a_val & b_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    auto& lookup_block = builder.blocks.lookup;
    size_t first_lookup_gate = 0;
    bool found = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            first_lookup_gate = i;
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "Could not find any lookup gate";

    const auto& multi_table = bb::plookup::get_multitable(bb::plookup::MultiTableId::UINT32_AND);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));

    auto [recovered_a, recovered_b] = analyzer.recover_chunks_from_lookups(multi_table, first_lookup_gate);

    // The function recovers from gates 1-5, so the bottom 6 bits are lost
    // Compare with original values masked to clear bottom 6 bits
    constexpr uint256_t mask = ~uint256_t(0x3F);
    EXPECT_EQ(recovered_a, uint256_t(a_val) & mask) << "Recovered a_chunk doesn't match original (masked)";
    EXPECT_EQ(recovered_b, uint256_t(b_val) & mask) << "Recovered b_chunk doesn't match original (masked)";
}
