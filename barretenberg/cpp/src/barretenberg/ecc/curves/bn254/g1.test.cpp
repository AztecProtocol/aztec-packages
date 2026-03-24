#include "g1.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
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

TEST(g1, BIsCorrect)
{
    fq b = Bn254G1Params::b;
    fq expected = fq(3);

    EXPECT_EQ(b, expected);
}

TEST(g1, OneYIsCorrect)
{
    fq one_y = Bn254G1Params::one_y;
    auto [_, expected] = (Bn254G1Params::b + fq::one()).sqrt();

    EXPECT_EQ(one_y, expected);
}

// =========================
// Group-related tests
// =========================

TEST(g1, MixedAddCheckAgainstConstants)
{
    fq a_x{ 0x92716caa6cac6d26, 0x1e6e234136736544, 0x1bb04588cde00af0, 0x9a2ac922d97e6f5 };
    fq a_y{ 0x9e693aeb52d79d2d, 0xf0c1895a61e5e975, 0x18cd7f5310ced70f, 0xac67920a22939ad };
    fq a_z{ 0xfef593c9ce1df132, 0xe0486f801303c27d, 0x9bbd01ab881dc08e, 0x2a589badf38ec0f9 };
    fq b_x{ 0xa1ec5d1398660db8, 0x6be3e1f6fd5d8ab1, 0x69173397dd272e11, 0x12575bbfe1198886 };
    fq b_y{ 0xcfbfd4441138823e, 0xb5f817e28a1ef904, 0xefb7c5629dcc1c42, 0x1a9ed3d6f846230e };
    fq expected_x{ 0x2a9d0201fccca20, 0x36f969b294f31776, 0xee5534422a6f646, 0x911dbc6b02310b6 };
    fq expected_y{ 0x14c30aaeb4f135ef, 0x9c27c128ea2017a1, 0xf9b7d80c8315eabf, 0x35e628df8add760 };
    fq expected_z{ 0xa43fe96673d10eb3, 0x88fbe6351753d410, 0x45c21cc9d99cb7d, 0x3018020aa6e9ede5 };
    g1::element lhs;
    g1::affine_element rhs;
    g1::element result;
    g1::element expected;
    lhs.x = a_x.to_montgomery_form();
    lhs.y = a_y.to_montgomery_form();
    lhs.z = a_z.to_montgomery_form();
    rhs.x = b_x.to_montgomery_form();
    rhs.y = b_y.to_montgomery_form();
    expected.x = expected_x.to_montgomery_form();
    expected.y = expected_y.to_montgomery_form();
    expected.z = expected_z.to_montgomery_form();
    result = lhs + rhs;

    EXPECT_EQ(result == expected, true);
}

TEST(g1, DblCheckAgainstConstants)
{
    fq a_x{ 0x8d1703aa518d827f, 0xd19cc40779f54f63, 0xabc11ce30d02728c, 0x10938940de3cbeec };
    fq a_y{ 0xcf1798994f1258b4, 0x36307a354ad90a25, 0xcd84adb348c63007, 0x6266b85241aff3f };
    fq a_z{ 0xe213e18fd2df7044, 0xb2f42355982c5bc8, 0xf65cf5150a3a9da1, 0xc43bde08b03aca2 };
    fq expected_x{ 0xd5c6473044b2e67c, 0x89b185ea20951f3a, 0x4ac597219cf47467, 0x2d00482f63b12c86 };
    fq expected_y{ 0x4e7e6c06a87e4314, 0x906a877a71735161, 0xaa7b9893cc370d39, 0x62f206bef795a05 };
    fq expected_z{ 0x8813bdca7b0b115a, 0x929104dffdfabd22, 0x3fff575136879112, 0x18a299c1f683bdca };
    g1::element lhs;
    g1::element result;
    g1::element expected;
    lhs.x = a_x.to_montgomery_form();
    lhs.y = a_y.to_montgomery_form();
    lhs.z = a_z.to_montgomery_form();
    expected.x = expected_x.to_montgomery_form();
    expected.y = expected_y.to_montgomery_form();
    expected.z = expected_z.to_montgomery_form();

    result = lhs.dbl();
    result.self_dbl();
    result.self_dbl();

    EXPECT_EQ(result == expected, true);
}

TEST(g1, AddCheckAgainstConstants)
{
    fq a_x{ 0x184b38afc6e2e09a, 0x4965cd1c3687f635, 0x334da8e7539e71c4, 0xf708d16cfe6e14 };
    fq a_y{ 0x2a6ff6ffc739b3b6, 0x70761d618b513b9, 0xbf1645401de26ba1, 0x114a1616c164b980 };
    fq a_z{ 0x10143ade26bbd57a, 0x98cf4e1f6c214053, 0x6bfdc534f6b00006, 0x1875e5068ababf2c };
    fq b_x{ 0xafdb8a15c98bf74c, 0xac54df622a8d991a, 0xc6e5ae1f3dad4ec8, 0x1bd3fb4a59e19b52 };
    fq b_y{ 0x21b3bb529bec20c0, 0xaabd496406ffb8c1, 0xcd3526c26ac5bdcb, 0x187ada6b8693c184 };
    fq b_z{ 0xffcd440a228ed652, 0x8a795c8f234145f1, 0xd5279cdbabb05b95, 0xbdf19ba16fc607a };
    fq expected_x{ 0x18764da36aa4cd81, 0xd15388d1fea9f3d3, 0xeb7c437de4bbd748, 0x2f09b712adf6f18f };
    fq expected_y{ 0x50c5f3cab191498c, 0xe50aa3ce802ea3b5, 0xd9d6125b82ebeff8, 0x27e91ba0686e54fe };
    fq expected_z{ 0xe4b81ef75fedf95, 0xf608edef14913c75, 0xfd9e178143224c96, 0xa8ae44990c8accd };
    g1::element lhs;
    g1::element rhs;
    g1::element result;
    g1::element expected;

    lhs.x = a_x.to_montgomery_form();
    lhs.y = a_y.to_montgomery_form();
    lhs.z = a_z.to_montgomery_form();
    rhs.x = b_x.to_montgomery_form();
    rhs.y = b_y.to_montgomery_form();
    rhs.z = b_z.to_montgomery_form();
    expected.x = expected_x.to_montgomery_form();
    expected.y = expected_y.to_montgomery_form();
    expected.z = expected_z.to_montgomery_form();

    result = lhs + rhs;

    EXPECT_EQ(result == expected, true);
}

