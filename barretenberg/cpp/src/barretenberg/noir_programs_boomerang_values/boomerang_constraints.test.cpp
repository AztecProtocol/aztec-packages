#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
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
 * StaticAnalyzerAcir tool that tries to find incorrect opcodes. Some tests corrupt the created
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

// Helper to build AcirFormat from individual constraints through the full ACIR serde flow
template <typename... Constraints>
AcirFormat build_acir_format(uint32_t max_witness_index, const Constraints&... constraints)
{
    std::vector<Acir::Opcode> opcodes;
    auto collect = [&opcodes](const auto& constraint) {
        auto ops = constraint_to_acir_opcode(constraint);
        opcodes.insert(opcodes.end(), ops.begin(), ops.end());
    };
    (collect(constraints), ...);
    (void)max_witness_index; // No longer needed by build_acir_circuit
    return circuit_serde_to_acir_format(build_acir_circuit(opcodes));
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

    auto constraint_system = build_acir_format(5, xor_constraint, and_constraint, range_0, range_1, range_3, range_4);

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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

    auto constraint_system = build_acir_format(2, and_constraint, range_0, range_1);

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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

    auto constraint_system =
        build_acir_format(8, xor_8, and_32, xor_64, range_0, range_1, range_3, range_4, range_6, range_7);

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

    auto constraint_system = build_acir_format(1, xor_constraint, range_0);

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

    auto constraint_system = build_acir_format(1, xor_constraint, range_0);

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

    auto constraint_system = build_acir_format(1, and_constraint, range_0);

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

    auto constraint_system = build_acir_format(1, xor_constraint, range_0);

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

    auto constraint_system = build_acir_format(1, and_constraint, range_0);

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

    auto constraint_system = build_acir_format(0, range_1bit);

    // Build circuit normally
    WitnessVector witness = { fr(1) }; // Valid boolean value
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Find the boolean gate in the arithmetic block and corrupt q_m selector
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size(); i++) {
        // Found the boolean gate, corrupt q_m
    }
    ASSERT_TRUE(found_gate) << "Could not find boolean gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

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

    auto constraint_system = build_acir_format(0, range_1bit);

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
    // Note: CircuitChecker still passes because disabling q_arith makes the gate trivially satisfied

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

    auto constraint_system = build_acir_format(0, range_1bit);

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
    // Note: CircuitChecker still passes because w=0 satisfies w^2=0 (the corrupted relation)

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

    auto constraint_system = build_acir_format(0, range_8bit);

    WitnessVector witness = { fr(200) }; // Valid 8-bit value
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt by clearing the range_lists entry for this range
    // Note: CircuitChecker::check won't detect range_list corruption since it only validates gate arithmetic
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

    auto constraint_system = build_acir_format(0, range_32bit);

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
    EXPECT_FALSE(CircuitChecker::check(builder));

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

    auto constraint_system = build_acir_format(0, range_32bit);

    WitnessVector witness = { fr(1000000) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt by clearing the default sublimb range_list (14-bit range)
    // Note: CircuitChecker::check won't detect range_list corruption since it only validates gate arithmetic
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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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
    // Note: CircuitChecker still passes because disabling q_lookup makes the lookup trivially satisfied

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

    auto constraint_system = build_acir_format(2, and_constraint, range_0, range_1);

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
    // Note: CircuitChecker still passes because disabling q_lookup makes the lookup trivially satisfied

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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
    EXPECT_FALSE(CircuitChecker::check(builder));

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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
    EXPECT_FALSE(CircuitChecker::check(builder));

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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
    // Gate equation: q_1 * w_l + q_2 * w_r + q_3 * w_o + q_4 * w_4 + q_c = 0
    // For accumulation: w_o = w_l + scale * w_r, so q_1 and q_2 should be non-zero
    if (found_gate) {
        uint32_t w_l = arith_block.w_l()[found_gate_idx];
        uint32_t w_r = arith_block.w_r()[found_gate_idx];
        fr q_1 = arith_block.q_1()[found_gate_idx];
        fr q_2 = arith_block.q_2()[found_gate_idx];
        fr q_3 = arith_block.q_3()[found_gate_idx];

        // The gate should have non-trivial wires (not just constants)
        EXPECT_NE(w_l, builder.zero_idx());
        EXPECT_NE(w_r, builder.zero_idx());

        // Accumulation gate selectors: q_1 and q_2 must be non-zero for the linear combination
        EXPECT_NE(q_1, fr::zero()) << "q_1 should be non-zero for accumulation gate";
        EXPECT_NE(q_2, fr::zero()) << "q_2 should be non-zero for accumulation gate";
        // q_3 should be the negative output selector (typically -1)
        EXPECT_EQ(q_3, fr(-1)) << "q_3 should be -1 for the output wire in accumulation gate";
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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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
    EXPECT_FALSE(CircuitChecker::check(builder));

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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
    // Note: CircuitChecker still passes because disabling q_lookup makes the lookup trivially satisfied

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

    auto constraint_system = build_acir_format(1, xor_constraint, range_0);

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
    // Note: CircuitChecker still passes because disabling q_lookup makes the lookup trivially satisfied

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

    auto constraint_system = build_acir_format(3, xor_constraint, range_0, range_1, range_bool);

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
    EXPECT_FALSE(CircuitChecker::check(builder));

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

    auto constraint_system = build_acir_format(
        7, xor_constraint, and_constraint, range_0, range_1, range_3, range_4, range_bool, range_8bit);

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

// =====================================================================================
// Edge case tests
// =====================================================================================

/**
 * @brief Test 14-bit range constraint (exact boundary for range_lists vs decompose_chain)
 * @details DEFAULT_PLOOKUP_RANGE_BITNUM = 14, so 14-bit range uses the range_lists path.
 *          This is the largest bit width handled by the small range path.
 */
TEST_F(BoomerangConstraintsTests, RangeConstraint_14Bit_BoundaryThreshold)
{
    RangeConstraint range_14bit{ .witness = 0, .num_bits = 14 };

    auto constraint_system = build_acir_format(0, range_14bit);

    WitnessVector witness = { fr((1ULL << 14) - 1) }; // Max 14-bit value: 16383
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test 15-bit range constraint (just over the boundary, uses decompose_chain)
 * @details 15 bits > DEFAULT_PLOOKUP_RANGE_BITNUM (14), so this triggers the decompose chain path.
 *          This is the smallest bit width that requires decomposition.
 */
TEST_F(BoomerangConstraintsTests, RangeConstraint_15Bit_DecomposeChain)
{
    RangeConstraint range_15bit{ .witness = 0, .num_bits = 15 };

    auto constraint_system = build_acir_format(0, range_15bit);

    WitnessVector witness = { fr((1ULL << 15) - 1) }; // Max 15-bit value: 32767
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test range constraints with zero witness value across multiple bit widths
 * @details Zero is always a valid value for any range constraint. Tests 1-bit, 8-bit, and 32-bit.
 */
TEST_F(BoomerangConstraintsTests, RangeConstraint_ZeroWitnessValue)
{
    RangeConstraint range_1bit{ .witness = 0, .num_bits = 1 };
    RangeConstraint range_8bit{ .witness = 1, .num_bits = 8 };
    RangeConstraint range_32bit{ .witness = 2, .num_bits = 32 };

    auto constraint_system = build_acir_format(2, range_1bit, range_8bit, range_32bit);

    WitnessVector witness = { fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test 32-bit logic constraint with maximum values (0xFFFFFFFF)
 * @details XOR of max values yields 0, AND of max values yields max.
 *          Tests that the analyzer handles boundary values correctly.
 */
TEST_F(BoomerangConstraintsTests, LogicConstraint_MaxValues_32Bit)
{
    uint32_t max_val = 0xFFFFFFFF;

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

    auto constraint_system = build_acir_format(5, xor_constraint, and_constraint, range_0, range_1, range_3, range_4);

    // XOR: max ^ max = 0, AND: max & max = max
    WitnessVector witness = { fr(max_val), fr(max_val), fr(0), fr(max_val), fr(max_val), fr(max_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test 8-bit range constraint with maximum value (255)
 * @details Verifies the analyzer handles the maximum valid value at the upper boundary.
 */
TEST_F(BoomerangConstraintsTests, RangeConstraint_MaxValue_8Bit)
{
    RangeConstraint range_8bit{ .witness = 0, .num_bits = 8 };

    auto constraint_system = build_acir_format(0, range_8bit);

    WitnessVector witness = { fr(255) }; // Max 8-bit value
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test logic constraint with both operands as constants
 * @details When both a and b are constants, create_logic_constraint computes the result
 *          directly without creating lookup gates. The analyzer should handle this gracefully.
 */
TEST_F(BoomerangConstraintsTests, LogicConstraint_BothOperandsConstant)
{
    LogicConstraint xor_constraint{
        .a = constant_from_value(42),
        .b = constant_from_value(99),
        .result = 0,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    auto constraint_system = build_acir_format(0, xor_constraint);

    WitnessVector witness = { fr(42 ^ 99) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

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

    // Recovery from gates 1-5 always loses the bottom 6 bits (gate 0 has full values but is skipped).
    // For 32-bit values this preserves 26 of 32 bits, providing strong verification.
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

    auto constraint_system = build_acir_format(2, and_constraint, range_0, range_1);

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

    // Recovery from gates 1-5 always loses the bottom 6 bits (gate 0 has full values but is skipped).
    // For 8-bit values, this leaves only the top 2 bits, making the comparison weaker:
    //   0xAB (10101011) & ~0x3F = 0x80 (10000000)
    //   0xCD (11001101) & ~0x3F = 0xC0 (11000000)
    // This is inherent to the UINT32 lookup gate structure (6 gates: gate 0 = full, gates 1-5 = sliced).
    constexpr uint256_t mask = ~uint256_t(0x3F);
    EXPECT_EQ(recovered_a, uint256_t(0x80)) << "Recovered a_chunk should be 0xAB with bottom 6 bits cleared";
    EXPECT_EQ(recovered_b, uint256_t(0xC0)) << "Recovered b_chunk should be 0xCD with bottom 6 bits cleared";
    EXPECT_EQ(recovered_a, uint256_t(a_val) & mask);
    EXPECT_EQ(recovered_b, uint256_t(b_val) & mask);
}

// =====================================================================================
// Additional corruption tests
// =====================================================================================

/**
 * @brief Test that corrupting a 128-bit XOR constraint's accumulation chain is detected
 * @details 128-bit logic requires 4 chunks with a longer accumulation chain.
 *          Corrupting the accumulation gate's w_o wire should break the chain tracing.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedXorConstraint_128bit_AccumulationChain)
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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

    uint256_t a_val = (uint256_t(0xDEADBEEF) << 96) | (uint256_t(0xCAFEBABE) << 64) | (uint256_t(0x12345678) << 32) |
                      uint256_t(0xAABBCCDD);
    uint256_t b_val = (uint256_t(0x12345678) << 96) | (uint256_t(0x87654321) << 64) | (uint256_t(0xDEADBEEF) << 32) |
                      uint256_t(0x11223344);
    uint256_t result_val = a_val ^ b_val;

    WitnessVector witness = { fr(a_val), fr(b_val), fr(result_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Find the accumulation gate using the result witness index
    uint32_t result_var_idx = xor_constraint.result;
    uint32_t real_result_idx = builder.real_variable_index[result_var_idx];

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

    ASSERT_TRUE(found_gate) << "Could not find accumulation gate for 128-bit result variable";
    arith_block.w_o()[gate_to_corrupt] = builder.zero_idx();
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting an intermediate accumulation gate (not the final one) is detected
 * @details For 128-bit logic with 4 chunks, the accumulation chain has 3 gates.
 *          We trace the chain from the result (same as the analyzer does) to find
 *          an intermediate gate, then corrupt it and verify the analyzer detects it.
 *          Note: 64-bit (2 chunks) only has a single accumulation gate, so we need 128-bit.
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedXorConstraint_128bit_IntermediateAccumGate)
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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

    uint256_t a_val = (uint256_t(0xDEADBEEF) << 96) | (uint256_t(0xCAFEBABE) << 64) | (uint256_t(0x12345678) << 32) |
                      uint256_t(0xAABBCCDD);
    uint256_t b_val = (uint256_t(0x12345678) << 96) | (uint256_t(0x87654321) << 64) | (uint256_t(0xDEADBEEF) << 32) |
                      uint256_t(0x11223344);
    uint256_t result_val = a_val ^ b_val;

    WitnessVector witness = { fr(a_val), fr(b_val), fr(result_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Trace the accumulation chain from the result (same way the analyzer does)
    // to find the actual logic accumulation gates, not decompose chain gates.
    // For 128-bit (4 chunks), there are 3 accumulation gates in the chain.
    uint32_t current_res = builder.real_variable_index[xor_constraint.result];
    auto& arith_block = builder.blocks.arithmetic;
    std::vector<size_t> chain_gate_indices;

    for (size_t step = 0; step < 3; step++) { // 4 chunks = 3 accumulation gates
        bool found = false;
        for (size_t i = 0; i < arith_block.size(); i++) {
            if (arith_block.q_arith()[i] == fr::one() && arith_block.q_m()[i] == fr::zero()) {
                if (builder.real_variable_index[arith_block.w_o()[i]] == current_res) {
                    chain_gate_indices.push_back(i);
                    current_res = builder.real_variable_index[arith_block.w_l()[i]];
                    found = true;
                    break;
                }
            }
        }
        if (!found) {
            break;
        }
    }

    // We need at least 2 gates: the final one and at least one intermediate
    ASSERT_GE(chain_gate_indices.size(), 2u) << "Need at least 2 accumulation gates in the chain";

    // Corrupt the second gate in the chain (an intermediate gate, not the final result gate)
    size_t gate_to_corrupt = chain_gate_indices[1];
    arith_block.w_o()[gate_to_corrupt] = builder.zero_idx();
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting both a lookup gate and an accumulation gate is detected
 * @details Corrupts two different types of gates within the same constraint to verify
 *          the analyzer detects at least one corruption (early termination is acceptable).
 */
TEST_F(BoomerangConstraintsTests, DetectCorruptedXorConstraint_MultipleLookupGatesCorrupted)
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

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

    uint64_t a_val = (1ULL << 32) + 100;
    uint64_t b_val = (2ULL << 32) + 200;
    WitnessVector witness = { fr(a_val), fr(b_val), fr(a_val ^ b_val) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corruption 1: Disable the first lookup gate
    auto& lookup_block = builder.blocks.lookup;
    bool found_lookup = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.q_lookup().set(i, fr::zero());
            found_lookup = true;
            break;
        }
    }
    ASSERT_TRUE(found_lookup) << "Could not find lookup gate to corrupt";

    // Corruption 2: Corrupt the accumulation gate's output wire
    uint32_t result_var_idx = xor_constraint.result;
    uint32_t real_result_idx = builder.real_variable_index[result_var_idx];

    auto& arith_block = builder.blocks.arithmetic;
    bool found_accum = false;
    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_arith()[i] == fr::one() && arith_block.q_m()[i] == fr::zero()) {
            uint32_t w_o_idx = arith_block.w_o()[i];
            if (builder.real_variable_index[w_o_idx] == real_result_idx) {
                arith_block.w_o()[i] = builder.zero_idx();
                found_accum = true;
                break;
            }
        }
    }
    ASSERT_TRUE(found_accum) << "Could not find accumulation gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    // The XOR constraint (opcode 0) should be detected as incorrect
    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a 14-bit range constraint's range_list is detected at the exact boundary
 * @details 14-bit is exactly DEFAULT_PLOOKUP_RANGE_BITNUM, the threshold between range_lists and
 *          decompose_chain paths in the analyzer's process_range_constraints. This verifies
 *          the analyzer correctly validates range_list membership at the threshold boundary,
 *          where a off-by-one error could route the constraint to the wrong validation path.
 */
TEST_F(BoomerangConstraintsTests, DetectCorrupted_14Bit_BoundaryThreshold_RangeList)
{
    RangeConstraint range_14bit{ .witness = 0, .num_bits = 14 };

    auto constraint_system = build_acir_format(0, range_14bit);

    WitnessVector witness = { fr((1ULL << 14) - 1) }; // Max 14-bit value: 16383
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt by clearing the range_lists entry for the 14-bit range.
    // Note: CircuitChecker won't detect range_list corruption since it only validates gate arithmetic
    uint64_t target_range = (1ULL << 14) - 1; // 16383
    auto it = builder.range_lists.find(target_range);
    ASSERT_NE(it, builder.range_lists.end()) << "14-bit range_list should exist";
    it->second.variable_indices.clear();

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting a 15-bit range constraint's decompose chain is detected
 * @details 15 bits is just over DEFAULT_PLOOKUP_RANGE_BITNUM (14), triggering the decompose chain
 *          path with the minimal chain length (2 limbs: one 14-bit, one 1-bit). This verifies
 *          the analyzer's validate_decompose_chain works for the shortest possible chain, where
 *          the structure (num_limbs, num_limb_triples) is at its minimum.
 */
TEST_F(BoomerangConstraintsTests, DetectCorrupted_15Bit_DecomposeChain)
{
    RangeConstraint range_15bit{ .witness = 0, .num_bits = 15 };

    auto constraint_system = build_acir_format(0, range_15bit);

    WitnessVector witness = { fr((1ULL << 15) - 1) }; // Max 15-bit value: 32767
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Find and corrupt the decompose chain's q_1 selector to break the power-of-two pattern
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
        if (is_power_two(q_1) && is_power_two(q_2) && is_power_two(q_3) && (q_2 * q_2 == q_1 * q_3)) {
            arith_block.q_1().set(i, fr(3)); // 3 is not a power of 2
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find decompose chain gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corruption is detected when witness value is zero in a decompose chain
 * @details When witness=0, all decompose chain sublimbs are zero. This tests that the analyzer's
 *          validate_decompose_chain correctly validates sublimb range_list membership even when
 *          all sublimb values are zero — an edge case where the sublimb variable indices could
 *          alias with zero_idx, potentially confusing the range_list lookup.
 */
TEST_F(BoomerangConstraintsTests, DetectCorrupted_ZeroWitness_DecomposeChain)
{
    RangeConstraint range_32bit{ .witness = 0, .num_bits = 32 };

    auto constraint_system = build_acir_format(0, range_32bit);

    WitnessVector witness = { fr(0) }; // Zero witness — all sublimbs will be zero
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    // Corrupt the decompose chain selector to break the power-of-two pattern
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
        if (is_power_two(q_1) && is_power_two(q_2) && is_power_two(q_3) && (q_2 * q_2 == q_1 * q_3)) {
            arith_block.q_1().set(i, fr(3));
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find decompose chain gate to corrupt";
    // Note: CircuitChecker won't catch this corruption because when witness=0, all sublimb wire values
    // are zero, so the gate equation q_1*0 + q_2*0 + q_3*0 = 0 is trivially satisfied regardless of
    // selector values. This makes the test especially valuable — it's a corruption only the analyzer detects.

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corruption is detected with max 32-bit XOR values where result is zero
 * @details When a = b = 0xFFFFFFFF, XOR result = 0 and all result chunks are zero.
 *          This tests that the analyzer correctly validates lookup gates and the accumulation chain
 *          when the result variable holds zero — an edge case where result_chunk values could
 *          alias with zero_idx in the builder's variable mapping, potentially confusing the
 *          accumulation chain tracing in process_logic_constraints.
 */
TEST_F(BoomerangConstraintsTests, DetectCorrupted_MaxValues_XorResultZero)
{
    uint32_t max_val = 0xFFFFFFFF;

    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    auto constraint_system = build_acir_format(2, xor_constraint, range_0, range_1);

    // XOR: max ^ max = 0 — all result chunks are zero
    WitnessVector witness = { fr(max_val), fr(max_val), fr(0) };
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
    // Note: CircuitChecker won't catch q_lookup=0 corruption (only validates arithmetic relations)

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}
