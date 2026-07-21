#include "arithmetic_constraints.hpp"
#include "acir_format.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"

#include <algorithm>
#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;

template <typename Builder_,
          typename AcirConstraint_,
          size_t num_multiplication_terms,
          size_t num_linear_terms,
          bool overlap_mul_and_linear,
          bool overlap_linear>
class ArithmeticConstraintParams {
  public:
    using Builder = Builder_;
    using AcirConstraint = AcirConstraint_;
    static constexpr size_t NUM_MULTIPLICATION_TERMS = num_multiplication_terms;
    static constexpr size_t NUM_LINEAR_TERMS = num_linear_terms;
    static constexpr bool OVERLAP_MUL_AND_LINEAR = overlap_mul_and_linear;
    static constexpr bool OVERLAP_LINEAR = overlap_linear;
};

template <typename Builder_,
          typename AcirConstraint_,
          size_t num_multiplication_terms,
          size_t num_linear_terms,
          bool overlap_mul_and_linear,
          bool overlap_linear>
class ArithmeticConstraintsTestingFunctions {
  public:
    using Builder = Builder_;
    using AcirConstraint = AcirConstraint_;

    static constexpr bool IS_BIG_QUAD = std::is_same_v<AcirConstraint, BigQuadConstraint>;

    /**
     * @brief Compute the number of elements to overlap between multiplication and linear terms
     */
    static constexpr size_t num_overlap_mul_and_linear()
    {
        size_t result = 0;

        if constexpr (overlap_mul_and_linear) {
            result++;
        }

        if constexpr (overlap_mul_and_linear && num_multiplication_terms > 1) {
            result++;
        }

        if constexpr (overlap_mul_and_linear && num_multiplication_terms > 2) {
            result++;
        }

        return result;
    }

    static constexpr size_t NUM_OVERLAP_MUL_AND_LINEAR = num_overlap_mul_and_linear();
    static constexpr size_t NUM_OVERLAP_LINEAR = 1;
    static constexpr size_t LINEAR_OFFSET = overlap_mul_and_linear ? NUM_OVERLAP_MUL_AND_LINEAR : 0U;

    static size_t expected_num_gates()
    {
        size_t num_gates = 0;

        size_t num_multiplication_gates = num_multiplication_terms;
        num_gates += num_multiplication_gates;

        // Compute the number of witnesses that have to be put into wires on top of the multiplication terms
        size_t num_witnesses_into_wires = num_linear_terms;
        num_witnesses_into_wires -= overlap_mul_and_linear ? NUM_OVERLAP_MUL_AND_LINEAR : 0U;
        num_witnesses_into_wires -= overlap_linear ? NUM_OVERLAP_LINEAR : 0U;

        // Update the number of required gates

        // The first gate uses all wires, so we fit two new witnesses when there are multiplication terms, 4 otherwise
        size_t num_witnesses_first_wire = num_multiplication_gates != 0 ? 2U : 4U;
        if (num_witnesses_into_wires <= num_witnesses_first_wire) {
            return num_multiplication_gates != 0 ? num_multiplication_gates : 1U;
        }
        num_witnesses_into_wires -= num_witnesses_first_wire;
        num_gates += num_multiplication_gates != 0 ? 0U : 1U;

        // All other gates don't use the last wire, so we fit one new witness per gate
        if (num_witnesses_into_wires + 1 <= num_gates) {
            return num_gates;
        }
        num_witnesses_into_wires -= (num_multiplication_gates - 1);

        // Now we add the remaining witnesses
        size_t num_additional_gates = num_witnesses_into_wires / (Builder::NUM_WIRES - 1);
        size_t diff = num_witnesses_into_wires - num_additional_gates * (Builder::NUM_WIRES - 1);
        num_additional_gates += diff == 0 ? 0U : 1U;

        return num_gates + num_additional_gates;
    }

    class InvalidWitness {
      public:
        enum class Target : uint8_t { None, InvalidateConstant, InvalidateWitness };
        static std::vector<Target> get_all()
        {
            return { Target::None, Target::InvalidateConstant, Target::InvalidateWitness };
        }
        static std::vector<std::string> get_labels() { return { "None", "InvalidateConstant", "InvalidateWitness" }; }
    };

