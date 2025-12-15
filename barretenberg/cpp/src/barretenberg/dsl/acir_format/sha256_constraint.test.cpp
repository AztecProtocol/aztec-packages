#include "sha256_constraint.hpp"
#include "acir_format.hpp"
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
    Sha256Compression sha256_compression;

    for (size_t i = 0; i < 16; ++i) {
        sha256_compression.inputs[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_compression.hash_values[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 16));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_compression.result[i] = static_cast<uint32_t>(i + 24);
    }

    std::array<uint32_t, 16> input_block = { 0 };
    std::array<uint32_t, 8> hash_values = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
    std::array<uint32_t, 8> result = bb::crypto::sha256_block(hash_values, input_block);

    WitnessVector witness(32, 0);
    for (size_t idx = 16; idx < 24; idx++) {
        witness[idx] = hash_values[idx - 16];
    }
    for (size_t idx = 0; idx < 8; idx++) {
        witness[24 + idx] = result[idx];
    }

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) - 1,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .sha256_compression = { sha256_compression },
        .original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .sha256_compression = { 0 } },
    };

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_FALSE(builder.failed());
}
} // namespace acir_format::tests
