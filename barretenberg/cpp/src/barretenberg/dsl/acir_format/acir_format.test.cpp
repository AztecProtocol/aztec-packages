#include <gtest/gtest.h>
#include <memory>
#include <vector>

#include "acir_format.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"

#include "barretenberg/serialize/test_helper.hpp"

using namespace bb;
using namespace bb::crypto;
using namespace acir_format;

template <typename Builder> class AcirFormatTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
TYPED_TEST_SUITE(AcirFormatTests, BuilderTypes);

TYPED_TEST(AcirFormatTests, ExpressionWithOnlyConstantTermFails)
{
    // Test that circuit construction fails if we have an expression with only a constant term. This is expected
    // behavior: an expression with only a constant term represent either:
    // 1) an unsatisfied constraint if the constant term is non-zero
    // 2) a zero constraint if the constant term is zero
    // In both cases, we should not construct a circuit as either the circuit is not satisfiable, or there is zero gate.
    Acir::Expression expr{ .q_c = bb::fr::one().to_buffer() };
    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr } } },
        .public_parameters = {},
        .return_values = {},
    };

    EXPECT_THROW_WITH_MESSAGE(circuit_serde_to_acir_format(circuit, /*is_mega=*/false), "circuit is unsatisfiable");
}

TYPED_TEST(AcirFormatTests, ExpressionWithCancellingCoefficientsFails)
{
    // Test that circuit construction fails if we have an expression where all linear terms cancel out. This is expected
    // behavior as such an expression would result in a zero gate.
    Acir::Expression expr{ .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ 0 } },
                                                    { bb::fr(-1).to_buffer(), Acir::Witness{ 0 } } },
                           .q_c = bb::fr::zero().to_buffer() };
    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr } } },
        .public_parameters = {},
        .return_values = {},
    };

    EXPECT_THROW_WITH_MESSAGE(circuit_serde_to_acir_format(circuit, /*is_mega=*/false),
                              "acir_format::assert_zero_to_constraints: produced a SingleArithmetic zero gate.");
}

TYPED_TEST(AcirFormatTests, PublicInputs)
{
    // Test that public inputs are handled correctly.
    WitnessVector witnesses = { 2, 4, 6, 8, 10, 12 };

    // 8 - 6 - 2 = 0
    Acir::Expression expr{ .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ 3 } },
                                                    { bb::fr(-1).to_buffer(), Acir::Witness{ 2 } } },
                           .q_c = bb::fr(-2).to_buffer() };

    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr } } },
        .public_parameters =
            Acir::PublicInputs{ .value = { Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 } } },
        .return_values = Acir::PublicInputs{ .value = { Acir::Witness{ .value = 4 }, Acir::Witness{ .value = 5 } } },
    };

    AcirFormat acir_format = circuit_serde_to_acir_format(circuit, /*is_mega=*/false);
    BB_ASSERT_EQ(acir_format.public_inputs, std::vector<uint32_t>({ 0, 1, 4, 5 }));

    AcirProgram program{ acir_format, witnesses };
    auto builder = create_circuit<TypeParam>(program, {});

    for (size_t idx = 0; idx < acir_format.public_inputs.size(); ++idx) {
        uint32_t pub_input_idx = acir_format.public_inputs[idx];
        EXPECT_EQ(pub_input_idx, builder.public_inputs()[idx]);
        EXPECT_EQ(witnesses[pub_input_idx], builder.get_variable(pub_input_idx));
    }
}