    bb::fr static evaluate_expression_result(
        const std::vector<std::tuple<bb::fr, std::pair<uint32_t, bb::fr>, std::pair<uint32_t, bb::fr>>>& mul_terms,
        const std::vector<std::pair<bb::fr, std::pair<uint32_t, bb::fr>>>& linear_terms,
        const std::vector<bb::fr>& witness_values)
    {
        bb::fr result = 0;

        for (const auto& mul_term : mul_terms) {
            bb::fr scalar = std::get<0>(mul_term);
            bb::fr lhs_value = witness_values[std::get<1>(mul_term).first];
            bb::fr rhs_value = witness_values[std::get<2>(mul_term).first];
            result += scalar * lhs_value * rhs_value;
        }

        for (const auto& linear_term : linear_terms) {
            bb::fr scalar = linear_term.first;
            bb::fr value = witness_values[linear_term.second.first];
            result += scalar * value;
        }

        return result;
    }

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

    static void generate_constraints(AcirConstraint& arithmetic_constraint, WitnessVector& witness_values)
    {
        // (scalar, (lhs_index, lhs_value), (rhs_index, rhs_value))
        std::vector<std::tuple<bb::fr, std::pair<uint32_t, bb::fr>, std::pair<uint32_t, bb::fr>>> mul_terms;
        // (scalar, (index, value)
        std::vector<std::pair<bb::fr, std::pair<uint32_t, bb::fr>>> linear_terms;

        mul_terms.reserve(num_multiplication_terms);
        for (size_t idx = 0; idx < num_multiplication_terms; ++idx) {
            bb::fr lhs_value = bb::fr::random_element();
            bb::fr rhs_value = bb::fr::random_element();
            bb::fr scalar = bb::fr::random_element();

            uint32_t lhs_index = add_to_witness_and_track_indices(witness_values, lhs_value);
            uint32_t rhs_index = add_to_witness_and_track_indices(witness_values, rhs_value);
            mul_terms.push_back(
                std::make_tuple(scalar, std::make_pair(lhs_index, lhs_value), std::make_pair(rhs_index, rhs_value)));
        }

        linear_terms.reserve(num_linear_terms);
        for (size_t idx = 0; idx < num_linear_terms; ++idx) {
            bb::fr value = bb::fr::random_element();
            bb::fr scalar = bb::fr::random_element();

            uint32_t index = add_to_witness_and_track_indices(witness_values, value);
            linear_terms.push_back(std::make_pair(scalar, std::make_pair(index, value)));
        }

        // Expressions that would lead to these cases are:
        // 1. w1 * w2 + w1
        // 2. w1 * w2 + w3 * w4 + w1 + w4
        // 3. w1 * w1 + w3 * w4 + w5 * w5 + w1 + w4 + w5
        if constexpr (overlap_mul_and_linear) {
            BB_ASSERT_GTE(num_linear_terms, 1U, "We need at least 1 linear terms when overlapping is turned on.");
            BB_ASSERT_GTE(
                num_multiplication_terms, 1U, "We need at least 1 multiplication terms when overlapping is turned on.");

            // Overlap lhs of multiplication term with linear term
            std::get<1>(mul_terms[0]).first = linear_terms[0].second.first;

            if constexpr (num_multiplication_terms > 1 && num_linear_terms > 1) {
                // Overlap rhs of multiplication term with linear term
                std::get<2>(mul_terms[1]).first = linear_terms[1].second.first;
            }

            if constexpr (num_multiplication_terms > 2 && num_linear_terms > 2) {
                // Overlap both terms in the multiplication term with linear term
                std::get<1>(mul_terms[2]).first = linear_terms[2].second.first;
                std::get<2>(mul_terms[2]).first = linear_terms[2].second.first;
            }
        }

        // Expression that would lead to this case is:
        // w1 + w1
        if constexpr (overlap_linear) {
            BB_ASSERT_GT(num_linear_terms,
                         NUM_OVERLAP_LINEAR + LINEAR_OFFSET,
                         "We need at least " << NUM_OVERLAP_LINEAR + LINEAR_OFFSET + 1
                                             << " linear term when overlapping is turned on.");

            // Overlap two linear terms
            linear_terms[LINEAR_OFFSET].second.first = linear_terms[LINEAR_OFFSET + 1].second.first;
        }

        bb::fr result = -evaluate_expression_result(mul_terms, linear_terms, witness_values);

        // Build the Acir::Expression
        Acir::Expression expression;
        for (const auto& mul_term : mul_terms) {
            expression.mul_terms.push_back(std::make_tuple(std::get<0>(mul_term).to_buffer(),
                                                           Acir::Witness(std::get<1>(mul_term).first),
                                                           Acir::Witness(std::get<2>(mul_term).first)));
        }
        for (const auto& linear_term : linear_terms) {
            expression.linear_combinations.push_back(
                std::make_tuple(linear_term.first.to_buffer(), Acir::Witness(linear_term.second.first)));
        }
        expression.q_c = result.to_buffer();

        // Construct the big quad constraint via the standard arithmetic path (is_mega = false).
        Acir::Opcode::AssertZero acir_assert_zero{ .value = expression };
        AcirFormat dummy_acir_format;
        std::vector<BatchedEqEntry> batched_eq_assert_zeros;
        assert_zero_to_constraints(acir_assert_zero, dummy_acir_format, 0, batched_eq_assert_zeros, /*is_mega=*/false);

        // Check that the construction worked as expected
        size_t EXPECTED_NUM_GATES = expected_num_gates();
        if (EXPECTED_NUM_GATES > 1) {
            BB_ASSERT(dummy_acir_format.quad_constraints.empty());
            BB_ASSERT_EQ(dummy_acir_format.big_quad_constraints.size(), 1U);
            BB_ASSERT_EQ(dummy_acir_format.big_quad_constraints[0].size(), EXPECTED_NUM_GATES);
        } else {
            BB_ASSERT(dummy_acir_format.big_quad_constraints.empty());
            BB_ASSERT_EQ(dummy_acir_format.quad_constraints.size(), 1U);
        }

        if constexpr (IS_BIG_QUAD) {
            arithmetic_constraint = dummy_acir_format.big_quad_constraints[0];
        } else {
            arithmetic_constraint = dummy_acir_format.quad_constraints[0];
        }
    }

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        AcirConstraint constraint,
        WitnessVector witness_values,
        const typename InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::InvalidateConstant: {
            // Invalidate the equation by changing the constant term
            if constexpr (IS_BIG_QUAD) {
                constraint[0].const_scaling += bb::fr::one();
            } else {
                constraint.const_scaling += bb::fr::one();
            }
            break;
        }
        case InvalidWitness::Target::InvalidateWitness: {
            // Invalidate the equation by changing one of the witness values
            if constexpr (IS_BIG_QUAD) {
                witness_values[constraint[0].a] += bb::fr::one();
            } else {
                witness_values[constraint.a] += bb::fr::one();
            }
            break;
        }
        };

        return { constraint, witness_values };
    };
};

