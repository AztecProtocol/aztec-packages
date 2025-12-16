#include <gtest/gtest.h>
#include <memory>
#include <vector>

#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"

#include "barretenberg/serialize/test_helper.hpp"

using namespace bb;
using namespace bb::crypto;
using namespace acir_format;

class AcirFormatTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
TEST_F(AcirFormatTests, TestASingleConstraintNoPubInputs)
{

    poly_triple constraint{
        .a = 0,
        .b = 1,
        .c = 2,
        .q_m = 0,
        .q_l = 1,
        .q_r = 1,
        .q_o = -1,
        .q_c = 0,
    };

    AcirFormat constraint_system{
        .varnum = 4,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .poly_triple_constraints = { constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);
    WitnessVector witness{ 5, 7, 12 };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST_F(AcirFormatTests, MsgpackLogicConstraint)
{
    auto [actual, expected] = msgpack_roundtrip(LogicConstraint{});
    EXPECT_EQ(actual, expected);
}
TEST_F(AcirFormatTests, TestLogicGateFromNoirCircuit)
{
    /**
     * constraints produced by Noir program:
     * fn main(x : u32, y : pub u32) {
     * let z = x ^ y;
     *
     * constrain z != 10;
     * }
     **/
    RangeConstraint range_a{
        .witness = 0,
        .num_bits = 32,
    };
    RangeConstraint range_b{
        .witness = 1,
        .num_bits = 32,
    };

    LogicConstraint logic_constraint{
        .a = WitnessOrConstant<bb::fr>::from_index(0),
        .b = WitnessOrConstant<bb::fr>::from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };
    poly_triple expr_a{
        .a = 2,
        .b = 3,
        .c = 0,
        .q_m = 0,
        .q_l = 1,
        .q_r = -1,
        .q_o = 0,
        .q_c = -10,
    };
    poly_triple expr_b{
        .a = 3,
        .b = 4,
        .c = 5,
        .q_m = 1,
        .q_l = 0,
        .q_r = 0,
        .q_o = -1,
        .q_c = 0,
    };
    poly_triple expr_c{
        .a = 3,
        .b = 5,
        .c = 3,
        .q_m = 1,
        .q_l = 0,
        .q_r = 0,
        .q_o = -1,
        .q_c = 0,

    };
    poly_triple expr_d{
        .a = 5,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = -1,
        .q_r = 0,
        .q_o = 0,
        .q_c = 1,
    };
    // EXPR [ (1, _4, _5) (-1, _6) 0 ]
    // EXPR [ (1, _4, _6) (-1, _4) 0 ]
    // EXPR [ (-1, _6) 1 ]

    AcirFormat constraint_system{
        .varnum = 6,
        .num_acir_opcodes = 7,
        .public_inputs = { 1 },
        .logic_constraints = { logic_constraint },
        .range_constraints = { range_a, range_b },
        .poly_triple_constraints = { expr_a, expr_b, expr_c, expr_d },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    uint256_t inverse_of_five = fr(5).invert();
    WitnessVector witness{
        5, 10, 15, 5, inverse_of_five, 1,
    };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST_F(AcirFormatTests, TestKeccakPermutation)
{
    Keccakf1600
        keccak_permutation{
             .state = {
                WitnessOrConstant<bb::fr>::from_index(1),
                WitnessOrConstant<bb::fr>::from_index(2),
                WitnessOrConstant<bb::fr>::from_index(3),
                WitnessOrConstant<bb::fr>::from_index(4),
                WitnessOrConstant<bb::fr>::from_index(5),
                WitnessOrConstant<bb::fr>::from_index(6),
                WitnessOrConstant<bb::fr>::from_index(7),
                WitnessOrConstant<bb::fr>::from_index(8),
                WitnessOrConstant<bb::fr>::from_index(9),
                WitnessOrConstant<bb::fr>::from_index(10),
                WitnessOrConstant<bb::fr>::from_index(11),
                WitnessOrConstant<bb::fr>::from_index(12),
                WitnessOrConstant<bb::fr>::from_index(13),
                WitnessOrConstant<bb::fr>::from_index(14),
                WitnessOrConstant<bb::fr>::from_index(15),
                WitnessOrConstant<bb::fr>::from_index(16),
                WitnessOrConstant<bb::fr>::from_index(17),
                WitnessOrConstant<bb::fr>::from_index(18),
                WitnessOrConstant<bb::fr>::from_index(19),
                WitnessOrConstant<bb::fr>::from_index(20),
                WitnessOrConstant<bb::fr>::from_index(21),
                WitnessOrConstant<bb::fr>::from_index(22),
                WitnessOrConstant<bb::fr>::from_index(23),
                WitnessOrConstant<bb::fr>::from_index(24),
                WitnessOrConstant<bb::fr>::from_index(25),
 },
            .result = { 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38,
                        39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50 },
        };

    AcirFormat constraint_system{
        .varnum = 51,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .keccak_permutations = { keccak_permutation },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 1,  2,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13, 14, 15, 16, 17,
                           18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
                           35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50 };

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST_F(AcirFormatTests, TestCollectsGateCounts)
{

    // Witness 0 + witness 1 = witness 2
    poly_triple first_gate{
        .a = 0,
        .b = 1,
        .c = 2,
        .q_m = 0,
        .q_l = 1,
        .q_r = 1,
        .q_o = -1,
        .q_c = 0,
    };

    // Witness 1 = 27
    poly_triple second_gate{
        .a = 1,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = 1,
        .q_r = 0,
        .q_o = 0,
        .q_c = -27,
    };

    AcirFormat constraint_system{
        .varnum = 4,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .poly_triple_constraints = { first_gate, second_gate },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);
    WitnessVector witness{ 5, 27, 32 };
    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ 2, 1 }));
}

TEST_F(AcirFormatTests, TestBigAdd)
{

    WitnessVector witness_values;
    witness_values.emplace_back(fr(0));

    witness_values = {
        fr(0), fr(1), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7), fr(8), fr(9), fr(10), fr(11), fr(12), fr(13), fr(-91),
    };

    bb::mul_quad_<fr> quad1 = {
        .a = 0,
        .b = 1,
        .c = 2,
        .d = 3,
        .mul_scaling = 0,
        .a_scaling = fr::one(),
        .b_scaling = fr::one(),
        .c_scaling = fr::one(),
        .d_scaling = fr::one(),
        .const_scaling = fr(0),
    };

    bb::mul_quad_<fr> quad2 = {
        .a = 4,
        .b = 5,
        .c = 6,
        .d = 0,
        .mul_scaling = 0,
        .a_scaling = fr::one(),
        .b_scaling = fr::one(),
        .c_scaling = fr::one(),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    bb::mul_quad_<fr> quad3 = {
        .a = 7,
        .b = 8,
        .c = 9,
        .d = 0,
        .mul_scaling = 0,
        .a_scaling = fr::one(),
        .b_scaling = fr::one(),
        .c_scaling = fr::one(),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };
    bb::mul_quad_<fr> quad4 = {
        .a = 10,
        .b = 11,
        .c = 12,
        .d = 0,
        .mul_scaling = 0,
        .a_scaling = fr::one(),
        .b_scaling = fr::one(),
        .c_scaling = fr::one(),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };
    bb::mul_quad_<fr> quad5 = {
        .a = 13,
        .b = 14,
        .c = 0,
        .d = 18,
        .mul_scaling = 0,
        .a_scaling = fr::one(),
        .b_scaling = fr::one(),
        .c_scaling = fr(0),
        .d_scaling = fr(-1),
        .const_scaling = fr(0),
    };

    auto res_x = fr(91);
    auto assert_equal = poly_triple{
        .a = 14,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = fr::one(),
        .q_r = 0,
        .q_o = 0,
        .q_c = res_x,
    };
    auto quad_constraint = { quad1, quad2, quad3, quad4, quad5 };
    size_t num_variables = witness_values.size();
    AcirFormat constraint_system{
        .varnum = static_cast<uint32_t>(num_variables + 1),
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .poly_triple_constraints = { assert_equal },
        .big_quad_constraints = { quad_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness_values };
    auto builder = create_circuit(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Helper function to convert a uint256_t to a 32-byte vector in big-endian format
std::vector<uint8_t> to_bytes_be(uint256_t value)
{
    std::vector<uint8_t> bytes(32, 0);
    for (size_t i = 0; i < 32; i++) {
        bytes[31 - i] = static_cast<uint8_t>(value & 0xFF);
        value >>= 8;
    }
    return bytes;
}

/**
 * @brief Test for bug fix where expressions with distinct witnesses requiring more than one width-4 gate
 *        were incorrectly processed when they initially appeared to fit in width-3 gates
 *
 * @details This test verifies the fix for a bug in handle_arithmetic where an expression with:
 *  - 1 mul term using witnesses (w0 * w1)
 *  - 3 additional linear terms using distinct witnesses (w2, w3, w4)
 *
 *  Such expressions have ≤3 linear combinations and ≤1 mul term, appearing to fit in a
 *  poly_triple (width-3) gate. However, with all 5 witnesses distinct, serialize_arithmetic_gate
 *  correctly returns all zeros, indicating it cannot fit in a width-3 gate.
 *
 *  The bug: old code would check if poly_triple was all zeros, and if so, directly add to
 *  quad_constraints via serialize_mul_quad_gate. But it did this inside the initial
 *  might_fit_in_polytriple check, so it would never properly go through the mul_quad processing
 *  logic that handles the general case with >4 witnesses.
 *
 *  The fix: now uses a needs_to_be_parsed_as_mul_quad flag that is set when poly_triple fails,
 *  and processes through the proper mul_quad logic path, which splits into multiple gates.
 *
 *  Expression: w0 * w1 + w2 + w3 + w4 = 10
 *  With witnesses: w0=0, w1=1, w2=2, w3=3, w4=4
 *  Evaluation: 0*1 + 2 + 3 + 4 = 9, but we set q_c = -9, so constraint is: 9 - 9 = 0
 */
TEST_F(AcirFormatTests, TestArithmeticGateWithDistinctWitnessesRegression)
{
    // Create an ACIR expression: w0 * w1 + w2 + w3 + w4 - 9 = 0
    // This has 1 mul term and 3 linear terms with all 5 distinct witnesses (requires multiple width-4 gates)
    Acir::Expression expr{ .mul_terms = { std::make_tuple(
                               to_bytes_be(1), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
                           .linear_combinations = { std::make_tuple(to_bytes_be(1), Acir::Witness{ .value = 2 }),
                                                    std::make_tuple(to_bytes_be(1), Acir::Witness{ .value = 3 }),
                                                    std::make_tuple(to_bytes_be(1), Acir::Witness{ .value = 4 }) },
                           .q_c = to_bytes_be(static_cast<uint256_t>(fr(-9))) };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };

    // Create an ACIR circuit with this opcode
    Acir::Circuit circuit{
        .current_witness_index = 5,
        .opcodes = { Acir::Opcode{ .value = assert_zero } },
        .return_values = {},
    };

    Acir::Program program{ .functions = { circuit } };

    // Serialize the program to bytes
    auto program_bytes = program.bincodeSerialize();

    // Process through circuit_buf_to_acir_format (this calls handle_arithmetic internally)
    AcirFormat constraint_system = circuit_buf_to_acir_format(std::move(program_bytes));

    // The key assertion: this expression should end up in big_quad_constraints, not poly_triple_constraints
    // or single quad_constraints, because it needs 5 witness slots (all distinct)
    EXPECT_EQ(constraint_system.poly_triple_constraints.size(), 0);
    EXPECT_EQ(constraint_system.quad_constraints.size(), 0);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1);

    // Now verify the constraint system with valid witness assignments
    // We need: w0 * w1 + w2 + w3 + w4 = 9
    // Use values: w0=0, w1=1, w2=2, w3=3, w4=4, so 0*1 + 2 + 3 + 4 = 9
    WitnessVector witness{ 0, 1, 2, 3, 4 };
    AcirProgram acir_program{ constraint_system, witness };
    auto builder = create_circuit(acir_program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}
