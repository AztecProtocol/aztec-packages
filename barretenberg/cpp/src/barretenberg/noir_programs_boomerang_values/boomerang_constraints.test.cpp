#include <gtest/gtest.h>
#include <vector>

#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder_utils.hpp"

using namespace bb;
using namespace acir_format;
using namespace cdg;

class BoomerangConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Helper to create AES128 test data
struct AES128TestData {
    std::vector<uint8_t> key;
    std::vector<uint8_t> iv;
    std::vector<uint8_t> plaintext;
    std::vector<uint8_t> ciphertext;
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

AES128TestData create_aes128_test_data()
{
    AES128TestData data;
    data.key = { 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c };
    data.iv = { 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f };

    // Standard AES-128-CBC test vector (4 blocks)
    data.plaintext = { 0x6b, 0xc1, 0xbe, 0xe2, 0x2e, 0x40, 0x9f, 0x96, 0xe9, 0x3d, 0x7e, 0x11, 0x73, 0x93, 0x17, 0x2a,
                       0xae, 0x2d, 0x8a, 0x57, 0x1e, 0x03, 0xac, 0x9c, 0x9e, 0xb7, 0x6f, 0xac, 0x45, 0xaf, 0x8e, 0x51,
                       0x30, 0xc8, 0x1c, 0x46, 0xa3, 0x5c, 0xe4, 0x11, 0xe5, 0xfb, 0xc1, 0x19, 0x1a, 0x0a, 0x52, 0xef,
                       0xf6, 0x9f, 0x24, 0x45, 0xdf, 0x4f, 0x9b, 0x17, 0xad, 0x2b, 0x41, 0x7b, 0xe6, 0x6c, 0x37, 0x10 };

    // Known ciphertext for the above plaintext with the given key and IV
    data.ciphertext = {
        0x76, 0x49, 0xab, 0xac, 0x81, 0x19, 0xb2, 0x46, 0xce, 0xe9, 0x8e, 0x9b, 0x12, 0xe9, 0x19, 0x7d,
        0x50, 0x86, 0xcb, 0x9b, 0x50, 0x72, 0x19, 0xee, 0x95, 0xdb, 0x11, 0x3a, 0x91, 0x76, 0x78, 0xb2,
        0x73, 0xbe, 0xd6, 0xb8, 0xe3, 0xc1, 0x74, 0x3b, 0x71, 0x16, 0xe6, 0x9e, 0x22, 0x22, 0x95, 0x16,
        0x3f, 0xf1, 0xca, 0xa1, 0x68, 0x1f, 0xac, 0x09, 0x12, 0x0e, 0xca, 0x30, 0x75, 0x86, 0xe1, 0xa7
    };

    return data;
}

AES128Constraint create_aes_constraint(uint32_t& witness_idx, const AES128TestData& test_data)
{
    std::vector<WitnessOrConstant<fr>> inputs;
    for (size_t i = 0; i < test_data.plaintext.size(); i++) {
        inputs.push_back(witness_from_index(witness_idx++));
    }
    std::array<WitnessOrConstant<fr>, 16> iv;
    for (size_t i = 0; i < 16; i++) {
        iv[i] = witness_from_index(witness_idx++);
    }
    std::array<WitnessOrConstant<fr>, 16> key;
    for (size_t i = 0; i < 16; i++) {
        key[i] = witness_from_index(witness_idx++);
    }
    std::vector<uint32_t> outputs;
    for (size_t i = 0; i < test_data.ciphertext.size(); i++) {
        outputs.push_back(witness_idx++);
    }
    AES128Constraint aes_constraint{
        .inputs = inputs,
        .iv = iv,
        .key = key,
        .outputs = outputs,
    };
    return aes_constraint;
}

void update_aes_witness_vector(const AES128TestData& test_data, WitnessVector& witness)
{
    for (auto byte : test_data.plaintext) {
        witness.push_back(fr(byte));
    }
    for (auto byte : test_data.iv) {
        witness.push_back(fr(byte));
    }
    for (auto byte : test_data.key) {
        witness.push_back(fr(byte));
    }
    for (auto byte : test_data.ciphertext) {
        witness.push_back(fr(byte));
    }
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
        .varnum = 6,
        .num_acir_opcodes = 6,
        .public_inputs = {},
        .logic_constraints = { xor_constraint, and_constraint },
        .range_constraints = { range_0, range_1, range_3, range_4 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

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

    EXPECT_EQ(xor_count, 1) << "Should have exactly one XOR constraint";
    EXPECT_EQ(and_count, 1) << "Should have exactly one AND constraint";
    EXPECT_EQ(range_count, 4) << "Should have exactly four RANGE constraints";

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0);
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
        .varnum = 3,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0) << "64-bit XOR should be processed correctly";
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
        .varnum = 3,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0) << "1-bit XOR should be processed correctly";
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
        .varnum = 3,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { and_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0) << "8-bit AND should be processed correctly";
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
        .varnum = 3,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0, range_1 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0);
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
        .varnum = 9,
        .num_acir_opcodes = 9,
        .public_inputs = {},
        .logic_constraints = { xor_8, and_32, xor_64 },
        .range_constraints = { range_0, range_1, range_3, range_4, range_6, range_7 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    size_t logic_count = 0;
    size_t range_count = 0;
    for (const auto& [opcode_idx, constraint_info] : opcode_map) {
        if (constraint_info.type == AcirConstraintType::LOGIC) {
            logic_count++;
        } else if (constraint_info.type == AcirConstraintType::RANGE) {
            range_count++;
        }
    }

    EXPECT_EQ(logic_count, 3);
    EXPECT_EQ(range_count, 6);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0);
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
        .varnum = 2,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0) << "32-bit XOR with constant operand should be processed correctly";
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
        .varnum = 2,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0) << "1-bit XOR with constant operand should be processed correctly";
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
        .varnum = 2,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { and_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0) << "8-bit AND with constant operand should be processed correctly";
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
        .varnum = 2,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { xor_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0) << "64-bit XOR with constant operand should be processed correctly";
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
        .varnum = 2,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { and_constraint },
        .range_constraints = { range_0 },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), constraint_system.num_acir_opcodes);

    std::unordered_set<size_t> opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_EQ(opcodes.size(), 0) << "128-bit AND with constant operand should be processed correctly";
}