template <typename ArithmeticConstraintParams_>
class BigQuadConstraintTest
    : public ::testing::Test,
      public TestClass<ArithmeticConstraintsTestingFunctions<typename ArithmeticConstraintParams_::Builder,
                                                             typename ArithmeticConstraintParams_::AcirConstraint,
                                                             ArithmeticConstraintParams_::NUM_MULTIPLICATION_TERMS,
                                                             ArithmeticConstraintParams_::NUM_LINEAR_TERMS,
                                                             ArithmeticConstraintParams_::OVERLAP_MUL_AND_LINEAR,
                                                             ArithmeticConstraintParams_::OVERLAP_LINEAR>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); };
};

using BigQuadConstraintConfigs = testing::Types<
    ArithmeticConstraintParams<UltraCircuitBuilder, BigQuadConstraint, 1, 3, false, false>, // Minimal cases
                                                                                            // requiring 2 gates
    ArithmeticConstraintParams<UltraCircuitBuilder, BigQuadConstraint, 0, 5, false, false>,
    ArithmeticConstraintParams<UltraCircuitBuilder, BigQuadConstraint, 2, 0, false, false>,
    ArithmeticConstraintParams<UltraCircuitBuilder, BigQuadConstraint, 3, 3, true, false>, // Overlapping
    ArithmeticConstraintParams<UltraCircuitBuilder, BigQuadConstraint, 1, 4, false, true>, // Overlapping & minimal
                                                                                           // requiring 2 gates
    ArithmeticConstraintParams<UltraCircuitBuilder, BigQuadConstraint, 5, 5, true, true>,
    ArithmeticConstraintParams<UltraCircuitBuilder, BigQuadConstraint, 0, 6, false, true>, // Overlapping & minimal
                                                                                           // requiring 2 gates
    ArithmeticConstraintParams<MegaCircuitBuilder, BigQuadConstraint, 1, 3, false, false>, // Minimal cases
                                                                                           // requiring 2 gates
    ArithmeticConstraintParams<MegaCircuitBuilder, BigQuadConstraint, 0, 5, false, false>,
    ArithmeticConstraintParams<MegaCircuitBuilder, BigQuadConstraint, 2, 0, false, false>,
    ArithmeticConstraintParams<MegaCircuitBuilder, BigQuadConstraint, 3, 3, true, false>, // Overlapping
    ArithmeticConstraintParams<MegaCircuitBuilder, BigQuadConstraint, 1, 4, false, true>, // Overlapping & minimal
                                                                                          // requiring 2 gates
    ArithmeticConstraintParams<MegaCircuitBuilder, BigQuadConstraint, 5, 5, true, true>,
    ArithmeticConstraintParams<MegaCircuitBuilder, BigQuadConstraint, 0, 6, false, true>>; // Overlapping & minimal
                                                                                           // requiring 2 gates

