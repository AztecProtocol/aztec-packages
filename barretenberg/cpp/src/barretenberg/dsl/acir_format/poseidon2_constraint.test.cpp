#include "poseidon2_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <strings.h>
#include <vector>

namespace acir_format::tests {

using namespace bb;

class Poseidon2Tests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
using fr = field<Bn254FrParams>;

/**
 * @brief Create a circuit testing the Poseidon2 permutation function
 *
 */
TEST_F(Poseidon2Tests, TestPoseidon2Permutation)
{
    using PoseidonPermutation = stdlib::Poseidon2Permutation<UltraCircuitBuilder>;
    using NativePoseidonPermutation = PoseidonPermutation::NativePermutation;

    static constexpr size_t state_size = PoseidonPermutation::Params::t;

    Poseidon2Constraint poseidon2_constraint;
    for (size_t idx = 0; idx < state_size; idx++) {
        poseidon2_constraint.state.emplace_back(static_cast<uint32_t>(idx));
        poseidon2_constraint.result.emplace_back(static_cast<uint32_t>(idx + state_size));
    }

    auto native_state = NativePoseidonPermutation::State({ 1, 1, 1, 1 });
    auto native_result = NativePoseidonPermutation::permutation(native_state);
    WitnessVector witness(2 * state_size, 0);
    for (size_t idx = 0; idx < state_size; idx++) {
        witness[idx] = native_state[idx];
        witness[idx + state_size] = native_result[idx];
    }

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) - 1,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .poseidon2_constraints = { poseidon2_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_FALSE(builder.failed());
}

} // namespace acir_format::tests
