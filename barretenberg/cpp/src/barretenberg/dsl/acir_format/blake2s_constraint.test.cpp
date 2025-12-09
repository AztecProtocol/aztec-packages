#include "blake2s_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"

#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace acir_format::tests {

class Blake2sTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(Blake2sTests, TestBlake2sConstraint)
{
    // Input
    std::vector<uint8_t> message(64);

    // Expected native Blake2s hash output
    std::array<uint8_t, 32> hash_output = bb::crypto::blake2s(message);

    // Witness vector
    WitnessVector witness;
    witness.reserve(96);
    for (auto msg : message) {
        witness.emplace_back(bb::fr(static_cast<uint64_t>(msg)));
    }
    for (auto output : hash_output) {
        witness.emplace_back(bb::fr(static_cast<uint64_t>(output)));
    }

    // Blake2s constraint
    Blake2sConstraint constraint;

    constraint.inputs.reserve(message.size());
    for (size_t i = 0; i < message.size(); ++i) {
        Blake2sInput input{
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
        .blake2s_constraints = { constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<bb::UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_FALSE(builder.failed());
}

} // namespace acir_format::tests