TYPED_TEST_SUITE(BigQuadConstraintTest, BigQuadConstraintConfigs);

TYPED_TEST(BigQuadConstraintTest, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(BigQuadConstraintTest, Tampering)
{
    TestFixture::test_tampering();
}

template <typename ArithmeticConstraintParams_>
class QuadConstraintTest
    : public ::testing::Test,
      public TestClass<ArithmeticConstraintsTestingFunctions<typename ArithmeticConstraintParams_::Builder,
                                                             typename ArithmeticConstraintParams_::AcirConstraint,
                                                             ArithmeticConstraintParams_::NUM_MULTIPLICATION_TERMS,
                                                             ArithmeticConstraintParams_::NUM_LINEAR_TERMS,
                                                             ArithmeticConstraintParams_::OVERLAP_MUL_AND_LINEAR,
                                                             ArithmeticConstraintParams_::OVERLAP_LINEAR>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); };
};

using QuadConstraintConfigs = testing::Types<
    ArithmeticConstraintParams<UltraCircuitBuilder, QuadConstraint, 1, 0, false, false>,
    ArithmeticConstraintParams<UltraCircuitBuilder, QuadConstraint, 1, 1, false, false>,
    ArithmeticConstraintParams<UltraCircuitBuilder, QuadConstraint, 1, 2, false, false>,
    ArithmeticConstraintParams<UltraCircuitBuilder, QuadConstraint, 1, 3, false, true>, // Maximal case in one gate
    ArithmeticConstraintParams<UltraCircuitBuilder, QuadConstraint, 1, 4, true, true>,  // Maximal case in one gate
    ArithmeticConstraintParams<UltraCircuitBuilder, QuadConstraint, 0, 4, false, false>,
    ArithmeticConstraintParams<UltraCircuitBuilder, QuadConstraint, 0, 5, false, true>, // Maximal case in one gate
    ArithmeticConstraintParams<MegaCircuitBuilder, QuadConstraint, 1, 0, false, false>,
    ArithmeticConstraintParams<MegaCircuitBuilder, QuadConstraint, 1, 1, false, false>,
    ArithmeticConstraintParams<MegaCircuitBuilder, QuadConstraint, 1, 2, false, false>,
    ArithmeticConstraintParams<MegaCircuitBuilder, QuadConstraint, 1, 3, false, true>, // Maximal case in one gate
    ArithmeticConstraintParams<MegaCircuitBuilder, QuadConstraint, 1, 4, true, true>,  // Maximal case in one gate
    ArithmeticConstraintParams<MegaCircuitBuilder, QuadConstraint, 0, 4, false, false>,
    ArithmeticConstraintParams<MegaCircuitBuilder, QuadConstraint, 0, 5, false, true>>; // Maximal case in one gate

TYPED_TEST_SUITE(QuadConstraintTest, QuadConstraintConfigs);