TEST(g1, GroupExponentiationCheckAgainstConstants)
{
    fr a{ 0xb67299b792199cf0, 0xc1da7df1e7e12768, 0x692e427911532edf, 0x13dd85e87dc89978 };
    a.self_to_montgomery_form();

    fq expected_x{ 0x9bf840faf1b4ba00, 0xe81b7260d068e663, 0x7610c9a658d2c443, 0x278307cd3d0cddb0 };
    fq expected_y{ 0xf6ed5fb779ebecb, 0x414ca771acbe183c, 0xe3692cb56dfbdb67, 0x3d3c5ed19b080a3 };

    g1::affine_element expected;
    expected.x = expected_x.to_montgomery_form();
    expected.y = expected_y.to_montgomery_form();

    g1::affine_element result(g1::one * a);

    EXPECT_EQ(result == expected, true);
}

TEST(g1, OperatorOrdering)
{
    fr scalar{ 0xcfbfd4441138823e, 0xb5f817e28a1ef904, 0xefb7c5629dcc1c42, 0x1a9ed3d6f846230e };

    g1::element a = g1::one;
    g1::affine_element b(a);

    g1::element c = a + b;
    g1::element d = b + a;
    EXPECT_EQ(c, d);

    g1::element e = a * scalar;
    g1::element f = b * scalar;
    g1::affine_element g = b * scalar;
    g1::affine_element h = a * scalar;
    EXPECT_EQ(e, f);
    EXPECT_EQ(g, h);
}

template <class T> void write(const T t)
{
    FILE* fp = fopen("/dev/null", "wb");
    static_cast<void>(fwrite(&t, sizeof(t), 1, fp));
    static_cast<void>(fclose(fp));
}

#if !defined(__wasm__)
TEST(g1, InitializationCheck)
{
    // NOLINTNEXTLINE not our fault googletest uses `goto`!
    EXPECT_NO_THROW(write<g1::affine_element>({}));
}
#endif

TEST(g1, CheckPrecomputedGenerators)
{
    ASSERT_TRUE((bb::check_precomputed_generators<g1, "biggroup table offset generator", 1UL>()));
    ASSERT_TRUE((bb::check_precomputed_generators<g1, "biggroup offset generator", 1UL>()));
    ASSERT_TRUE((bb::check_precomputed_generators<g1, "ECCVM_OFFSET_GENERATOR", 1UL>()));
    ASSERT_TRUE((bb::check_precomputed_generators<g1, "test generators", 2UL>()));
}

// Regression: boundary scalars k = ceil(m * 2^256 / endo_g2) (from endomorphism_scalars.py)
// previously triggered the negative-k2 bug in split_into_endomorphism_scalars, producing wrong
// scalar multiplication results. We test boundaries and random samples within each band.
TEST(g1, ScalarMulNegativeK2Regression)
{
    // clang-format off
    struct test_case { std::array<uint64_t, 4> limbs; const char* tag; };
    const std::array<test_case, 3> boundary_cases = {{
        {{ 0x01624731e1195570, 0x3ba491482db4da14, 0x59e26bcea0d48bac, 0x0 }, "m=1"},
        {{ 0x02c48e63c232aadf, 0x774922905b69b428, 0xb3c4d79d41a91758, 0x0 }, "m=2"},
        {{ 0x0426d595a34c004e, 0xb2edb3d8891e8e3c, 0x0da7436be27da304, 0x1 }, "m=3"},
    }};
    // clang-format on

    for (const auto& tc : boundary_cases) {
        fr base_scalar{ tc.limbs[0], tc.limbs[1], tc.limbs[2], tc.limbs[3] };
        base_scalar.self_to_montgomery_form();

        g1::affine_element endo_result(g1::one * base_scalar);
        g1::affine_element naive_result = naive_scalar_mul<g1, fr>(g1::one, base_scalar);
        EXPECT_EQ(naive_result.on_curve(), true) << tc.tag;
        EXPECT_EQ(endo_result.on_curve(), true) << tc.tag;
        EXPECT_EQ(endo_result, naive_result) << tc.tag;

        // Random samples within the formerly-buggy band (~2^123-2^126 wide; 122-bit offsets).
        for (size_t i = 0; i < 100; ++i) {
            uint256_t rand_bits(fr::random_element());
            uint256_t offset_int = (rand_bits & ((uint256_t(1) << 122) - 1)) + 1;
            fr scalar = base_scalar + fr(offset_int);

            g1::affine_element endo_res(g1::one * scalar);
            g1::affine_element naive_res = naive_scalar_mul<g1, fr>(g1::one, scalar);
            EXPECT_EQ(naive_res.on_curve(), true) << tc.tag << " offset " << i;
            EXPECT_EQ(endo_res.on_curve(), true) << tc.tag << " offset " << i;
            EXPECT_EQ(endo_res, naive_res) << tc.tag << " offset " << i;
        }
    }
}
