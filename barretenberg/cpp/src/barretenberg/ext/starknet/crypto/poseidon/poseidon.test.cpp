#include "poseidon.hpp"
#include "barretenberg/ext/starknet/ecc/curves/stark252/stark252.hpp"
#include "poseidon_params.hpp"
#include <gtest/gtest.h>

#ifdef STARKNET_GARAGA_FLAVORS
namespace {
auto& engine = bb::numeric::get_debug_randomness();
}
using namespace bb::starknet;

TEST(Poseidon, HashBasicTests)
{
    using fq = stark252::fq;

    fq a = fq::random_element(&engine);
    fq b = fq::random_element(&engine);
    fq c = fq::random_element(&engine);
    fq d = fq::random_element(&engine);

    std::vector<fq> input1{ a, b, c, d };
    std::vector<fq> input2{ d, c, b, a };

    auto r0 = crypto::Poseidon<crypto::PoseidonStark252BaseFieldParams>::hash(input1);
    auto r1 = crypto::Poseidon<crypto::PoseidonStark252BaseFieldParams>::hash(input1);
    auto r2 = crypto::Poseidon<crypto::PoseidonStark252BaseFieldParams>::hash(input2);

    EXPECT_EQ(r0, r1);
    EXPECT_NE(r0, r2);
}

TEST(Poseidon, HashConsistencyCheck)
{
    using fq = stark252::fq;

    fq a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fq b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fq c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fq d(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::vector<fq> input{ a, b, c, d };
    auto result = crypto::Poseidon<crypto::PoseidonStark252BaseFieldParams>::hash(input);

    fq expected(std::string("0x0494e3a5a8047943395f79e41f11ba73285be9aa930953fbad060c0649a7c79d"));

    EXPECT_EQ(result, expected);
}
#else

TEST(Poseidon, DisabledTests) {}
#endif
