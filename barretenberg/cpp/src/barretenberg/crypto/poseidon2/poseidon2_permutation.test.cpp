#include "poseidon2_permutation.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace poseidon2_tests {
TEST(Poseidon2Permutation, BasicTests)
{

    barretenberg::fr a = barretenberg::fr::random_element(&engine);
    barretenberg::fr b = barretenberg::fr::random_element(&engine);
    barretenberg::fr c = barretenberg::fr::random_element(&engine);
    barretenberg::fr d = barretenberg::fr::random_element(&engine);

    std::array<barretenberg::fr, 4> input1{ a, b, c, d };
    std::array<barretenberg::fr, 4> input2{ d, c, b, a };

    auto r0 = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(input1);
    auto r1 = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(input1);
    auto r2 = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(input2);

    EXPECT_EQ(r0, r1);
    EXPECT_NE(r0, r2);
}

// N.B. these hardcoded values were extracted from the algorithm being tested. These are NOT independent test vectors!
// TODO(@zac-williamson): find independent test vectors we can compare against! (very hard to find given flexibility of
// Poseidon's parametrisation)
TEST(Poseidon2Permutation, ConsistencyCheck)
{
    barretenberg::fr a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    barretenberg::fr b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    barretenberg::fr c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    barretenberg::fr d(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::array<barretenberg::fr, 4> input{ a, b, c, d };
    auto result = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(input);

    std::array<barretenberg::fr, 4> expected{
        barretenberg::fr(std::string_view("0x0514d38493ec8da89f9e2b599bc20f96206ad0c94bc2751e6df03003009aa2ea")),
        barretenberg::fr(std::string_view("0x0757d335371eacea287976a7b26729a74801720418bfdac37d852ac198b585ed")),
        barretenberg::fr(std::string_view("0x19f5168edd96d2c8800d460908dde37c5dd36d56ae905faa8660182a2803c56c")),
        barretenberg::fr(std::string_view("0x0096047284f80a35f2f9f95101a9287e99e1afb0866f19e86286a09bdb203685")),
    };
    EXPECT_EQ(result, expected);
}

} // namespace poseidon2_tests