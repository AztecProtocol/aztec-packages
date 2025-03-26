#include "poseidon_permutation.hpp"
#include "barretenberg/crypto/poseidon/poseidon_params.hpp"
#include "barretenberg/ecc/curves/stark252/stark252.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

/*
TEST(PoseidonPermutation, TestVectors)
{
    auto input = crypto::PoseidonStark252BaseFieldParams::TEST_VECTOR_INPUT;
    auto expected = crypto::PoseidonStark252BaseFieldParams::TEST_VECTOR_OUTPUT;
    auto result = crypto::PoseidonPermutation<crypto::PoseidonStark252BaseFieldParams>::permutation(input);

    EXPECT_EQ(result, expected);
}
*/

TEST(PoseidonPermutation, BasicTests)
{
    fq a = fq::random_element(&engine);
    fq b = fq::random_element(&engine);
    fq c = fq::random_element(&engine);

    std::array<fq, 3> input1{ a, b, c };
    std::array<fq, 3> input2{ c, b, a };

    auto r0 = crypto::PoseidonPermutation<crypto::PoseidonStark252BaseFieldParams>::permutation(input1);
    auto r1 = crypto::PoseidonPermutation<crypto::PoseidonStark252BaseFieldParams>::permutation(input1);
    auto r2 = crypto::PoseidonPermutation<crypto::PoseidonStark252BaseFieldParams>::permutation(input2);

    EXPECT_EQ(r0, r1);
    EXPECT_NE(r0, r2);
}

/*
TEST(PoseidonPermutation, ConsistencyCheck)
{
    fr a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fr b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fr c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fr d(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::array<fr, 4> input{ a, b, c, d };
    auto result = crypto::PoseidonPermutation<crypto::PoseidonStark252BaseFieldParams>::permutation(input);

    std::array<fr, 4> expected{
        fr(std::string("0x2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95")),
        fr(std::string("0x0c01fa1b8d0748becafbe452c0cb0231c38224ea824554c9362518eebdd5701f")),
        fr(std::string("0x018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3")),
        fr(std::string("0x0cbea457c91c22c6c31fd89afd2541efc2edf31736b9f721e823b2165c90fd41")),
    };
    EXPECT_EQ(result, expected);
}
*/
