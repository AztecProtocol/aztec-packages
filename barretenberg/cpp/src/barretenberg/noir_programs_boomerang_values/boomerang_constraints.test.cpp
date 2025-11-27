#include <gtest/gtest.h>
#include <vector>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/stdlib_circuit_builders/circuit_builder_base_utils.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace bb;
using namespace acir_format;

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
 * @brief Test single logic constraint - verify witness tracking
 */
TEST_F(BoomerangConstraintsTests, TestSingleLogicConstraint)
{
    LogicConstraint logic_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    RangeConstraint range_a{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_b{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .varnum = 3,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { logic_constraint },
        .range_constraints = { range_a, range_b },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 5, 10, 15 };
    AcirProgram program{ constraint_system, witness };
    UltraCircuitBuilder builder = create_circuit(program);

    const auto& logic_witnesses = builder.get_all_logic_witnesses();
    EXPECT_EQ(logic_witnesses.size(), constraint_system.logic_constraints.size());
    EXPECT_EQ(logic_witnesses.size(), 1);
}

/**
 * @brief Test single AES128 constraint - verify automatic witness marking
 */
TEST_F(BoomerangConstraintsTests, TestSingleAES128Constraint)
{
    auto test_data = create_aes128_test_data();
    uint32_t witness_idx = 0;
    WitnessVector witness;
    AES128Constraint aes_constraint = create_aes_constraint(witness_idx, test_data);
    update_aes_witness_vector(test_data, witness);

    UltraCircuitBuilder builder{ 0, witness, {}, witness_idx };
    auto before_aes = get_real_variable_indices_set(builder);
    create_aes128_constraints(builder, aes_constraint);
    auto aes_created_variables = get_difference_real_variable_indices_states(before_aes, builder);
    auto expected_witnesses = aes_created_variables;

    builder.update_constraint_witnesses(aes_created_variables);
    builder.save_and_clear_aes128_witnesses();

    // Verify what was stored
    const auto& aes_witnesses = builder.get_all_aes128_witnesses();
    EXPECT_EQ(aes_witnesses.size(), 1);
    EXPECT_GT(aes_witnesses[0].size(), 0) << "AES witnesses should not be empty";

    // Verify that captured witnesses match what we computed
    EXPECT_EQ(aes_witnesses[0], expected_witnesses) << "Stored AES witnesses should match computed difference";

    info("AES128 constraint captured ", aes_witnesses[0].size(), " witnesses");
}

/**
 * @brief Test multiple AES128 constraints - verify each gets its own witness set
 */
TEST_F(BoomerangConstraintsTests, TestMultipleAES128Constraints)
{
    auto test_data = create_aes128_test_data();
    uint32_t witness_idx = 0;
    std::vector<AES128Constraint> aes_constraints;
    WitnessVector witness;

    for (int constraint_num = 0; constraint_num < 2; constraint_num++) {
        std::vector<WitnessOrConstant<fr>> inputs;
        AES128Constraint constraint = create_aes_constraint(witness_idx, test_data);
        aes_constraints.push_back(constraint);
        update_aes_witness_vector(test_data, witness);
    }

    AcirFormat constraint_system{
        .varnum = witness_idx,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .aes128_constraints = aes_constraints,
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    UltraCircuitBuilder builder = create_circuit(program);

    const auto& combined_aes_witnesses = builder.get_all_aes128_witnesses();
    EXPECT_EQ(combined_aes_witnesses.size(), constraint_system.aes128_constraints.size());
    EXPECT_EQ(combined_aes_witnesses[0].size(), combined_aes_witnesses[1].size());
}

/**
 * @brief Test multiple logic constraints - verify each gets its own witness set
 */
TEST_F(BoomerangConstraintsTests, TestMultipleLogicConstraints)
{
    LogicConstraint logic_constraint1{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    LogicConstraint logic_constraint2{
        .a = witness_from_index(3),
        .b = witness_from_index(4),
        .result = 5,
        .num_bits = 32,
        .is_xor_gate = 0,
    };

    RangeConstraint range_a{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_b{ .witness = 1, .num_bits = 32 };
    RangeConstraint range_c{ .witness = 3, .num_bits = 32 };
    RangeConstraint range_d{ .witness = 4, .num_bits = 32 };

    AcirFormat constraint_system{
        .varnum = 6,
        .num_acir_opcodes = 6,
        .public_inputs = {},
        .logic_constraints = { logic_constraint1, logic_constraint2 },
        .range_constraints = { range_a, range_b, range_c, range_d },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 5, 10, 15, 7, 3, 3 };
    AcirProgram program{ constraint_system, witness };
    UltraCircuitBuilder builder = create_circuit(program);

    const auto& logic_witnesses = builder.get_all_logic_witnesses();
    EXPECT_EQ(logic_witnesses.size(), constraint_system.logic_constraints.size());
    EXPECT_EQ(logic_witnesses.size(), 2);
}

/**
 * @brief Compare two approaches for tracking logic constraint witnesses:
 *   1. mark_witness_as_logic (stores witness_index directly in tmp_logic_witnesses)
 *   2. get_difference_real_variable_indices_states (stores real_variable_index values in logic_witnesses)
 *
 * This test helps understand the differences between the two approaches.
 */
TEST_F(BoomerangConstraintsTests, TestCompareLogicWitnessTrackingApproaches)
{
    LogicConstraint logic_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    RangeConstraint range_a{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_b{ .witness = 1, .num_bits = 32 };

    AcirFormat constraint_system{
        .varnum = 3,
        .num_acir_opcodes = 3,
        .public_inputs = {},
        .logic_constraints = { logic_constraint },
        .range_constraints = { range_a, range_b },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 5, 10, 15 };
    AcirProgram program{ constraint_system, witness };
    UltraCircuitBuilder builder = create_circuit(program);

    // Get witnesses from both approaches
    const auto& logic_witnesses = builder.get_all_logic_witnesses();         // from get_difference approach
    const auto& tmp_logic_witnesses = builder.get_all_tmp_logic_witnesses(); // from mark_witness_as_logic approach

    EXPECT_EQ(logic_witnesses.size(), 1) << "Should have 1 logic constraint";
    EXPECT_EQ(tmp_logic_witnesses.size(), 1) << "Should have 1 tmp logic constraint";

    const auto& diff_based = logic_witnesses[0];
    const auto& mark_based = tmp_logic_witnesses[0];

    info("=== Comparing Logic Witness Tracking Approaches ===");
    info("Approach 1 (mark_witness_as_logic -> tmp_logic_witnesses): ", mark_based.size(), " witnesses");
    info("Approach 2 (get_difference -> logic_witnesses): ", diff_based.size(), " witnesses");

    // Find witnesses in mark_based but NOT in diff_based
    std::vector<uint32_t> only_in_mark;
    for (const auto& w : mark_based) {
        if (diff_based.find(w) == diff_based.end()) {
            only_in_mark.push_back(w);
        }
    }

    // Find witnesses in diff_based but NOT in mark_based
    std::vector<uint32_t> only_in_diff;
    for (const auto& w : diff_based) {
        if (mark_based.find(w) == mark_based.end()) {
            only_in_diff.push_back(w);
        }
    }

    // Find common witnesses
    std::vector<uint32_t> common;
    for (const auto& w : mark_based) {
        if (diff_based.find(w) != diff_based.end()) {
            common.push_back(w);
        }
    }

    info("Common witnesses: ", common.size());
    info("Only in mark_witness_as_logic: ", only_in_mark.size());
    info("Only in get_difference: ", only_in_diff.size());

    // Print details about differences
    if (!only_in_mark.empty()) {
        std::sort(only_in_mark.begin(), only_in_mark.end());
        info("Witnesses only in mark_witness_as_logic (first 10):");
        for (size_t i = 0; i < std::min(only_in_mark.size(), size_t(10)); i++) {
            uint32_t w = only_in_mark[i];
            uint32_t real_idx = builder.real_variable_index[w];
            info("  witness_index=", w, " -> real_variable_index=", real_idx);
        }
    }

    if (!only_in_diff.empty()) {
        std::sort(only_in_diff.begin(), only_in_diff.end());
        info("Witnesses only in get_difference (first 10):");
        for (size_t i = 0; i < std::min(only_in_diff.size(), size_t(10)); i++) {
            info("  real_variable_index=", only_in_diff[i]);
        }
    }

    // Basic sanity checks
    EXPECT_GT(mark_based.size(), 0) << "mark_witness_as_logic should capture some witnesses";
    EXPECT_GT(diff_based.size(), 0) << "get_difference should capture some witnesses";

    // Check if mark_based is a subset of diff_based (it should be, since diff captures ALL new variables)
    bool mark_is_subset = true;
    for (const auto& w : mark_based) {
        // Convert witness_index to real_variable_index for comparison
        uint32_t real_idx = builder.real_variable_index[w];
        if (diff_based.find(real_idx) == diff_based.end()) {
            mark_is_subset = false;
            info("Mark witness ", w, " (real_idx=", real_idx, ") not found in diff_based");
        }
    }
    info("mark_based (converted to real indices) is subset of diff_based: ", mark_is_subset ? "YES" : "NO");
}

/**
 * @brief Test logic constraint with constant operand
 */
TEST_F(BoomerangConstraintsTests, TestLogicConstraintWithConstant)
{
    LogicConstraint logic_constraint{
        .a = witness_from_index(0),
        .b = constant_from_value(10), // Constant operand
        .result = 1,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    RangeConstraint range_a{ .witness = 0, .num_bits = 32 };

    AcirFormat constraint_system{
        .varnum = 2,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .logic_constraints = { logic_constraint },
        .range_constraints = { range_a },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 5, 15 }; // 5 XOR 10 = 15
    AcirProgram program{ constraint_system, witness };
    UltraCircuitBuilder builder = create_circuit(program);

    // Verify logic witness tracking
    const auto& logic_witnesses = builder.get_all_logic_witnesses();
    EXPECT_EQ(logic_witnesses.size(), constraint_system.logic_constraints.size());
    EXPECT_EQ(logic_witnesses.size(), 1);

    EXPECT_TRUE(CircuitChecker::check(builder));
}