TYPED_TEST(QuadConstraintTest, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(QuadConstraintTest, Tampering)
{
    TestFixture::test_tampering();
}

template <typename Builder> class BigQuadOpcodeGateCountTest : public ::testing::Test {};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
TYPED_TEST_SUITE(BigQuadOpcodeGateCountTest, BuilderTypes);

TYPED_TEST(BigQuadOpcodeGateCountTest, OpcodeGateCount)
{
    using BigQuadConstraintTest =
        ArithmeticConstraintsTestingFunctions<TypeParam, BigQuadConstraint, 1, 3, false, false>;

    BigQuadConstraint big_quad_constraint;
    WitnessVector witness_values;
    BigQuadConstraintTest::generate_constraints(big_quad_constraint, witness_values);

    AcirFormat constraint_system = constraint_to_acir_format(big_quad_constraint);
    AcirProgram program{ constraint_system, witness_values };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BIG_QUAD<TypeParam> }));
}

TEST(AssertZeroConstraintTest, UnsatisfiableCircuitWithNonZeroConstantOnly)
{
    // An AssertZero opcode with no variables and a non-zero constant is fundamentally unsatisfiable:
    // it asserts `nonzero_constant == 0` which can never hold.
    Acir::Expression expr{ .q_c = bb::fr::one().to_buffer() };
    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat af;
    std::vector<BatchedEqEntry> batched_eq_assert_zeros;
    EXPECT_THROW_WITH_MESSAGE(
        assert_zero_to_constraints(assert_zero, af, 0, batched_eq_assert_zeros, /*is_mega=*/false),
        "circuit is unsatisfiable. An AssertZero opcode contains no variables but has a non-zero constant");
}

TEST(AssertZeroConstraintTest, SatisfiableCircuitWithZeroConstantOnly)
{
    // An AssertZero opcode with no variables and a zero constant is trivially satisfiable (0 == 0),
    // but should still be rejected since it produces a zero gate.
    Acir::Expression expr{ .q_c = bb::fr::zero().to_buffer() };
    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat af;
    std::vector<BatchedEqEntry> batched_eq_assert_zeros;
    EXPECT_THROW_WITH_MESSAGE(
        assert_zero_to_constraints(assert_zero, af, 0, batched_eq_assert_zeros, /*is_mega=*/false),
        "split_into_mul_quad_gates: resulted in zero gates");
}

