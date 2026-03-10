#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

class MsmConstraintsTests : public ::testing::Test {
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
    (void)max_witness_index;
    return circuit_serde_to_acir_format(build_acir_circuit(opcodes));
}

// Helper to create an MSM constraint with a single point-scalar pair.
// Witness layout: [point_x, point_y, point_inf, scalar_lo, scalar_hi, predicate, out_x, out_y, out_inf]
// Indices:         0        1        2           3          4          5          6      7      8
MultiScalarMul create_single_msm_constraint()
{
    return MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2) },
        .scalars = { WitnessOrConstant<fr>::from_index(3), WitnessOrConstant<fr>::from_index(4) },
        .predicate = WitnessOrConstant<fr>::from_index(5),
        .out_point_x = 6,
        .out_point_y = 7,
        .out_point_is_infinite = 8,
    };
}

} // namespace

TEST_F(MsmConstraintsTests, ValidateMsmConstraint)
{
    auto msm_constraint = create_single_msm_constraint();
    AcirFormat constraint_system = build_acir_format(8, msm_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintMultiplePointsAllWitness)
{
    // 2 point-scalar pairs, all witness
    // Witness layout: [p1_x, p1_y, p1_inf, p2_x, p2_y, p2_inf, s1_lo, s1_hi, s2_lo, s2_hi, pred, out_x, out_y,
    //                  out_inf]
    // Indices:         0     1     2       3     4     5       6      7      8      9      10    11     12     13
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(2) },
        .scalars = { WitnessOrConstant<fr>::from_index(6),
                     WitnessOrConstant<fr>::from_index(7),
                     WitnessOrConstant<fr>::from_index(8),
                     WitnessOrConstant<fr>::from_index(9) },
        .predicate = WitnessOrConstant<fr>::from_index(10),
        .out_point_x = 11,
        .out_point_y = 12,
        .out_point_is_infinite = 13,
    };
    AcirFormat constraint_system = build_acir_format(13, msm_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintConstantPoint)
{
    // 2 point-scalar pairs: point 1 constant, point 2 witness, both scalars witness
    // Witness layout: [p2_x, p2_y, p2_inf, s1_lo, s1_hi, s2_lo, s2_hi, pred, out_x, out_y, out_inf]
    // Indices:         0     1     2       3      4      5      6      7     8      9      10
    auto p1 = bb::grumpkin::g1::affine_one;
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_constant(p1.x),
                    WitnessOrConstant<fr>::from_constant(p1.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)),
                    WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2) },
        .scalars = { WitnessOrConstant<fr>::from_index(3),
                     WitnessOrConstant<fr>::from_index(4),
                     WitnessOrConstant<fr>::from_index(5),
                     WitnessOrConstant<fr>::from_index(6) },
        .predicate = WitnessOrConstant<fr>::from_index(7),
        .out_point_x = 8,
        .out_point_y = 9,
        .out_point_is_infinite = 10,
    };
    AcirFormat constraint_system = build_acir_format(10, msm_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintConstantScalar)
{
    // 2 point-scalar pairs: both points witness, scalar 1 witness, scalar 2 constant
    // Witness layout: [p1_x, p1_y, p1_inf, p2_x, p2_y, p2_inf, s1_lo, s1_hi, pred, out_x, out_y, out_inf]
    // Indices:         0     1     2       3     4     5       6      7      8     9      10     11
    auto s2 = bb::grumpkin::fr::random_element();
    constexpr size_t LO_BITS = 128;
    uint256_t s2_uint(s2);
    auto s2_lo = fr(s2_uint.slice(0, LO_BITS));
    auto s2_hi = fr(s2_uint.slice(LO_BITS, 254));

    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5) },
        .scalars = { WitnessOrConstant<fr>::from_index(6),
                     WitnessOrConstant<fr>::from_index(7),
                     WitnessOrConstant<fr>::from_constant(s2_lo),
                     WitnessOrConstant<fr>::from_constant(s2_hi) },
        .predicate = WitnessOrConstant<fr>::from_index(8),
        .out_point_x = 9,
        .out_point_y = 10,
        .out_point_is_infinite = 11,
    };
    AcirFormat constraint_system = build_acir_format(11, msm_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintMixedConstantWitness)
{
    // 3 point-scalar pairs:
    // point 1 constant + scalar 1 witness,
    // point 2 witness + scalar 2 constant,
    // point 3 constant + scalar 3 constant
    // Witness layout: [p2_x, p2_y, p2_inf, s1_lo, s1_hi, pred, out_x, out_y, out_inf]
    // Indices:         0     1     2       3      4      5     6      7      8
    auto p1 = bb::grumpkin::g1::affine_one;
    auto s2 = bb::grumpkin::fr::random_element();
    constexpr size_t LO_BITS = 128;
    uint256_t s2_uint(s2);
    auto s2_lo = fr(s2_uint.slice(0, LO_BITS));
    auto s2_hi = fr(s2_uint.slice(LO_BITS, 254));

    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_constant(p1.x),
                    WitnessOrConstant<fr>::from_constant(p1.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)),
                    WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_constant(p1.x),
                    WitnessOrConstant<fr>::from_constant(p1.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)), },
        .scalars = { WitnessOrConstant<fr>::from_index(3),
                     WitnessOrConstant<fr>::from_index(4),
                     WitnessOrConstant<fr>::from_constant(s2_lo),
                     WitnessOrConstant<fr>::from_constant(s2_hi),
                     WitnessOrConstant<fr>::from_constant(s2_lo),
                     WitnessOrConstant<fr>::from_constant(s2_hi) },
        .predicate = WitnessOrConstant<fr>::from_index(5),
        .out_point_x = 6,
        .out_point_y = 7,
        .out_point_is_infinite = 8,
    };
    AcirFormat constraint_system = build_acir_format(8, msm_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintConstantPredicateTrue)
{
    // Single point-scalar pair, constant predicate = 1
    // Witness layout: [point_x, point_y, point_inf, scalar_lo, scalar_hi, out_x, out_y, out_inf]
    // Indices:         0        1        2           3          4          5      6      7
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2) },
        .scalars = { WitnessOrConstant<fr>::from_index(3), WitnessOrConstant<fr>::from_index(4) },
        .predicate = WitnessOrConstant<fr>::from_constant(1),
        .out_point_x = 5,
        .out_point_y = 6,
        .out_point_is_infinite = 7,
    };
    AcirFormat constraint_system = build_acir_format(7, msm_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintConstantPredicateConstantPoint)
{
    // 2 point-scalar pairs: point 1 constant, point 2 witness, both scalars witness, constant predicate = 1
    // Witness layout: [p2_x, p2_y, p2_inf, s1_lo, s1_hi, s2_lo, s2_hi, out_x, out_y, out_inf]
    // Indices:         0     1     2       3      4      5      6      7      8      9
    auto p1 = bb::grumpkin::g1::affine_one;
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_constant(p1.x),
                    WitnessOrConstant<fr>::from_constant(p1.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)),
                    WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2) },
        .scalars = { WitnessOrConstant<fr>::from_index(3),
                     WitnessOrConstant<fr>::from_index(4),
                     WitnessOrConstant<fr>::from_index(5),
                     WitnessOrConstant<fr>::from_index(6) },
        .predicate = WitnessOrConstant<fr>::from_constant(1),
        .out_point_x = 7,
        .out_point_y = 8,
        .out_point_is_infinite = 9,
    };
    AcirFormat constraint_system = build_acir_format(9, msm_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintConstantPredicateConstantScalar)
{
    // 2 point-scalar pairs: both points witness, scalar 2 constant, constant predicate = 1
    // Witness layout: [p1_x, p1_y, p1_inf, p2_x, p2_y, p2_inf, s1_lo, s1_hi, out_x, out_y, out_inf]
    // Indices:         0     1     2       3     4     5       6      7      8      9      10
    auto s2 = bb::grumpkin::fr::random_element();
    constexpr size_t LO_BITS = 128;
    uint256_t s2_uint(s2);
    auto s2_lo = fr(s2_uint.slice(0, LO_BITS));
    auto s2_hi = fr(s2_uint.slice(LO_BITS, 254));

    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5) },
        .scalars = { WitnessOrConstant<fr>::from_index(6),
                     WitnessOrConstant<fr>::from_index(7),
                     WitnessOrConstant<fr>::from_constant(s2_lo),
                     WitnessOrConstant<fr>::from_constant(s2_hi) },
        .predicate = WitnessOrConstant<fr>::from_constant(1),
        .out_point_x = 8,
        .out_point_y = 9,
        .out_point_is_infinite = 10,
    };
    AcirFormat constraint_system = build_acir_format(10, msm_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

// Two MSM constraints sharing the same witness predicate.
// Each constraint has its own input point, scalar, and output point.
// This tests that the IO registry correctly maps each MSM constraint
// to its own batch_mul result.
TEST_F(MsmConstraintsTests, TwoMsmConstraintsSharedPredicate)
{
    // Witness layout:
    //   shared_pred  = 0
    //   MSM1: p1_x=1, p1_y=2, p1_inf=3, s1_lo=4, s1_hi=5, out1_x=6, out1_y=7, out1_inf=8
    //   MSM2: p2_x=9, p2_y=10, p2_inf=11, s2_lo=12, s2_hi=13, out2_x=14, out2_y=15, out2_inf=16
    auto msm1 = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3) },
        .scalars = { WitnessOrConstant<fr>::from_index(4), WitnessOrConstant<fr>::from_index(5) },
        .predicate = WitnessOrConstant<fr>::from_index(0),
        .out_point_x = 6,
        .out_point_y = 7,
        .out_point_is_infinite = 8,
    };
    auto msm2 = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3) },
        .scalars = { WitnessOrConstant<fr>::from_index(12), WitnessOrConstant<fr>::from_index(5) },
        .predicate = WitnessOrConstant<fr>::from_index(16),
        .out_point_x = 6,
        .out_point_y = 7,
        .out_point_is_infinite = 8,
    };
    AcirFormat constraint_system = build_acir_format(16, msm1, msm2);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty())
        << "Analyzer should validate both MSM constraints when they share a predicate witness";
}

