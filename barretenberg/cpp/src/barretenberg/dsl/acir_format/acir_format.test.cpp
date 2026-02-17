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

    EXPECT_THROW_WITH_MESSAGE(circuit_serde_to_acir_format(circuit),
                              "split_into_mul_quad_gates: resulted in zero gates.");
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

    EXPECT_THROW_WITH_MESSAGE(circuit_serde_to_acir_format(circuit),
                              "acir_format::assert_zero_to_quad_constraints: produced an arithmetic zero gate.");
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

    AcirFormat acir_format = circuit_serde_to_acir_format(circuit);
    BB_ASSERT_EQ(acir_format.public_inputs, std::vector<uint32_t>({ 0, 1, 4, 5 }));

    AcirProgram program{ acir_format, witnesses };
    auto builder = create_circuit<TypeParam>(program, {});

    for (size_t idx = 0; idx < acir_format.public_inputs.size(); ++idx) {
        uint32_t pub_input_idx = acir_format.public_inputs[idx];
        EXPECT_EQ(pub_input_idx, builder.public_inputs()[idx]);
        EXPECT_EQ(witnesses[pub_input_idx], builder.get_variable(pub_input_idx));
    }
}
