#include "poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace poseidon2_tests {
TEST(Poseidon2, BasicTests)
{

    barretenberg::fr a = barretenberg::fr::random_element(&engine);
    barretenberg::fr b = barretenberg::fr::random_element(&engine);
    barretenberg::fr c = barretenberg::fr::random_element(&engine);
    barretenberg::fr d = barretenberg::fr::random_element(&engine);

    std::vector<barretenberg::fr> input1{ a, b, c, d };
    std::vector<barretenberg::fr> input2{ d, c, b, a };

    auto r0 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(input1);
    auto r1 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(input1);
    auto r2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(input2);

    EXPECT_EQ(r0, r1);
    EXPECT_NE(r0, r2);
}

} // namespace poseidon2_tests