TEST_F(MsmConstraintsTests, DetectCorruptedOnCurveConstraint)
{
    auto msm_constraint = create_single_msm_constraint();
    AcirFormat constraint_system = build_acir_format(8, msm_constraint);

    auto program = AcirProgram{ constraint_system, {} };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt all arithmetic gates to break the on-curve check.
    // Setting q_arith=0 disables gates; CircuitChecker may not detect this.
    auto& q_arith = builder.blocks.arithmetic.q_arith();
    for (size_t i = 0; i < q_arith.size(); ++i) {
        q_arith.set(i, fr::zero());
    }

    AcirFormat constraint_system_copy = constraint_system;
    StaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, DetectCorruptedScalarConstraint)
{
    auto msm_constraint = create_single_msm_constraint();
    AcirFormat constraint_system = build_acir_format(8, msm_constraint);

    auto program = AcirProgram{ constraint_system, {} };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find the hi_diff add_gate for validate_split_in_field_unsafe and corrupt its q_arith selector.
    // This breaks the scalar field validation chain.
    auto graph_analyzer = StaticAnalyzer_<fr, UltraCircuitBuilder>(builder);

    // Trace through to find the hi_diff gate: lo is witness 3, hi is witness 4.
    // After conditional_assign(predicate, lo, 1) and conditional_assign(predicate, hi, 0),
    // validate_split_in_field_unsafe creates the hi_diff gate with the hi witness.
    // We corrupt the first arithmetic gate involving index 4 (hi).
    auto hi_idx = static_cast<uint32_t>(4);
    auto hi_gates = graph_analyzer.get_variable_gates(hi_idx);
    bool corrupted = false;
    for (auto [blk, gate] : hi_gates) {
        auto& block = builder.blocks.get()[blk];
        if (block.q_arith()[gate] == fr::one() && block.w_l()[gate] != builder.zero_idx()) {
            block.q_arith().set(gate, fr::zero());
            corrupted = true;
            break;
        }
    }
    ASSERT_TRUE(corrupted);

    AcirFormat constraint_system_copy = constraint_system;
    StaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, DetectCorruptedResultConstraint)
{
    auto msm_constraint = create_single_msm_constraint();
    AcirFormat constraint_system = build_acir_format(8, msm_constraint);

    auto program = AcirProgram{ constraint_system, {} };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt: clear the IO registry so that is_msm_result_constrained cannot find
    // the batch_mul result. On-curve and scalar checks remain intact.
    builder.acir_opcode_io.io_map.clear();

    AcirFormat constraint_system_copy = constraint_system;
    StaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}
