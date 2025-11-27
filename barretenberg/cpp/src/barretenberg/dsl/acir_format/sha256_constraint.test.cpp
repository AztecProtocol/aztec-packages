#include "sha256_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace acir_format::tests {

class Sha256Tests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(Sha256Tests, TestSha256Compression)
{

    std::array<WitnessOrConstant<bb::fr>, 16> inputs;
    for (size_t i = 0; i < 16; ++i) {
        inputs[i] =
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 1 + UltraCircuitBuilder::ACIR_OFFSET));
    }
    std::array<WitnessOrConstant<bb::fr>, 8> hash_values;
    for (size_t i = 0; i < 8; ++i) {
        hash_values[i] =
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 17 + UltraCircuitBuilder::ACIR_OFFSET));
    }
    Sha256Compression sha256_compression{
        .inputs = inputs,
        .hash_values = hash_values,
        .result = { 25 + UltraCircuitBuilder::ACIR_OFFSET,
                    26 + UltraCircuitBuilder::ACIR_OFFSET,
                    27 + UltraCircuitBuilder::ACIR_OFFSET,
                    28 + UltraCircuitBuilder::ACIR_OFFSET,
                    29 + UltraCircuitBuilder::ACIR_OFFSET,
                    30 + UltraCircuitBuilder::ACIR_OFFSET,
                    31 + UltraCircuitBuilder::ACIR_OFFSET,
                    32 + UltraCircuitBuilder::ACIR_OFFSET },
    };

    AcirFormat constraint_system{
        .max_witness_index = 33 + UltraCircuitBuilder::ACIR_OFFSET - 1,
        .acir_gates_offset = UltraCircuitBuilder::ACIR_OFFSET,
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
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));
}
} // namespace acir_format::tests