// A circuit with one shared-wire two-product (bilinear) AssertZero and two single-witness equality
// AssertZeros is lowered differently per flavor. Ultra (is_mega = false) has no bilinear_batched_eq gate: the
// two-product opcode becomes a big_quad (two gates) and each equality a single quad. Mega
// (is_mega = true) classifies the two-product opcode into one BilinearConstraint and pairs the two
// equalities into one BatchedEqCheckConstraint. This checks both the counts and the resulting constraint structure.
TEST(AcirFormatBilinearBatchedEqTest, UltraMegaArithmetizationDifference)
{
    constexpr uint32_t w1 = 1;
    constexpr uint32_t w2 = 2;
    constexpr uint32_t w3 = 3;
    constexpr uint32_t w4 = 4;
    constexpr uint32_t w5 = 5;

    // Bilinear opcode: q_m·w1·w2 + q_5·w1·w3 + q_l·w1 + q_c = 0 (the two products share wire w1).
    const bb::fr q_m = bb::fr(2);
    const bb::fr q_5 = bb::fr(3);
    const bb::fr q_l = bb::fr(5);
    const bb::fr q_c = bb::fr(7);
    Acir::Expression bilinear_expr;
    bilinear_expr.mul_terms.push_back(std::make_tuple(q_m.to_buffer(), Acir::Witness{ w1 }, Acir::Witness{ w2 }));
    bilinear_expr.mul_terms.push_back(std::make_tuple(q_5.to_buffer(), Acir::Witness{ w1 }, Acir::Witness{ w3 }));
    bilinear_expr.linear_combinations.push_back(std::make_tuple(q_l.to_buffer(), Acir::Witness{ w1 }));
    bilinear_expr.q_c = q_c.to_buffer();

    // Two single-witness equalities: e0·w4 + k0 = 0 and e1·w5 + k1 = 0.
    const bb::fr e0 = bb::fr(11);
    const bb::fr k0 = bb::fr(13);
    const bb::fr e1 = bb::fr(17);
    const bb::fr k1 = bb::fr(19);
    Acir::Expression eq1_expr;
    eq1_expr.linear_combinations.push_back(std::make_tuple(e0.to_buffer(), Acir::Witness{ w4 }));
    eq1_expr.q_c = k0.to_buffer();
    Acir::Expression eq2_expr;
    eq2_expr.linear_combinations.push_back(std::make_tuple(e1.to_buffer(), Acir::Witness{ w5 }));
    eq2_expr.q_c = k1.to_buffer();

    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = bilinear_expr } },
                     Acir::Opcode{ Acir::Opcode::AssertZero{ .value = eq1_expr } },
                     Acir::Opcode{ Acir::Opcode::AssertZero{ .value = eq2_expr } } },
        .public_parameters = {},
        .return_values = {},
    };

    // --- Ultra: standard arithmetic gates only ---
    {
        AcirFormat af = circuit_serde_to_acir_format(circuit, /*is_mega=*/false);

        EXPECT_TRUE(af.bilinear_constraints.empty());
        EXPECT_TRUE(af.batched_eq_check_constraints.empty());
        ASSERT_EQ(af.big_quad_constraints.size(), 1U);
        ASSERT_EQ(af.quad_constraints.size(), 2U);

        // The two-product opcode splits into a big_quad of two gates: one per product, with the linear
        // term and the constant landing on the first gate. Both products carry w1 on wire a.
        const BigQuadConstraint& big = af.big_quad_constraints[0];
        ASSERT_EQ(big.size(), 2U);
        EXPECT_EQ(big[0].a, w1);
        EXPECT_EQ(big[0].b, w2);
        EXPECT_EQ(big[0].mul_scaling, q_m);
        EXPECT_EQ(big[0].a_scaling, q_l);
        EXPECT_EQ(big[0].const_scaling, q_c);
        EXPECT_EQ(big[1].a, w1);
        EXPECT_EQ(big[1].b, w3);
        EXPECT_EQ(big[1].mul_scaling, q_5);

        // Each equality is a single width-4 gate: coefficient on a_scaling, constant on const_scaling.
        EXPECT_EQ(af.quad_constraints[0].a, w4);
        EXPECT_EQ(af.quad_constraints[0].a_scaling, e0);
        EXPECT_EQ(af.quad_constraints[0].const_scaling, k0);
        EXPECT_EQ(af.quad_constraints[1].a, w5);
        EXPECT_EQ(af.quad_constraints[1].a_scaling, e1);
        EXPECT_EQ(af.quad_constraints[1].const_scaling, k1);
    }

    // --- Mega: one bilinear row + one batched row ---
    {
        AcirFormat af = circuit_serde_to_acir_format(circuit, /*is_mega=*/true);

        EXPECT_TRUE(af.quad_constraints.empty());
        EXPECT_TRUE(af.big_quad_constraints.empty());
        ASSERT_EQ(af.bilinear_constraints.size(), 1U);
        ASSERT_EQ(af.batched_eq_check_constraints.size(), 1U);

        // Bilinear row: products on (a, b) = (w1, w2) via q_m and (a, c) = (w1, w3) via q_5, sharing
        // wire a = w1; the linear term on w1 lands on q_l; q_c carries the constant; the other linear
        // selectors are zero. With no linear-only fourth wire, d is the IS_CONSTANT sentinel.
        const BilinearConstraint& bilinear = af.bilinear_constraints[0];
        EXPECT_EQ(bilinear.a, w1);
        EXPECT_EQ(bilinear.b, w2);
        EXPECT_EQ(bilinear.c, w3);
        EXPECT_EQ(bilinear.d, bb::stdlib::IS_CONSTANT);
        EXPECT_EQ(bilinear.q_m, q_m);
        EXPECT_EQ(bilinear.q_5, q_5);
        EXPECT_EQ(bilinear.q_l, q_l);
        EXPECT_EQ(bilinear.q_r, bb::fr::zero());
        EXPECT_EQ(bilinear.q_o, bb::fr::zero());
        EXPECT_EQ(bilinear.q_4, bb::fr::zero());
        EXPECT_EQ(bilinear.q_c, q_c);

        // BatchedEq row: the two equalities are paired — half 1 = q_l·w4 + q_c (the e0/k0 equality), half 2 =
        // q_o·w5 + q_m (the e1/k1 equality). The unused second witness of each half is IS_CONSTANT.
        const BatchedEqCheckConstraint& batched_eq = af.batched_eq_check_constraints[0];
        EXPECT_EQ(batched_eq.a, w4);
        EXPECT_EQ(batched_eq.b, bb::stdlib::IS_CONSTANT);
        EXPECT_EQ(batched_eq.c, w5);
        EXPECT_EQ(batched_eq.d, bb::stdlib::IS_CONSTANT);
        EXPECT_EQ(batched_eq.q_l, e0);
        EXPECT_EQ(batched_eq.q_r, bb::fr::zero());
        EXPECT_EQ(batched_eq.q_o, e1);
        EXPECT_EQ(batched_eq.q_4, bb::fr::zero());
        EXPECT_EQ(batched_eq.q_c, k0);
        EXPECT_EQ(batched_eq.q_m, k1);
    }
}

