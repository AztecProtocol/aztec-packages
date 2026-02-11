#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/boomerang_value_detection/helpers/cycle_group_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/field_t_helpers.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/noir_programs_boomerang_values/helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

class EcAddConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
namespace {

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

EcAdd create_ec_add_constraint(std::vector<WitnessOrConstant<bb::fr>> input1,
                               std::vector<WitnessOrConstant<bb::fr>> input2,
                               std::vector<uint32_t> result,
                               WitnessOrConstant<bb::fr> predicate)
{
    return EcAdd{
        .input1_x = input1[0],
        .input1_y = input1[1],
        .input1_infinite = input1[2],
        .input2_x = input2[0],
        .input2_y = input2[1],
        .input2_infinite = input2[2],
        .predicate = predicate,
        .result_x = result[0],
        .result_y = result[1],
        .result_infinite = result[2],
    };
}

template <typename CircuitBuilder>
size_t find_mul_gate_idx(CircuitBuilder& builder,
                         const cdg::Field<CircuitBuilder>& a_field,
                         const cdg::Field<CircuitBuilder>& b_field,
                         const uint32_t result_idx)
{
    const auto a_idx = a_field.witness_index;
    const auto b_idx = b_field.witness_index;
    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); ++gate_idx) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == a_idx;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == b_idx;
        condition &= builder.blocks.arithmetic.w_o()[gate_idx] == result_idx;
        condition &= builder.blocks.arithmetic.w_4()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.q_arith()[gate_idx] == fr::one();
        if (condition) {
            return gate_idx;
        }
    }
    throw std::runtime_error("No mul gate found for given inputs");
}
} // namespace

TEST_F(EcAddConstraintsTests, ValidateEcAddConstraint)
{
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_constant(1) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(3),
                                                          WitnessOrConstant<bb::fr>::from_index(4),
                                                          WitnessOrConstant<bb::fr>::from_index(5) };
    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(6);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto input_point = bb::grumpkin::g1::affine_one;
    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcAddConstraintsTests, ValidateEcAddConstraintLhsPointConstant)
{
    const auto input_point = bb::grumpkin::g1::affine_one;
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_constant(input_point.x),
                                                          WitnessOrConstant<bb::fr>::from_constant(fr(input_point.y)),
                                                          WitnessOrConstant<bb::fr>::from_constant(0) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_index(5) };
    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(2);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcAddConstraintsTests, ValidateEcAddConstraintRhsPointConstant)
{
    const auto input_point = bb::grumpkin::g1::affine_one;
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_index(2) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_constant(input_point.x),
                                                          WitnessOrConstant<bb::fr>::from_constant(fr(input_point.y)),
                                                          WitnessOrConstant<bb::fr>::from_constant(0) };

    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(6);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcAddConstraintsTests, ValidateEcAddConstraintWithConstHell)
{
    const auto input_point = bb::grumpkin::g1::affine_one;
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_constant(input_point.x),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_constant(0) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_constant(input_point.y),
                                                          WitnessOrConstant<bb::fr>::from_index(5) };
    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(2);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcAddConstraintsTests, DetectCorruptedOnCurveConstraint)
{
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_index(2) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(3),
                                                          WitnessOrConstant<bb::fr>::from_index(4),
                                                          WitnessOrConstant<bb::fr>::from_index(5) };
    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(6);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto input_point = bb::grumpkin::g1::affine_one;
    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt the arithmetic gates to simulate a missing on-curve check; CircuitChecker may still pass
    // because constraints are disabled via selectors.
    auto& q_arith = builder.blocks.arithmetic.q_arith();
    for (size_t i = 0; i < q_arith.size(); ++i) {
        q_arith.set(i, fr::zero());
    }

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcAddConstraintsTests, DetectCorruptedOnCurveMulGate)
{
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_index(2) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(3),
                                                          WitnessOrConstant<bb::fr>::from_index(4),
                                                          WitnessOrConstant<bb::fr>::from_index(5) };
    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(6);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto input_point = bb::grumpkin::g1::affine_one;
    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    cdg::Point<fr> input1_point{ input1[0], input1[1], input1[2] };
    auto graph_analyzer = StaticAnalyzer_<fr, UltraCircuitBuilder>(builder);
    auto real_point = *cdg::get_real_point<fr>(graph_analyzer, builder, input1_point, predicate);
    auto x_field = real_point.x;
    auto xx_field = cdg::get_mul_gate_output<fr>(graph_analyzer, builder, x_field, x_field);
    auto mul_gate_idx = find_mul_gate_idx(builder, x_field, x_field, xx_field->witness_index);

    // Corrupt the mul gate selector so the analyzer can no longer find the on-curve chain.
    builder.blocks.arithmetic.q_m().set(mul_gate_idx, fr::zero());

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcAddConstraintsTests, DetectCorruptedOnCurveConstraintInput2Gate)
{
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_index(2) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(3),
                                                          WitnessOrConstant<bb::fr>::from_index(4),
                                                          WitnessOrConstant<bb::fr>::from_index(5) };
    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(6);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto input_point = bb::grumpkin::g1::affine_one;
    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    cdg::Point<fr> input2_point{ input2[0], input2[1], input2[2] };
    auto graph_analyzer = StaticAnalyzer_<fr, UltraCircuitBuilder>(builder);
    auto real_point = *cdg::get_real_point<fr>(graph_analyzer, builder, input2_point, predicate);
    auto x_field = real_point.x;
    auto xx_field = cdg::get_mul_gate_output<fr>(graph_analyzer, builder, x_field, x_field);
    auto mul_gate_idx = find_mul_gate_idx(builder, x_field, x_field, xx_field->witness_index);
    builder.blocks.arithmetic.q_arith().set(mul_gate_idx, fr::zero());

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

