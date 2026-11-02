#include <gtest/gtest.h>
#include <vector>

#include "acir_serde_test_utils.hpp"
#include "acir_to_constraint_buf.hpp"

using namespace acir_format;

namespace {

Acir::Circuit single_assert_zero_circuit()
{
    Acir::Expression expr{ .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ 0 } },
                                                    { bb::fr(-1).to_buffer(), Acir::Witness{ 1 } } },
                           .q_c = bb::fr::zero().to_buffer() };
    return Acir::Circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr } } },
        .public_parameters = {},
        .return_values = {},
    };
}

} // namespace

/**
 * @brief The serialized program is released as soon as it has been unpacked, not when the caller's vector dies
 */
TEST(AcirToConstraintBuf, ParsingConsumesTheSerializedProgram)
{
    auto buf = test::serialize_program_with_circuit(single_assert_zero_circuit());
    auto constraints = circuit_buf_to_acir_format(std::move(buf), /*is_mega=*/false);
    EXPECT_EQ(constraints.num_acir_opcodes, 1U);
    EXPECT_EQ(buf.capacity(), 0U); // NOLINT(bugprone-use-after-move)
}