// Ultra circuit should throw if it encounters Bilinear or BatchedEqCheck gates
TEST(AcirFormatBilinearBatchedEqTest, UltraThrowsOnBilinearAndBatchedEqCheckGates)
{
    constexpr uint32_t w1 = 1;
    constexpr uint32_t w2 = 2;
    constexpr uint32_t w3 = 3;
    constexpr uint32_t w4 = 4;
    constexpr uint32_t w5 = 5;

    {
        // Bilinear opcode: q_m·w1·w2 + q_5·w1·w3 + q_l·w1 + q_c = 0 (the two products share wire w1).
        const bb::fr q_m = bb::fr(2);
        const bb::fr q_5 = bb::fr(3);
        const bb::fr q_l = bb::fr(5);
        const bb::fr q_c = bb::fr(7);
        Acir::Expression bilinear_expr;
        bilinear_expr.mul_terms.push_back(std::make_tuple(q_m.to_buffer(), Acir::Witness{ w1 }, Acir::Witness{ w2 }));
        bilinear_expr.mul_terms.push_back(std::make_tuple(q_5.to_buffer(), Acir::Witness{ w1 }, Acir::Witness{ w3 }));
        bilinear_expr.linear_combinations.push_back(std::make_tuple(q_l.to_buffer(), Acir::Witness{ w1 }));
        bilinear_expr.q_c = q_c.to_buffer();

        Acir::Circuit circuit{
            .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = bilinear_expr } } },
            .public_parameters = {},
            .return_values = {},
        };

        AcirFormat af = circuit_serde_to_acir_format(circuit, /*is_mega=*/true);

        EXPECT_TRUE(af.quad_constraints.empty());
        EXPECT_TRUE(af.big_quad_constraints.empty());
        ASSERT_EQ(af.bilinear_constraints.size(), 1U);
        ASSERT_EQ(af.batched_eq_check_constraints.size(), 0U);

        UltraCircuitBuilder builder;
        EXPECT_THROW_WITH_MESSAGE(build_constraints(builder, af, {}),
                                  "Bilinear constraints should only be present when using MegaCircuitBuilder.");
    }

    {
        // Two single-witness equalities: e0·w4 + k0 = 0 and e1·w5 + k1 = 0.
        const bb::fr e0 = bb::fr(11);
        const bb::fr k0 = bb::fr(13);
        const bb::fr e1 = bb::fr(17);
        const bb::fr k1 = bb::fr(19);
        Acir::Expression eq1_expr;
        eq1_expr.linear_combinations.push_back(std::make_tuple(e0.to_buffer(), Acir::Witness{ w4 }));
        eq1_expr.q_c = k0.to_buffer();
        Acir::Expression eq2_expr;
        eq2_expr.linear_combinations.push_back(std::make_tuple(e1.to_buffer(), Acir::Witness{ w5 }));
        eq2_expr.q_c = k1.to_buffer();

        Acir::Circuit circuit{
            .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = eq1_expr } },
                         Acir::Opcode{ Acir::Opcode::AssertZero{ .value = eq2_expr } } },
            .public_parameters = {},
            .return_values = {},
        };

        AcirFormat af = circuit_serde_to_acir_format(circuit, /*is_mega=*/true);

        EXPECT_TRUE(af.quad_constraints.empty());
        EXPECT_TRUE(af.big_quad_constraints.empty());
        ASSERT_EQ(af.bilinear_constraints.size(), 0U);
        ASSERT_EQ(af.batched_eq_check_constraints.size(), 1U);

        UltraCircuitBuilder builder;
        EXPECT_THROW_WITH_MESSAGE(build_constraints(builder, af, {}),
                                  "BatchedEq constraints should only be present when using MegaCircuitBuilder.");
    }
}
