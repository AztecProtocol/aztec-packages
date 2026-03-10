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
        .predicate = WitnessOrConstant<fr>::from_index(0),
        .out_point_x = 6,
        .out_point_y = 7,
        .out_point_is_infinite = 16,
    };
    AcirFormat constraint_system = build_acir_format(16, msm1, msm2);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty())
        << "Analyzer should validate both MSM constraints when they share a predicate witness";
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintFourPairsAllWitness)
{
    // 4 point-scalar pairs, all witness
    // Witness: [p1(0-2), p2(3-5), p3(6-8), p4(9-11), s1(12-13), s2(14-15), s3(16-17), s4(18-19),
    //           pred(20), out(21-23)]
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5),
                    WitnessOrConstant<fr>::from_index(6),
                    WitnessOrConstant<fr>::from_index(7),
                    WitnessOrConstant<fr>::from_index(8),
                    WitnessOrConstant<fr>::from_index(9),
                    WitnessOrConstant<fr>::from_index(10),
                    WitnessOrConstant<fr>::from_index(11) },
        .scalars = { WitnessOrConstant<fr>::from_index(12),
                     WitnessOrConstant<fr>::from_index(13),
                     WitnessOrConstant<fr>::from_index(14),
                     WitnessOrConstant<fr>::from_index(15),
                     WitnessOrConstant<fr>::from_index(16),
                     WitnessOrConstant<fr>::from_index(17),
                     WitnessOrConstant<fr>::from_index(18),
                     WitnessOrConstant<fr>::from_index(19) },
        .predicate = WitnessOrConstant<fr>::from_index(20),
        .out_point_x = 21,
        .out_point_y = 22,
        .out_point_is_infinite = 23,
    };
    AcirFormat constraint_system = build_acir_format(23, msm_constraint);

    auto p1 = bb::grumpkin::g1::affine_one;
    auto p2 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(2));
    auto p3 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(3));
    auto p4 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(4));
    auto s1 = bb::grumpkin::fr::random_element();
    auto s2 = bb::grumpkin::fr::random_element();
    auto s3 = bb::grumpkin::fr::random_element();
    auto s4 = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s1_uint(s1), s2_uint(s2), s3_uint(s3), s4_uint(s4);
    auto result = bb::grumpkin::g1::affine_element(p1 * s1 + p2 * s2 + p3 * s3 + p4 * s4);

    auto witness = WitnessVector{
        p1.x,
        p1.y,
        fr(0),
        p2.x,
        p2.y,
        fr(0),
        p3.x,
        p3.y,
        fr(0),
        p4.x,
        p4.y,
        fr(0),
        fr(s1_uint.slice(0, LO_BITS)),
        fr(s1_uint.slice(LO_BITS, 254)),
        fr(s2_uint.slice(0, LO_BITS)),
        fr(s2_uint.slice(LO_BITS, 254)),
        fr(s3_uint.slice(0, LO_BITS)),
        fr(s3_uint.slice(LO_BITS, 254)),
        fr(s4_uint.slice(0, LO_BITS)),
        fr(s4_uint.slice(LO_BITS, 254)),
        fr(1),
        result.x,
        result.y,
        fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintFivePairsMixed)
{
    // 5 pairs: p1 const, p2 witness, p3 const, p4 witness, p5 witness
    //          s1 witness, s2 const, s3 witness, s4 const, s5 witness
    // Witness: [p2(0-2), p4(3-5), p5(6-8), s1(9-10), s3(11-12), s5(13-14), pred(15), out(16-18)]
    auto p1 = bb::grumpkin::g1::affine_one;
    auto p3 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(3));
    auto s2 = bb::grumpkin::fr::random_element();
    auto s4 = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s2_uint(s2), s4_uint(s4);
    auto s2_lo = fr(s2_uint.slice(0, LO_BITS));
    auto s2_hi = fr(s2_uint.slice(LO_BITS, 254));
    auto s4_lo = fr(s4_uint.slice(0, LO_BITS));
    auto s4_hi = fr(s4_uint.slice(LO_BITS, 254));

    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_constant(p1.x),
                    WitnessOrConstant<fr>::from_constant(p1.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)),
                    WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_constant(p3.x),
                    WitnessOrConstant<fr>::from_constant(p3.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5),
                    WitnessOrConstant<fr>::from_index(6),
                    WitnessOrConstant<fr>::from_index(7),
                    WitnessOrConstant<fr>::from_index(8) },
        .scalars = { WitnessOrConstant<fr>::from_index(9),
                     WitnessOrConstant<fr>::from_index(10),
                     WitnessOrConstant<fr>::from_constant(s2_lo),
                     WitnessOrConstant<fr>::from_constant(s2_hi),
                     WitnessOrConstant<fr>::from_index(11),
                     WitnessOrConstant<fr>::from_index(12),
                     WitnessOrConstant<fr>::from_constant(s4_lo),
                     WitnessOrConstant<fr>::from_constant(s4_hi),
                     WitnessOrConstant<fr>::from_index(13),
                     WitnessOrConstant<fr>::from_index(14) },
        .predicate = WitnessOrConstant<fr>::from_index(15),
        .out_point_x = 16,
        .out_point_y = 17,
        .out_point_is_infinite = 18,
    };
    AcirFormat constraint_system = build_acir_format(18, msm_constraint);

    auto p2 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(2));
    auto p4 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(4));
    auto p5 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(5));
    auto s1 = bb::grumpkin::fr::random_element();
    auto s3 = bb::grumpkin::fr::random_element();
    auto s5 = bb::grumpkin::fr::random_element();

    uint256_t s1_uint(s1), s3_uint(s3), s5_uint(s5);
    auto result = bb::grumpkin::g1::affine_element(p1 * s1 + p2 * s2 + p3 * s3 + p4 * s4 + p5 * s5);

    auto witness = WitnessVector{
        p2.x,
        p2.y,
        fr(0),
        p4.x,
        p4.y,
        fr(0),
        p5.x,
        p5.y,
        fr(0),
        fr(s1_uint.slice(0, LO_BITS)),
        fr(s1_uint.slice(LO_BITS, 254)),
        fr(s3_uint.slice(0, LO_BITS)),
        fr(s3_uint.slice(LO_BITS, 254)),
        fr(s5_uint.slice(0, LO_BITS)),
        fr(s5_uint.slice(LO_BITS, 254)),
        fr(1),
        result.x,
        result.y,
        fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintReusedPointWitness)
{
    // 2 pairs: same point witness used for both, different scalars
    // Tests consumed_gates disambiguation when identical point gates are created twice
    // Witness: [p_x(0), p_y(1), p_inf(2), s1(3-4), s2(5-6), pred(7), out(8-10)]
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
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

    auto p = bb::grumpkin::g1::affine_one;
    auto s1 = bb::grumpkin::fr::random_element();
    auto s2 = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s1_uint(s1), s2_uint(s2);
    auto result = bb::grumpkin::g1::affine_element(p * s1 + p * s2);

    auto witness = WitnessVector{
        p.x,
        p.y,
        fr(0),
        fr(s1_uint.slice(0, LO_BITS)),
        fr(s1_uint.slice(LO_BITS, 254)),
        fr(s2_uint.slice(0, LO_BITS)),
        fr(s2_uint.slice(LO_BITS, 254)),
        fr(1),
        result.x,
        result.y,
        fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintReusedScalarWitness)
{
    // 2 pairs: different points, same scalar witness for both
    // Tests consumed_gates disambiguation when identical scalar gates are created twice
    // Witness: [p1(0-2), p2(3-5), s(6-7), pred(8), out(9-11)]
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5) },
        .scalars = { WitnessOrConstant<fr>::from_index(6),
                     WitnessOrConstant<fr>::from_index(7),
                     WitnessOrConstant<fr>::from_index(6),
                     WitnessOrConstant<fr>::from_index(7) },
        .predicate = WitnessOrConstant<fr>::from_index(8),
        .out_point_x = 9,
        .out_point_y = 10,
        .out_point_is_infinite = 11,
    };
    AcirFormat constraint_system = build_acir_format(11, msm_constraint);

    auto p1 = bb::grumpkin::g1::affine_one;
    auto p2 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(2));
    auto s = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s_uint(s);
    auto result = bb::grumpkin::g1::affine_element(p1 * s + p2 * s);

    auto witness = WitnessVector{
        p1.x,  p1.y,     fr(0),    p2.x,  p2.y, fr(0), fr(s_uint.slice(0, LO_BITS)), fr(s_uint.slice(LO_BITS, 254)),
        fr(1), result.x, result.y, fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintAllConstantPointsWitnessScalars)
{
    // 4 pairs: all points constant, all scalars witness
    // Witness: [s1(0-1), s2(2-3), s3(4-5), s4(6-7), pred(8), out(9-11)]
    auto p1 = bb::grumpkin::g1::affine_one;
    auto p2 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(2));
    auto p3 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(3));
    auto p4 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(4));

    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_constant(p1.x),
                    WitnessOrConstant<fr>::from_constant(p1.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)),
                    WitnessOrConstant<fr>::from_constant(p2.x),
                    WitnessOrConstant<fr>::from_constant(p2.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)),
                    WitnessOrConstant<fr>::from_constant(p3.x),
                    WitnessOrConstant<fr>::from_constant(p3.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)),
                    WitnessOrConstant<fr>::from_constant(p4.x),
                    WitnessOrConstant<fr>::from_constant(p4.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)) },
        .scalars = { WitnessOrConstant<fr>::from_index(0),
                     WitnessOrConstant<fr>::from_index(1),
                     WitnessOrConstant<fr>::from_index(2),
                     WitnessOrConstant<fr>::from_index(3),
                     WitnessOrConstant<fr>::from_index(4),
                     WitnessOrConstant<fr>::from_index(5),
                     WitnessOrConstant<fr>::from_index(6),
                     WitnessOrConstant<fr>::from_index(7) },
        .predicate = WitnessOrConstant<fr>::from_index(8),
        .out_point_x = 9,
        .out_point_y = 10,
        .out_point_is_infinite = 11,
    };
    AcirFormat constraint_system = build_acir_format(11, msm_constraint);

    auto s1 = bb::grumpkin::fr::random_element();
    auto s2 = bb::grumpkin::fr::random_element();
    auto s3 = bb::grumpkin::fr::random_element();
    auto s4 = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s1_uint(s1), s2_uint(s2), s3_uint(s3), s4_uint(s4);
    auto result = bb::grumpkin::g1::affine_element(p1 * s1 + p2 * s2 + p3 * s3 + p4 * s4);

    auto witness = WitnessVector{
        fr(s1_uint.slice(0, LO_BITS)),
        fr(s1_uint.slice(LO_BITS, 254)),
        fr(s2_uint.slice(0, LO_BITS)),
        fr(s2_uint.slice(LO_BITS, 254)),
        fr(s3_uint.slice(0, LO_BITS)),
        fr(s3_uint.slice(LO_BITS, 254)),
        fr(s4_uint.slice(0, LO_BITS)),
        fr(s4_uint.slice(LO_BITS, 254)),
        fr(1),
        result.x,
        result.y,
        fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintAllWitnessPointsConstantScalars)
{
    // 3 pairs: all points witness, all scalars constant
    // Witness: [p1(0-2), p2(3-5), p3(6-8), pred(9), out(10-12)]
    auto s1 = bb::grumpkin::fr::random_element();
    auto s2 = bb::grumpkin::fr::random_element();
    auto s3 = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s1_uint(s1), s2_uint(s2), s3_uint(s3);

    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5),
                    WitnessOrConstant<fr>::from_index(6),
                    WitnessOrConstant<fr>::from_index(7),
                    WitnessOrConstant<fr>::from_index(8) },
        .scalars = { WitnessOrConstant<fr>::from_constant(fr(s1_uint.slice(0, LO_BITS))),
                     WitnessOrConstant<fr>::from_constant(fr(s1_uint.slice(LO_BITS, 254))),
                     WitnessOrConstant<fr>::from_constant(fr(s2_uint.slice(0, LO_BITS))),
                     WitnessOrConstant<fr>::from_constant(fr(s2_uint.slice(LO_BITS, 254))),
                     WitnessOrConstant<fr>::from_constant(fr(s3_uint.slice(0, LO_BITS))),
                     WitnessOrConstant<fr>::from_constant(fr(s3_uint.slice(LO_BITS, 254))) },
        .predicate = WitnessOrConstant<fr>::from_index(9),
        .out_point_x = 10,
        .out_point_y = 11,
        .out_point_is_infinite = 12,
    };
    AcirFormat constraint_system = build_acir_format(12, msm_constraint);

    auto p1 = bb::grumpkin::g1::affine_one;
    auto p2 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(2));
    auto p3 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(3));
    auto result = bb::grumpkin::g1::affine_element(p1 * s1 + p2 * s2 + p3 * s3);

    auto witness = WitnessVector{
        p1.x, p1.y, fr(0), p2.x, p2.y, fr(0), p3.x, p3.y, fr(0), fr(1), result.x, result.y, fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintSingleBothConstant)
{
    // Single pair: both point and scalar constant, witness predicate
    // Tests the fully-constant input path (on-curve skipped, scalar validation trivial)
    // Witness: [pred(0), out(1-3)]
    auto p = bb::grumpkin::g1::affine_one;
    auto s = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s_uint(s);
    auto s_lo = fr(s_uint.slice(0, LO_BITS));
    auto s_hi = fr(s_uint.slice(LO_BITS, 254));

    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_constant(p.x),
                    WitnessOrConstant<fr>::from_constant(p.y),
                    WitnessOrConstant<fr>::from_constant(fr(0)) },
        .scalars = { WitnessOrConstant<fr>::from_constant(s_lo), WitnessOrConstant<fr>::from_constant(s_hi) },
        .predicate = WitnessOrConstant<fr>::from_index(0),
        .out_point_x = 1,
        .out_point_y = 2,
        .out_point_is_infinite = 3,
    };
    AcirFormat constraint_system = build_acir_format(3, msm_constraint);

    auto result = bb::grumpkin::g1::affine_element(p * s);
    auto witness = WitnessVector{ fr(1), result.x, result.y, fr(0) };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintFourPairsConstantPredicate)
{
    // 4 point-scalar pairs, all witness, constant predicate = 1
    // Tests constant-predicate code path (no conditional_assign, standardize-based result check) at scale
    // Witness: [p1(0-2), p2(3-5), p3(6-8), p4(9-11), s1(12-13), s2(14-15), s3(16-17), s4(18-19), out(20-22)]
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5),
                    WitnessOrConstant<fr>::from_index(6),
                    WitnessOrConstant<fr>::from_index(7),
                    WitnessOrConstant<fr>::from_index(8),
                    WitnessOrConstant<fr>::from_index(9),
                    WitnessOrConstant<fr>::from_index(10),
                    WitnessOrConstant<fr>::from_index(11) },
        .scalars = { WitnessOrConstant<fr>::from_index(12),
                     WitnessOrConstant<fr>::from_index(13),
                     WitnessOrConstant<fr>::from_index(14),
                     WitnessOrConstant<fr>::from_index(15),
                     WitnessOrConstant<fr>::from_index(16),
                     WitnessOrConstant<fr>::from_index(17),
                     WitnessOrConstant<fr>::from_index(18),
                     WitnessOrConstant<fr>::from_index(19) },
        .predicate = WitnessOrConstant<fr>::from_constant(1),
        .out_point_x = 20,
        .out_point_y = 21,
        .out_point_is_infinite = 22,
    };
    AcirFormat constraint_system = build_acir_format(22, msm_constraint);

    auto p1 = bb::grumpkin::g1::affine_one;
    auto p2 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(2));
    auto p3 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(3));
    auto p4 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(4));
    auto s1 = bb::grumpkin::fr::random_element();
    auto s2 = bb::grumpkin::fr::random_element();
    auto s3 = bb::grumpkin::fr::random_element();
    auto s4 = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s1_uint(s1), s2_uint(s2), s3_uint(s3), s4_uint(s4);
    auto result = bb::grumpkin::g1::affine_element(p1 * s1 + p2 * s2 + p3 * s3 + p4 * s4);

    auto witness = WitnessVector{
        p1.x,
        p1.y,
        fr(0),
        p2.x,
        p2.y,
        fr(0),
        p3.x,
        p3.y,
        fr(0),
        p4.x,
        p4.y,
        fr(0),
        fr(s1_uint.slice(0, LO_BITS)),
        fr(s1_uint.slice(LO_BITS, 254)),
        fr(s2_uint.slice(0, LO_BITS)),
        fr(s2_uint.slice(LO_BITS, 254)),
        fr(s3_uint.slice(0, LO_BITS)),
        fr(s3_uint.slice(LO_BITS, 254)),
        fr(s4_uint.slice(0, LO_BITS)),
        fr(s4_uint.slice(LO_BITS, 254)),
        result.x,
        result.y,
        fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintInfinityAsPredicate)
{
    // Reuse the is_infinity witness (value 0) as the predicate, making the constraint inactive.
    // Tests that the analyzer handles the predicate=false code path when the same witness
    // serves dual roles (point metadata + control flow).
    // Witness: [p_x(0), p_y(1), p_inf_AND_pred(2), s_lo(3), s_hi(4), out_x(5), out_y(6), out_inf(7)]
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2) },
        .scalars = { WitnessOrConstant<fr>::from_index(3), WitnessOrConstant<fr>::from_index(4) },
        .predicate = WitnessOrConstant<fr>::from_index(2), // same as is_infinity
        .out_point_x = 5,
        .out_point_y = 6,
        .out_point_is_infinite = 7,
    };
    AcirFormat constraint_system = build_acir_format(7, msm_constraint);

    // With predicate=0, the MSM is inactive: all inputs become dummies (generator, scalar=1),
    // batch_mul = generator*1 = generator. conditional_assign(0, input_result, batch_mul) = batch_mul.
    // The output witnesses don't affect correctness since they're multiplied by pred=0.
    auto point = bb::grumpkin::g1::affine_one;
    auto scalar = bb::grumpkin::fr::random_element();
    constexpr size_t LO_BITS = 128;
    uint256_t scalar_uint(scalar);

    // Output = generator (the batch_mul result when predicate=0)
    auto gen = bb::grumpkin::g1::affine_one;
    auto witness = WitnessVector{
        point.x,
        point.y,
        fr(0), // is_infinity=0, also used as predicate=0 (inactive)
        fr(scalar_uint.slice(0, LO_BITS)),
        fr(scalar_uint.slice(LO_BITS, 254)),
        gen.x,
        gen.y,
        fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MsmConstraintsTests, ValidateMsmConstraintCoordinateAsScalar)
{
    // Reuse the point's x-coordinate witness as the scalar's lo limb.
    // Using generator (x=1), scalar = (lo=1, hi=0) = 1, so MSM = generator * 1 = generator.
    // A second pair with fresh indices ensures the analyzer handles mixed reuse.
    // Witness: [shared_px1_slo1(0), p1_y(1), p1_inf(2), s1_hi(3),
    //           p2_x(4), p2_y(5), p2_inf(6), s2_lo(7), s2_hi(8),
    //           pred(9), out_x(10), out_y(11), out_inf(12)]
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0), // p1_x, shared with s1_lo
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5),
                    WitnessOrConstant<fr>::from_index(6) },
        .scalars = { WitnessOrConstant<fr>::from_index(0), // s1_lo, shared with p1_x
                     WitnessOrConstant<fr>::from_index(3),
                     WitnessOrConstant<fr>::from_index(7),
                     WitnessOrConstant<fr>::from_index(8) },
        .predicate = WitnessOrConstant<fr>::from_index(9),
        .out_point_x = 10,
        .out_point_y = 11,
        .out_point_is_infinite = 12,
    };
    AcirFormat constraint_system = build_acir_format(12, msm_constraint);

    auto p1 = bb::grumpkin::g1::affine_one; // x = 1
    auto p2 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(2));
    auto s2 = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s2_uint(s2);

    // Pair 1: point=generator, scalar=(generator.x, 0) = (1, 0) = 1 → generator * 1 = generator
    // Pair 2: point=2G, scalar=s2 → 2G * s2
    auto result = bb::grumpkin::g1::affine_element(p1 * bb::grumpkin::fr(1) + p2 * s2);

    auto witness = WitnessVector{
        p1.x,                            // 0: shared between p1_x and s1_lo (value = 1)
        p1.y,                            // 1
        fr(0),                           // 2: p1_inf
        fr(0),                           // 3: s1_hi = 0 (so full scalar = s1_lo = 1)
        p2.x,                            // 4
        p2.y,                            // 5
        fr(0),                           // 6: p2_inf
        fr(s2_uint.slice(0, LO_BITS)),   // 7: s2_lo
        fr(s2_uint.slice(LO_BITS, 254)), // 8: s2_hi
        fr(1),                           // 9: predicate
        result.x,                        // 10
        result.y,                        // 11
        fr(0),                           // 12: out_inf
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
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

TEST_F(MsmConstraintsTests, DetectCorruptedScalarMultiPoint)
{
    // 3 point-scalar pairs, all witness. Corrupt one scalar's validation chain.
    // Verifies corruption detection works on longer MSMs, not just single-pair.
    // Witness: [p1(0-2), p2(3-5), p3(6-8), s1(9-10), s2(11-12), s3(13-14), pred(15), out(16-18)]
    auto msm_constraint = MultiScalarMul{
        .points = { WitnessOrConstant<fr>::from_index(0),
                    WitnessOrConstant<fr>::from_index(1),
                    WitnessOrConstant<fr>::from_index(2),
                    WitnessOrConstant<fr>::from_index(3),
                    WitnessOrConstant<fr>::from_index(4),
                    WitnessOrConstant<fr>::from_index(5),
                    WitnessOrConstant<fr>::from_index(6),
                    WitnessOrConstant<fr>::from_index(7),
                    WitnessOrConstant<fr>::from_index(8) },
        .scalars = { WitnessOrConstant<fr>::from_index(9),
                     WitnessOrConstant<fr>::from_index(10),
                     WitnessOrConstant<fr>::from_index(11),
                     WitnessOrConstant<fr>::from_index(12),
                     WitnessOrConstant<fr>::from_index(13),
                     WitnessOrConstant<fr>::from_index(14) },
        .predicate = WitnessOrConstant<fr>::from_index(15),
        .out_point_x = 16,
        .out_point_y = 17,
        .out_point_is_infinite = 18,
    };
    AcirFormat constraint_system = build_acir_format(18, msm_constraint);

    auto p1 = bb::grumpkin::g1::affine_one;
    auto p2 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(2));
    auto p3 = bb::grumpkin::g1::affine_element(bb::grumpkin::g1::one * bb::grumpkin::fr(3));
    auto s1 = bb::grumpkin::fr::random_element();
    auto s2 = bb::grumpkin::fr::random_element();
    auto s3 = bb::grumpkin::fr::random_element();

    constexpr size_t LO_BITS = 128;
    uint256_t s1_uint(s1), s2_uint(s2), s3_uint(s3);
    auto result = bb::grumpkin::g1::affine_element(p1 * s1 + p2 * s2 + p3 * s3);

    auto witness = WitnessVector{
        p1.x,
        p1.y,
        fr(0),
        p2.x,
        p2.y,
        fr(0),
        p3.x,
        p3.y,
        fr(0),
        fr(s1_uint.slice(0, LO_BITS)),
        fr(s1_uint.slice(LO_BITS, 254)),
        fr(s2_uint.slice(0, LO_BITS)),
        fr(s2_uint.slice(LO_BITS, 254)),
        fr(s3_uint.slice(0, LO_BITS)),
        fr(s3_uint.slice(LO_BITS, 254)),
        fr(1),
        result.x,
        result.y,
        fr(0),
    };

    auto program = AcirProgram{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt the scalar field validation for s3 (hi witness at index 14)
    // by disabling the hi_diff arithmetic gate. This breaks s3's validation chain
    // while leaving s1 and s2 intact.
    auto graph_analyzer = StaticAnalyzer_<fr, UltraCircuitBuilder>(builder);
    auto s3_hi_idx = static_cast<uint32_t>(14);
    auto s3_hi_gates = graph_analyzer.get_variable_gates(s3_hi_idx);
    bool corrupted = false;
    for (auto [blk, gate] : s3_hi_gates) {
        auto& block = builder.blocks.get()[blk];
        if (block.q_arith()[gate] == fr::one() && block.w_l()[gate] != builder.zero_idx()) {
            block.q_arith().set(gate, fr::zero());
            corrupted = true;
            break;
        }
    }
    ASSERT_TRUE(corrupted);

    StaticAnalyzerAcir analyzer2(std::move(constraint_system), std::move(builder));
    analyzer2.process_constraint_system();
    EXPECT_FALSE(analyzer2.get_incorrect_opcodes().empty());
}