template <size_t num_bilinear> class BilinearConstraintTestingFunctions {
  public:
    using Builder = MegaCircuitBuilder;
    using AcirConstraint = std::vector<BilinearConstraint>;

    class InvalidWitness {
      public:
        enum class Target : uint8_t { None, InvalidateConstant, InvalidateWitness };
        static std::vector<Target> get_all()
        {
            return { Target::None, Target::InvalidateConstant, Target::InvalidateWitness };
        }
        static std::vector<std::string> get_labels() { return { "None", "InvalidateConstant", "InvalidateWitness" }; }
    };

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

    static void generate_constraints(AcirConstraint& constraint, WitnessVector& witness_values)
    {
        std::vector<Acir::Opcode> opcodes;

        // M bilinear gates whose two products share wire a:
        //   q_m·a·b + q_5·a·c + q_l·a + q_r·b + q_o·c + q_4·e + q_c = 0
        // Wires a, b, c carry the products; d is the linear-only fourth wire. The i-th gate carries min(i, 4) linear
        // terms (placed on a, b, c, d in turn) and we solve for c so the identity holds.
        for (size_t i = 0; i < num_bilinear; ++i) {
            const size_t num_linear = std::min(i, size_t{ 4 });
            bb::fr q_m = bb::fr::random_element();
            bb::fr q_5 = bb::fr::random_element();
            bb::fr q_l = num_linear > 0 ? bb::fr::random_element() : bb::fr::zero();
            bb::fr q_r = num_linear > 1 ? bb::fr::random_element() : bb::fr::zero();
            bb::fr q_o = num_linear > 2 ? bb::fr::random_element() : bb::fr::zero();
            bb::fr q_4 = num_linear > 3 ? bb::fr::random_element() : bb::fr::zero();
            bb::fr q_c = bb::fr::random_element();
            bb::fr a = bb::fr::random_element();
            bb::fr b = bb::fr::random_element();
            bb::fr d = bb::fr::random_element(); // linear-only fourth wire (used only when num_linear > 3)
            // c·(q_5·a + q_o) = −(q_m·a·b + q_l·a + q_r·b + q_4·e + q_c)
            bb::fr c = -(q_m * a * b + q_l * a + q_r * b + q_4 * d + q_c) * (q_5 * a + q_o).invert();
            uint32_t ai = add_to_witness_and_track_indices(witness_values, a);
            uint32_t bi = add_to_witness_and_track_indices(witness_values, b);
            uint32_t ci = add_to_witness_and_track_indices(witness_values, c);
            Acir::Expression expr;
            expr.mul_terms.push_back(std::make_tuple(q_m.to_buffer(), Acir::Witness(ai), Acir::Witness(bi)));
            expr.mul_terms.push_back(std::make_tuple(q_5.to_buffer(), Acir::Witness(ai), Acir::Witness(ci)));
            if (num_linear > 0) {
                expr.linear_combinations.push_back(std::make_tuple(q_l.to_buffer(), Acir::Witness(ai)));
            }
            if (num_linear > 1) {
                expr.linear_combinations.push_back(std::make_tuple(q_r.to_buffer(), Acir::Witness(bi)));
            }
            if (num_linear > 2) {
                expr.linear_combinations.push_back(std::make_tuple(q_o.to_buffer(), Acir::Witness(ci)));
            }
            if (num_linear > 3) {
                uint32_t di = add_to_witness_and_track_indices(witness_values, d);
                expr.linear_combinations.push_back(std::make_tuple(q_4.to_buffer(), Acir::Witness(di)));
            }
            expr.q_c = q_c.to_buffer();
            opcodes.push_back(Acir::Opcode{ .value = Acir::Opcode::AssertZero{ .value = expr } });
        }

        Acir::Circuit circuit = build_acir_circuit(opcodes);
        AcirFormat af = circuit_serde_to_acir_format(circuit, /*is_mega=*/true);

        // M shared-wire two-product AssertZeros classify to M BILINEAR rows; nothing else is produced.
        BB_ASSERT_EQ(af.bilinear_constraints.size(), num_bilinear, "generate_constraints: expected M bilinear rows.");
        BB_ASSERT(af.batched_eq_check_constraints.empty());
        BB_ASSERT(af.quad_constraints.empty());
        BB_ASSERT(af.big_quad_constraints.empty());

        constraint = af.bilinear_constraints;
    }

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(AcirConstraint constraint,
                                                                       WitnessVector witness_values,
                                                                       const typename InvalidWitness::Target& target)
    {
        switch (target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::InvalidateConstant:
            constraint[0].q_c += bb::fr::one();
            break;
        case InvalidWitness::Target::InvalidateWitness:
            witness_values[constraint[0].a] += bb::fr::one();
            break;
        }
        return { constraint, witness_values };
    }
};

template <typename Params>
class BilinearConstraintTest : public ::testing::Test,
                               public TestClass<BilinearConstraintTestingFunctions<Params::value>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BilinearConfigs = testing::Types<std::integral_constant<size_t, 1>,
                                       std::integral_constant<size_t, 2>,
                                       std::integral_constant<size_t, 3>,
                                       std::integral_constant<size_t, 5>>;

TYPED_TEST_SUITE(BilinearConstraintTest, BilinearConfigs);

TYPED_TEST(BilinearConstraintTest, GenerateVKFromConstraints)
{
    TestFixture::template test_vk_independence<MegaFlavor>();
}

TYPED_TEST(BilinearConstraintTest, Tampering)
{
    TestFixture::test_tampering();
}

