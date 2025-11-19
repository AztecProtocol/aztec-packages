#include <gtest/gtest.h>
#include <memory>
#include <vector>

#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
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

    arithmetic_triple constraint{
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
        .arithmetic_triple_constraints = { constraint },
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
    arithmetic_triple expr_a{
        .a = 2,
        .b = 3,
        .c = 0,
        .q_m = 0,
        .q_l = 1,
        .q_r = -1,
        .q_o = 0,
        .q_c = -10,
    };
    arithmetic_triple expr_b{
        .a = 3,
        .b = 4,
        .c = 5,
        .q_m = 1,
        .q_l = 0,
        .q_r = 0,
        .q_o = -1,
        .q_c = 0,
    };
    arithmetic_triple expr_c{
        .a = 3,
        .b = 5,
        .c = 3,
        .q_m = 1,
        .q_l = 0,
        .q_r = 0,
        .q_o = -1,
        .q_c = 0,

    };
    arithmetic_triple expr_d{
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
        .arithmetic_triple_constraints = { expr_a, expr_b, expr_c, expr_d },
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
    arithmetic_triple first_gate{
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
    arithmetic_triple second_gate{
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
        .arithmetic_triple_constraints = { first_gate, second_gate },
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
    auto assert_equal = arithmetic_triple{
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
        .arithmetic_triple_constraints = { assert_equal },
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
 *  arithmetic_triple (width-3) gate. However, with all 5 witnesses distinct, serialize_arithmetic_gate
 *  correctly returns all zeros, indicating it cannot fit in a width-3 gate.
 *
 *  The bug: old code would check if arithmetic_triple was all zeros, and if so, directly add to
 *  quad_constraints via serialize_mul_quad_gate. But it did this inside the initial
 *  might_fit_in_polytriple check, so it would never properly go through the mul_quad processing
 *  logic that handles the general case with >4 witnesses.
 *
 *  The fix: now uses a needs_to_be_parsed_as_mul_quad flag that is set when arithmetic_triple fails,
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

    // The key assertion: this expression should end up in big_quad_constraints, not arithmetic_triple_constraints
    // or single quad_constraints, because it needs 5 witness slots (all distinct)
    EXPECT_EQ(constraint_system.arithmetic_triple_constraints.size(), 0);
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

// Gate count pinning test suite
template <typename Builder> class OpcodeGateCountTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // NOTE: Gate count constants are defined in gate_count_constants.hpp
    // All constants below reference the shared definitions from that file

    // NOTE: Recursion constraint gate counts are NOT included in this suite because they:
    // 1. Require proof generation which is expensive and slow
    // 2. Have different gate counts depending on the recursive flavor (Ultra vs UltraRollup vs ZK, etc.)
    //
    // Recursion constraint gate count tests are located in their respective test files:
    // - Honk recursion: honk_recursion_constraint.test.cpp::GateCountSingleHonkRecursion
    //
    // - Chonk recursion: chonk_recursion_constraints.test.cpp::GateCountChonkRecursion
    //
    // - Hypernova recursion: hypernova_recursion_constraint.test.cpp
    //
    // - AVM recursion: Not tested (AVM is not compiled in standard bb builds)
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
TYPED_TEST_SUITE(OpcodeGateCountTests, BuilderTypes);

TYPED_TEST(OpcodeGateCountTests, ArithmeticTriple)
{
    arithmetic_triple constraint{
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
        .arithmetic_triple_constraints = { constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);
    WitnessVector witness{ 5, 7, 12 };
    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ ARITHMETIC_TRIPLE<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Quad)
{
    bb::mul_quad_<fr> quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = 3,
        .mul_scaling = fr::one(),
        .a_scaling = 0,
        .b_scaling = 0,
        .c_scaling = 0,
        .d_scaling = fr::neg_one(),
        .const_scaling = 0,
    };

    WitnessVector witness{ 2, 3, 6, 6 };

    AcirFormat constraint_system{
        .varnum = 4,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .quad_constraints = { quad },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ QUAD<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, BigQuad)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(to_bytes_be(1), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(to_bytes_be(1), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }) },
        .linear_combinations = { std::make_tuple(to_bytes_be(1), Acir::Witness{ .value = 2 }) },
        .q_c = to_bytes_be(static_cast<uint256_t>(fr(-2))),
    };

    WitnessVector witness_values = { fr(1), fr(1), fr(1), fr(-1) };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };

    // Create an ACIR circuit with this opcode
    Acir::Circuit circuit{
        .current_witness_index = 5,
        .opcodes = { Acir::Opcode{ .value = assert_zero } },
        .return_values = {},
    };

    Acir::Program acir_program{ .functions = { circuit } };

    // Serialize the program to bytes
    auto acir_program_bytes = acir_program.bincodeSerialize();

    // Process through circuit_buf_to_acir_format (this calls handle_arithmetic internally)
    AcirFormat constraint_system = circuit_buf_to_acir_format(std::move(acir_program_bytes));

    AcirProgram program{ constraint_system, witness_values };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BIG_QUAD<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, LogicXor32)
{
    LogicConstraint logic_constraint{
        .a = WitnessOrConstant<bb::fr>::from_index(0),
        .b = WitnessOrConstant<bb::fr>::from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    AcirFormat constraint_system{
        .varnum = 3,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .logic_constraints = { logic_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 5, 10, 15 };
    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ LOGIC_XOR_32<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Range32)
{
    RangeConstraint range_constraint{
        .witness = 0,
        .num_bits = 32,
    };

    AcirFormat constraint_system{
        .varnum = 1,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .range_constraints = { range_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 100 };
    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ RANGE_32<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, KeccakPermutation)
{
    Keccakf1600 keccak_permutation{
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
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ KECCAK_PERMUTATION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, AssertEquality)
{
    AcirFormat constraint_system{
        .varnum = 3,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .assert_equalities = { { .a = 0, .b = 1 } },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 5, 5 };
    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ ASSERT_EQUALITY<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Poseidon2Permutation)
{
    Poseidon2Constraint
        poseidon2_constraint{
            .state = {
                WitnessOrConstant<bb::fr>::from_index(1),
                WitnessOrConstant<bb::fr>::from_index(2),
                WitnessOrConstant<bb::fr>::from_index(3),
                WitnessOrConstant<bb::fr>::from_index(4),
            },
            .result = { 5, 6, 7, 8 },
        };

    AcirFormat constraint_system{
        .varnum = 9,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .poseidon2_constraints = { poseidon2_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{
        1,
        0,
        1,
        2,
        3,
        fr(std::string("0x01bd538c2ee014ed5141b29e9ae240bf8db3fe5b9a38629a9647cf8d76c01737")),
        fr(std::string("0x239b62e7db98aa3a2a8f6a0d2fa1709e7a35959aa6c7034814d9daa90cbac662")),
        fr(std::string("0x04cbb44c61d928ed06808456bf758cbf0c18d1e15a7b6dbc8245fa7515d5e3cb")),
        fr(std::string("0x2e11c5cff2a22c64d01304b778d78f6998eff1ab73163a35603f54794c30847a")),
    };

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ POSEIDON2_PERMUTATION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Sha256Compression)
{
    std::array<WitnessOrConstant<bb::fr>, 16> inputs;
    for (size_t i = 0; i < 16; ++i) {
        inputs[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 1));
    }
    std::array<WitnessOrConstant<bb::fr>, 8> hash_values;
    for (size_t i = 0; i < 8; ++i) {
        hash_values[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 17));
    }
    Sha256Compression sha256_compression{
        .inputs = inputs,
        .hash_values = hash_values,
        .result = { 25, 26, 27, 28, 29, 30, 31, 32 },
    };

    AcirFormat constraint_system{
        .varnum = 34,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .sha256_compression = { sha256_compression },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 0,
                           0,
                           1,
                           2,
                           3,
                           4,
                           5,
                           6,
                           7,
                           8,
                           9,
                           10,
                           11,
                           12,
                           13,
                           14,
                           15,
                           0,
                           1,
                           2,
                           3,
                           4,
                           5,
                           6,
                           7,
                           static_cast<uint32_t>(3349900789),
                           1645852969,
                           static_cast<uint32_t>(3630270619),
                           1004429770,
                           739824817,
                           static_cast<uint32_t>(3544323979),
                           557795688,
                           static_cast<uint32_t>(3481642555) };

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ SHA256_COMPRESSION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Aes128Encryption)
{
    // Create a minimal AES128 constraint with 16 bytes of input
    std::vector<WitnessOrConstant<bb::fr>> inputs;
    for (size_t i = 0; i < 16; ++i) {
        inputs.push_back(WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 1)));
    }

    std::array<WitnessOrConstant<bb::fr>, 16> iv;
    for (size_t i = 0; i < 16; ++i) {
        iv[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 17));
    }

    std::array<WitnessOrConstant<bb::fr>, 16> key;
    for (size_t i = 0; i < 16; ++i) {
        key[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 33));
    }

    std::vector<uint32_t> outputs;
    for (size_t i = 0; i < 16; ++i) {
        outputs.push_back(static_cast<uint32_t>(i + 49));
    }

    AES128Constraint aes128_constraint{
        .inputs = inputs,
        .iv = iv,
        .key = key,
        .outputs = outputs,
    };

    AcirFormat constraint_system{
        .varnum = 65,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .aes128_constraints = { aes128_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    // Create witness values (simplified, using dummy values)
    WitnessVector witness(65, fr(0));
    for (size_t i = 1; i <= 48; ++i) {
        witness[i] = fr(i);
    }
    // Set output witness values to match expected AES output (simplified)
    for (size_t i = 49; i < 65; ++i) {
        witness[i] = fr(i);
    }

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ AES128_ENCRYPTION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcdsaSecp256k1)
{
    std::array<uint32_t, 32> hashed_message;
    for (size_t i = 0; i < 32; ++i) {
        hashed_message[i] = static_cast<uint32_t>(i + 1);
    }

    std::array<uint32_t, 64> signature;
    for (size_t i = 0; i < 64; ++i) {
        signature[i] = static_cast<uint32_t>(i + 33);
    }

    std::array<uint32_t, 32> pub_x_indices;
    for (size_t i = 0; i < 32; ++i) {
        pub_x_indices[i] = static_cast<uint32_t>(i + 97);
    }

    std::array<uint32_t, 32> pub_y_indices;
    for (size_t i = 0; i < 32; ++i) {
        pub_y_indices[i] = static_cast<uint32_t>(i + 129);
    }

    EcdsaConstraint ecdsa_constraint{
        .type = bb::CurveType::SECP256K1,
        .hashed_message = hashed_message,
        .signature = signature,
        .pub_x_indices = pub_x_indices,
        .pub_y_indices = pub_y_indices,
        .predicate = WitnessOrConstant<bb::fr>::from_index(161),
        .result = 162,
    };

    AcirFormat constraint_system{
        .varnum = 163,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .ecdsa_k1_constraints = { ecdsa_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness(163, fr(0));
    // Set predicate to false to avoid validation
    witness[161] = fr(0);
    witness[162] = fr(0);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ ECDSA_SECP256K1<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcdsaSecp256r1)
{
    std::array<uint32_t, 32> hashed_message;
    for (size_t i = 0; i < 32; ++i) {
        hashed_message[i] = static_cast<uint32_t>(i + 1);
    }

    std::array<uint32_t, 64> signature;
    for (size_t i = 0; i < 64; ++i) {
        signature[i] = static_cast<uint32_t>(i + 33);
    }

    std::array<uint32_t, 32> pub_x_indices;
    for (size_t i = 0; i < 32; ++i) {
        pub_x_indices[i] = static_cast<uint32_t>(i + 97);
    }

    std::array<uint32_t, 32> pub_y_indices;
    for (size_t i = 0; i < 32; ++i) {
        pub_y_indices[i] = static_cast<uint32_t>(i + 129);
    }

    EcdsaConstraint ecdsa_constraint{
        .type = bb::CurveType::SECP256R1,
        .hashed_message = hashed_message,
        .signature = signature,
        .pub_x_indices = pub_x_indices,
        .pub_y_indices = pub_y_indices,
        .predicate = WitnessOrConstant<bb::fr>::from_index(161),
        .result = 162,
    };

    AcirFormat constraint_system{
        .varnum = 163,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .ecdsa_r1_constraints = { ecdsa_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness(163, fr(0));
    // Set predicate to false to avoid validation
    witness[161] = fr(0);
    witness[162] = fr(0);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ ECDSA_SECP256R1<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Blake2s)
{
    std::vector<Blake2sInput> inputs;
    // Add one input of 32 bits
    inputs.push_back(Blake2sInput{
        .blackbox_input = WitnessOrConstant<bb::fr>::from_index(1),
        .num_bits = 32,
    });

    std::array<uint32_t, 32> result;
    for (size_t i = 0; i < 32; ++i) {
        result[i] = static_cast<uint32_t>(i + 2);
    }

    Blake2sConstraint blake2s_constraint{
        .inputs = inputs,
        .result = result,
    };

    AcirFormat constraint_system{
        .varnum = 34,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .blake2s_constraints = { blake2s_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness(34, fr(0));
    witness[1] = fr(12345);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLAKE2S<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Blake3)
{
    std::vector<Blake3Input> inputs;
    // Add one input of 32 bits
    inputs.push_back(Blake3Input{
        .blackbox_input = WitnessOrConstant<bb::fr>::from_index(1),
        .num_bits = 32,
    });

    std::array<uint32_t, 32> result;
    for (size_t i = 0; i < 32; ++i) {
        result[i] = static_cast<uint32_t>(i + 2);
    }

    Blake3Constraint blake3_constraint{
        .inputs = inputs,
        .result = result,
    };

    AcirFormat constraint_system{
        .varnum = 34,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .blake3_constraints = { blake3_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness(34, fr(0));
    witness[1] = fr(12345);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLAKE3<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, MultiScalarMul)
{
    using GrumpkinPoint = bb::grumpkin::g1::affine_element;

    // Use a valid Grumpkin point (the generator)
    auto point = GrumpkinPoint::one();

    // Create a minimal MSM with one point and one scalar
    std::vector<WitnessOrConstant<bb::fr>> points;
    points.push_back(WitnessOrConstant<bb::fr>::from_index(1)); // x
    points.push_back(WitnessOrConstant<bb::fr>::from_index(2)); // y
    points.push_back(WitnessOrConstant<bb::fr>::from_index(3)); // is_infinite

    std::vector<WitnessOrConstant<bb::fr>> scalars;
    scalars.push_back(WitnessOrConstant<bb::fr>::from_index(4)); // scalar_lo
    scalars.push_back(WitnessOrConstant<bb::fr>::from_index(5)); // scalar_hi

    MultiScalarMul msm_constraint{
        .points = points,
        .scalars = scalars,
        .predicate = WitnessOrConstant<bb::fr>::from_index(6),
        .out_point_x = 7,
        .out_point_y = 8,
        .out_point_is_infinite = 9,
    };

    AcirFormat constraint_system{
        .varnum = 10,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .multi_scalar_mul_constraints = { msm_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness(10, fr(0));
    // Set valid point coordinates
    witness[1] = point.x;
    witness[2] = point.y;
    witness[3] = fr(0); // not infinite
    // Set scalar to 1
    witness[4] = fr(1); // scalar_lo
    witness[5] = fr(0); // scalar_hi
    // Set predicate to false to avoid validation
    witness[6] = fr(0);
    // Set result to the point (since scalar is 1, result = 1 * point = point)
    witness[7] = point.x;
    witness[8] = point.y;
    witness[9] = fr(0);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ MULTI_SCALAR_MUL<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcAdd)
{
    using GrumpkinPoint = bb::grumpkin::g1::affine_element;

    // Use valid Grumpkin points (the generator)
    auto point1 = GrumpkinPoint::one();
    auto point2 = GrumpkinPoint::one();
    auto result = point1 + point2;

    EcAdd ec_add_constraint{
        .input1_x = WitnessOrConstant<bb::fr>::from_index(1),
        .input1_y = WitnessOrConstant<bb::fr>::from_index(2),
        .input1_infinite = WitnessOrConstant<bb::fr>::from_index(3),
        .input2_x = WitnessOrConstant<bb::fr>::from_index(4),
        .input2_y = WitnessOrConstant<bb::fr>::from_index(5),
        .input2_infinite = WitnessOrConstant<bb::fr>::from_index(6),
        .predicate = WitnessOrConstant<bb::fr>::from_index(7),
        .result_x = 8,
        .result_y = 9,
        .result_infinite = 10,
    };

    AcirFormat constraint_system{
        .varnum = 11,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .ec_add_constraints = { ec_add_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness(11, fr(0));
    // Set valid point1 coordinates
    witness[1] = point1.x;
    witness[2] = point1.y;
    witness[3] = fr(0); // not infinite
    // Set valid point2 coordinates
    witness[4] = point2.x;
    witness[5] = point2.y;
    witness[6] = fr(0); // not infinite
    // Set predicate to false to avoid validation
    witness[7] = fr(0);
    // Set result coordinates
    witness[8] = result.x;
    witness[9] = result.y;
    witness[10] = fr(0); // not infinite

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ EC_ADD<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, BlockRomRead)
{
    // Create a simple ROM block with 2 elements and 1 read
    std::vector<arithmetic_triple> init;
    init.push_back(arithmetic_triple{
        .a = 1,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = 1,
        .q_r = 0,
        .q_o = 0,
        .q_c = 0,
    });
    init.push_back(arithmetic_triple{
        .a = 2,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = 1,
        .q_r = 0,
        .q_o = 0,
        .q_c = 0,
    });

    std::vector<MemOp> trace;
    trace.push_back(MemOp{
        .access_type = 0, // READ
        .index =
            arithmetic_triple{
                .a = 3,
                .b = 0,
                .c = 0,
                .q_m = 0,
                .q_l = 1,
                .q_r = 0,
                .q_o = 0,
                .q_c = 0,
            },
        .value =
            arithmetic_triple{
                .a = 4,
                .b = 0,
                .c = 0,
                .q_m = 0,
                .q_l = 1,
                .q_r = 0,
                .q_o = 0,
                .q_c = 0,
            },
    });

    BlockConstraint block_constraint{
        .init = init,
        .trace = trace,
        .type = BlockType::ROM,
    };

    AcirFormat constraint_system{
        .varnum = 5,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .block_constraints = { block_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{ 0, 10, 20, 0, 10 };

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLOCK_ROM_READ<TypeParam> }));
}
