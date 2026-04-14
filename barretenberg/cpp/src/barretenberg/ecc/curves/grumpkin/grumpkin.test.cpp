#include "grumpkin.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_grumpkin_impl.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
// Double-and-add scalar mul without endomorphism, used as reference for differential testing.
template <typename Group, typename Fr>
typename Group::affine_element naive_scalar_mul(const typename Group::element& base, const Fr& scalar)
{
    typename Group::element acc = Group::point_at_infinity;
    typename Group::element runner = base;
    uint256_t bits(scalar);
    for (size_t i = 0; i < 256; ++i) {
        if (bits.get_bit(i)) {
            acc = acc + runner;
        }
        runner = runner.dbl();
    }
    return typename Group::affine_element(acc);
}
} // namespace

// =========================
// Parameter-related tests
// =========================

TEST(grumpkin, CheckB)
{
    auto b = grumpkin::g1::curve_b;
    fr seventeen = 17;
    EXPECT_EQ(seventeen, -b);
}

TEST(grumpkin, SubgroupGenerator)
{
    bb::fq subgroup_generator = bb::curve::Grumpkin::subgroup_generator;
    bb::fq subgroup_generator_inverse = bb::curve::Grumpkin::subgroup_generator_inverse;

    EXPECT_NE(subgroup_generator.pow(3), fq::one());
    EXPECT_NE(subgroup_generator.pow(29), fq::one());
    EXPECT_EQ(subgroup_generator.pow(87), fq::one());
    EXPECT_EQ(subgroup_generator * subgroup_generator_inverse, fq::one());
}

TEST(grumpkin, OneYIsCorrect)
{
    fr one_y = bb::grumpkin::G1Params::one_y;
    auto [_, expected] = (bb::grumpkin::G1Params::b + fr::one()).sqrt();

    EXPECT_EQ(one_y, -expected);
}

// =========================
// Group-related tests
// =========================

// Checks for "bad points" in terms of sharing a y-coordinate as explained here:
// https://github.com/AztecProtocol/aztec2-internal/issues/437
TEST(grumpkin, BadPoints)
{
    auto beta = grumpkin::fr::cube_root_of_unity();
    auto beta_sqr = beta * beta;
    bool res = true;
    grumpkin::fr c(1);
    for (size_t i = 0; i < 256; i++) {
        auto val = c / (grumpkin::fr(1) + c);
        if (val == beta || val == beta_sqr) {
            res = false;
        }
        c *= grumpkin::fr(4);
    }
    EXPECT_TRUE(res);
}

TEST(grumpkin, CheckPrecomputedGenerators)
{
    ASSERT_TRUE((bb::check_precomputed_generators<grumpkin::g1, "pedersen_hash_length", 1UL>()));
    ASSERT_TRUE((bb::check_precomputed_generators<grumpkin::g1, "DEFAULT_DOMAIN_SEPARATOR", 8UL>()));
}

// Regression: boundary scalars k = ceil(m * 2^256 / endo_g2) (from endomorphism_scalars.py)
// previously triggered the negative-k2 bug in split_into_endomorphism_scalars, producing wrong
// scalar multiplication results. We test boundaries and random samples within each band.
TEST(grumpkin, ScalarMulNegativeK2Regression)
{
    // clang-format off
    struct test_case { std::array<uint64_t, 4> limbs; const char* tag; };
    const std::array<test_case, 3> boundary_cases = {{
        {{ 0x71922da036dca5f4, 0xd970a56127fb8227, 0x59e26bcea0d48bac, 0x0 }, "m=1"},
        {{ 0xe3245b406db94be8, 0xb2e14ac24ff7044e, 0xb3c4d79d41a91759, 0x0 }, "m=2"},
        {{ 0x54b688e0a495f1dc, 0x8c51f02377f28676, 0x0da7436be27da306, 0x1 }, "m=3"},
    }};
    // clang-format on

    for (const auto& tc : boundary_cases) {
        grumpkin::fr base_scalar{ tc.limbs[0], tc.limbs[1], tc.limbs[2], tc.limbs[3] };
        base_scalar.self_to_montgomery_form();

        grumpkin::g1::affine_element endo_result(grumpkin::g1::one * base_scalar);
        grumpkin::g1::affine_element naive_result =
            naive_scalar_mul<grumpkin::g1, grumpkin::fr>(grumpkin::g1::one, base_scalar);
        EXPECT_EQ(naive_result.on_curve(), true) << tc.tag;
        EXPECT_EQ(endo_result.on_curve(), true) << tc.tag;
        EXPECT_EQ(endo_result, naive_result) << tc.tag;

        // Random samples within the formerly-buggy band (~2^123-2^126 wide; 122-bit offsets).
        for (size_t i = 0; i < 100; ++i) {
            uint256_t rand_bits(grumpkin::fr::random_element());
            uint256_t offset_int = (rand_bits & ((uint256_t(1) << 122) - 1)) + 1;
            grumpkin::fr scalar = base_scalar + grumpkin::fr(offset_int);

            grumpkin::g1::affine_element endo_res(grumpkin::g1::one * scalar);
            grumpkin::g1::affine_element naive_res =
                naive_scalar_mul<grumpkin::g1, grumpkin::fr>(grumpkin::g1::one, scalar);
            EXPECT_EQ(naive_res.on_curve(), true) << tc.tag << " offset " << i;
            EXPECT_EQ(endo_res.on_curve(), true) << tc.tag << " offset " << i;
            EXPECT_EQ(endo_res, naive_res) << tc.tag << " offset " << i;
        }
    }
}