template <size_t num_batched_eq> class BatchedEqCheckConstraintTestingFunctions {
  public:
    using Builder = MegaCircuitBuilder;
    using AcirConstraint = std::vector<BatchedEqCheckConstraint>;

    class InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,
            InvalidateConstantFirstHalf,
            InvalidateWitnessFirstHalf,
            InvalidateConstantSecondHalf,
            InvalidateWitnessSecondHalf
        };
        static std::vector<Target> get_all()
        {
            if constexpr (num_batched_eq == 1) {
                return { Target::None, Target::InvalidateConstantFirstHalf, Target::InvalidateWitnessFirstHalf };
            } else {
                return { Target::None,
                         Target::InvalidateConstantFirstHalf,
                         Target::InvalidateWitnessFirstHalf,
                         Target::InvalidateConstantSecondHalf,
                         Target::InvalidateWitnessSecondHalf };
            }
        }
        static std::vector<std::string> get_labels()
        {
            if constexpr (num_batched_eq == 1) {
                return { "None", "InvalidateConstantFirstHalf", "InvalidateWitnessFirstHalf" };
            } else {
                return { "None",
                         "InvalidateConstantFirstHalf",
                         "InvalidateWitnessFirstHalf",
                         "InvalidateConstantSecondHalf",
                         "InvalidateWitnessSecondHalf" };
            }
        }
    };

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

    static void generate_constraints(AcirConstraint& constraint, WitnessVector& witness_values)
    {
        std::vector<Acir::Opcode> opcodes;

        // N linear "equality" AssertZeros. The i-th equality uses min(i, 2) witnesses, floored at 1 (a
        // batched-eq needs at least one witness)
        for (size_t i = 0; i < num_batched_eq; ++i) {
            const size_t num_witnesses = std::max(size_t{ 1 }, std::min(i, size_t{ 2 }));
            bb::fr c1 = bb::fr::random_element();
            bb::fr w1 = bb::fr::random_element();
            Acir::Expression expr;
            if (num_witnesses == 1) {
                uint32_t w1i = add_to_witness_and_track_indices(witness_values, w1);
                expr.linear_combinations.push_back(std::make_tuple(c1.to_buffer(), Acir::Witness(w1i)));
                expr.q_c = (-(c1 * w1)).to_buffer();
            } else {
                bb::fr c2 = bb::fr::random_element();
                bb::fr q_c = bb::fr::random_element();
                // c2·w2 = −(c1·w1 + q_c)
                bb::fr w2 = -(c1 * w1 + q_c) * c2.invert();
                uint32_t w1i = add_to_witness_and_track_indices(witness_values, w1);
                uint32_t w2i = add_to_witness_and_track_indices(witness_values, w2);
                expr.linear_combinations.push_back(std::make_tuple(c1.to_buffer(), Acir::Witness(w1i)));
                expr.linear_combinations.push_back(std::make_tuple(c2.to_buffer(), Acir::Witness(w2i)));
                expr.q_c = q_c.to_buffer();
            }
            opcodes.push_back(Acir::Opcode{ .value = Acir::Opcode::AssertZero{ .value = expr } });
        }

        Acir::Circuit circuit = build_acir_circuit(opcodes);
        AcirFormat af = circuit_serde_to_acir_format(circuit, /*is_mega=*/true);

        // N linear AssertZeros pair greedily into ceil(N/2) BATCHED_EQ rows; nothing else is produced.
        BB_ASSERT_EQ(af.batched_eq_check_constraints.size(),
                     (num_batched_eq + 1) / 2,
                     "generate_constraints: expected ceil(N/2) batched-eq rows.");
        BB_ASSERT(af.bilinear_constraints.empty());
        BB_ASSERT(af.quad_constraints.empty());
        BB_ASSERT(af.big_quad_constraints.empty());

        constraint = af.batched_eq_check_constraints;
    }

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(AcirConstraint constraint,
                                                                       WitnessVector witness_values,
                                                                       const typename InvalidWitness::Target& target)
    {
        switch (target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::InvalidateConstantFirstHalf:
            constraint[0].q_c += bb::fr::one();
            break;
        case InvalidWitness::Target::InvalidateWitnessFirstHalf:
            witness_values[constraint[0].a] += bb::fr::one();
            break;
        case InvalidWitness::Target::InvalidateConstantSecondHalf:
            constraint[0].q_m += bb::fr::one();
            break;
        case InvalidWitness::Target::InvalidateWitnessSecondHalf:
            witness_values[constraint[0].c] += bb::fr::one();
            break;
        }
        return { constraint, witness_values };
    }
};

template <typename Params>
class BatchedEqCheckConstraintTest : public ::testing::Test,
                                     public TestClass<BatchedEqCheckConstraintTestingFunctions<Params::value>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BatchedEqConfigs = testing::Types<std::integral_constant<size_t, 1>,
                                        std::integral_constant<size_t, 2>,
                                        std::integral_constant<size_t, 3>,
                                        std::integral_constant<size_t, 4>,
                                        std::integral_constant<size_t, 5>,
                                        std::integral_constant<size_t, 7>>;

TYPED_TEST_SUITE(BatchedEqCheckConstraintTest, BatchedEqConfigs);

TYPED_TEST(BatchedEqCheckConstraintTest, GenerateVKFromConstraints)
{
    TestFixture::template test_vk_independence<MegaFlavor>();
}

TYPED_TEST(BatchedEqCheckConstraintTest, Tampering)
{
    TestFixture::test_tampering();
}
