#include "blake3_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"

#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace acir_format::tests {

class Blake3Tests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(Blake3Tests, TestBlake3Constraint)
{
    // Input
    std::vector<uint8_t> message(64);

    // Expected native Blake3 hash output
    std::vector<uint8_t> hash_output = blake3::blake3s(message);

    // Witness vector
    WitnessVector witness;
    witness.reserve(96);
    for (auto msg : message) {
        witness.emplace_back(bb::fr(static_cast<uint64_t>(msg)));
    }
    for (auto output : hash_output) {
        witness.emplace_back(bb::fr(static_cast<uint64_t>(output)));
    }

    // Blake3 constraint
    Blake3Constraint constraint;

    constraint.inputs.reserve(message.size());
    for (size_t i = 0; i < message.size(); ++i) {
        Blake3Input input{
            .blackbox_input = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i)),
            .num_bits = 8,
        };
        constraint.inputs.push_back(input);
    }

    for (size_t i = 0; i < 32; ++i) {
        constraint.result[i] = static_cast<uint32_t>(64 + i);
    }

    // ACIR format
    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) - 1,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .blake3_constraints = { constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<bb::UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_FALSE(builder.failed());
}

} // namespace acir_format::tests
