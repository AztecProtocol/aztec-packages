#include "poseidon2_derive_params.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "poseidon2_params.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;
using namespace crypto;
namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace poseidon2_tests {
TEST(Poseidon2DeriveParams, ConsistencyCheckRoundConstants)
{
    auto generated_round_constants =
        Poseidon2DeriveParams<barretenberg::fr,
                              Poseidon2Bn254ScalarFieldParams::t,
                              Poseidon2Bn254ScalarFieldParams::d,
                              Poseidon2Bn254ScalarFieldParams::sbox_size,
                              Poseidon2Bn254ScalarFieldParams::rounds_f,
                              Poseidon2Bn254ScalarFieldParams::rounds_p>::derive_round_constants();
    auto expected_round_constants = Poseidon2Bn254ScalarFieldParams::round_constants;
    EXPECT_EQ(generated_round_constants, expected_round_constants);
}

TEST(Poseidon2DeriveParams, ConsistencyCheckMatrixDiagonal)
{
    auto generated_internal_matrix_diagonal =
        Poseidon2DeriveParams<barretenberg::fr,
                              Poseidon2Bn254ScalarFieldParams::t,
                              Poseidon2Bn254ScalarFieldParams::d,
                              Poseidon2Bn254ScalarFieldParams::sbox_size,
                              Poseidon2Bn254ScalarFieldParams::rounds_f,
                              Poseidon2Bn254ScalarFieldParams::rounds_p>::generate_internal_matrix_diagonal();
    auto expected_internal_matrix_diagonal = Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal;
    EXPECT_EQ(generated_internal_matrix_diagonal, expected_internal_matrix_diagonal);
}

} // namespace poseidon2_tests