// Corrupt the ECC dbl gate in the elliptic block so the analyzer can no longer
// trace through the addition chain.
TEST_F(EcAddConstraintsTests, DetectCorruptedDblGate)
{
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_index(2) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(3),
                                                          WitnessOrConstant<bb::fr>::from_index(4),
                                                          WitnessOrConstant<bb::fr>::from_index(5) };
    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(6);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto input_point = bb::grumpkin::g1::affine_one;
    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt the elliptic block: set q_m=0 (removes is_double flag) on all dbl gates
    // CircuitChecker may still pass since we only change the selector.
    auto& elliptic_block = builder.blocks.elliptic;
    for (size_t i = 0; i < elliptic_block.size(); ++i) {
        if (elliptic_block.q_m()[i] == fr::one()) {
            elliptic_block.q_m().set(i, fr::zero());
        }
    }

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

// Corrupt the lambda computation gate (evaluate_polynomial_identity for x_diff * lambda = y2 - y1)
// so the analyzer cannot find the addition formula.
TEST_F(EcAddConstraintsTests, DetectCorruptedLambdaGate)
{
    auto input1 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(0),
                                                          WitnessOrConstant<bb::fr>::from_index(1),
                                                          WitnessOrConstant<bb::fr>::from_index(2) };
    auto input2 = std::vector<WitnessOrConstant<bb::fr>>{ WitnessOrConstant<bb::fr>::from_index(3),
                                                          WitnessOrConstant<bb::fr>::from_index(4),
                                                          WitnessOrConstant<bb::fr>::from_index(5) };
    auto result = std::vector<uint32_t>{ 7, 8, 9 };
    auto predicate = WitnessOrConstant<bb::fr>::from_index(6);
    auto ec_add_constraint = create_ec_add_constraint(input1, input2, result, predicate);
    AcirFormat constraint_system = build_acir_format(9, ec_add_constraint);

    const auto input_point = bb::grumpkin::g1::affine_one;
    const auto result_point = input_point + input_point;
    auto witness = WitnessVector{
        input_point.x, input_point.y, fr(0),          input_point.x,  input_point.y,
        fr(0),         fr(1),         result_point.x, result_point.y, fr(0),
    };
    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find the x_diff gate (add_two for x2.add_two(-x1, x_coord_match)) and corrupt its
    // q_arith selector, which will prevent the analyzer from finding x_diff, and consequently lambda.
    cdg::Point<fr> input1_point_cdg{ input1[0], input1[1], input1[2] };
    cdg::Point<fr> input2_point_cdg{ input2[0], input2[1], input2[2] };
    auto graph_analyzer = StaticAnalyzer_<fr, UltraCircuitBuilder>(builder);
    auto real_p1 = *cdg::get_real_point<fr>(graph_analyzer, builder, input1_point_cdg, predicate);
    auto real_p2 = *cdg::get_real_point<fr>(graph_analyzer, builder, input2_point_cdg, predicate);

    // Get x_coordinates_match to then find x_diff
    auto x_coord_match = cdg::get_equality_result<fr>(graph_analyzer, builder, real_p1.x, real_p2.x);
    ASSERT_TRUE(x_coord_match.has_value());

    auto neg_x1 = cdg::Field<UltraCircuitBuilder>{ real_p1.x.witness_index, -real_p1.x.witness };
    auto x_coord_match_field =
        cdg::Field<UltraCircuitBuilder>{ x_coord_match->witness_index,
                                         bb::stdlib::field_t<UltraCircuitBuilder>(x_coord_match->witness) };
    auto x_diff = cdg::get_add_two_gate_output<fr>(graph_analyzer, builder, real_p2.x, neg_x1, x_coord_match_field);
    ASSERT_TRUE(x_diff.has_value());

    // Find the lambda gate: evaluate_polynomial_identity(x_diff, lambda, -y2, y1)
    auto neg_y2 = cdg::Field<UltraCircuitBuilder>{ real_p2.y.witness_index, -real_p2.y.witness };
    auto lambda = cdg::get_evaluate_polynomial_identity_b<fr>(graph_analyzer, builder, *x_diff, neg_y2, real_p1.y);
    ASSERT_TRUE(lambda.has_value());

    // Find and corrupt the lambda gate by setting q_arith to zero
    auto lambda_gates = graph_analyzer.get_variable_gates(x_diff->witness_index);
    for (auto [blk_idx, gate_idx] : lambda_gates) {
        auto& block = builder.blocks.get()[blk_idx];
        if (block.w_r()[gate_idx] == lambda->witness_index) {
            block.q_arith().set(gate_idx, fr::zero());
            break;
        }
    }

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}
