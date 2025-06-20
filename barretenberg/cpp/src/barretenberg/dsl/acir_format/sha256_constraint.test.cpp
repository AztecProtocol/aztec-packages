#include "sha256_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace acir_format::tests {
using curve_ct = bb::stdlib::secp256k1<Builder>;

class Sha256Tests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(Sha256Tests, TestSha256Compression)
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
        .logic_constraints = {},
        .range_constraints = {},
        .aes128_constraints = {},
        .sha256_compression = { sha256_compression },

        .ecdsa_k1_constraints = {},
        .ecdsa_r1_constraints = {},
        .blake2s_constraints = {},
        .blake3_constraints = {},
        .keccak_permutations = {},
        .poseidon2_constraints = {},
        .multi_scalar_mul_constraints = {},
        .ec_add_constraints = {},
        .recursion_constraints = {},
        .honk_recursion_constraints = {},
        .avm_recursion_constraints = {},
        .ivc_recursion_constraints = {},
        .bigint_from_le_bytes_constraints = {},
        .bigint_to_le_bytes_constraints = {},
        .bigint_operations = {},
        .assert_equalities = {},
        .poly_triple_constraints = {},
        .quad_constraints = {},
        .big_quad_constraints = {},
        .block_constraints = {},
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

    auto builder = create_circuit(constraint_system, /*recursive*/ false, /*size_hint=*/0, witness);
    EXPECT_TRUE(CircuitChecker::check(builder));
}
} // namespace acir_format::tests
