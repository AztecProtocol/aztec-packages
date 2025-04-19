
#ifdef STARKNET_GARAGA_FLAVORS
#include "poseidon_permutation.hpp"
#include "barretenberg/ext/starknet/ecc/curves/stark252/stark252.hpp"
#include "poseidon_params.hpp"
#include <gtest/gtest.h>

using namespace bb::starknet;

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

TEST(PoseidonPermutation, TestVectors)
{
    auto input = crypto::PoseidonStark252BaseFieldParams::TEST_VECTOR_INPUT;
    auto expected = crypto::PoseidonStark252BaseFieldParams::TEST_VECTOR_OUTPUT;
    auto result = crypto::PoseidonPermutation<crypto::PoseidonStark252BaseFieldParams>::permutation(input);

    EXPECT_EQ(result, expected);
}

TEST(PoseidonPermutation, BasicTests)
{
    using fq = stark252::fq;

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

TEST(PoseidonPermutation, ConsistencyCheck)
{
    using fq = stark252::fq;

    fq a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fq b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fq c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::array<fq, 3> input{ a, b, c };
    auto result = crypto::PoseidonPermutation<crypto::PoseidonStark252BaseFieldParams>::permutation(input);

    std::array<fq, 3> expected{
        fq(std::string("0x03209a40f2b5e046337b5fae9e1e495dc3d9bcb5602ee9d4bd22aed772eab0f2")),
        fq(std::string("0x04fbaa255051a602e8fcaf49614be34440da55ed42b3d8f33909ad0fbf8bce6a")),
        fq(std::string("0x01655846c1e8dda470d0171d2d93efe9a71debadd42f9164e54ab90d70e04e48")),
    };
    EXPECT_EQ(result, expected);
}
#endif
