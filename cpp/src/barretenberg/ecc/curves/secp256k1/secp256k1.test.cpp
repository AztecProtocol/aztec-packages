#include "secp256k1.hpp"
#include <gtest/gtest.h>
#include "barretenberg/numeric/random/engine.hpp"

namespace test_secp256k1 {

namespace {
auto& engine = numeric::random::get_debug_engine();
}

constexpr uint256_t test_fq_mod(secp256k1::Secp256k1FqParams::modulus_0,
                                secp256k1::Secp256k1FqParams::modulus_1,
                                secp256k1::Secp256k1FqParams::modulus_2,
                                secp256k1::Secp256k1FqParams::modulus_3);

uint256_t get_fq_element()
{
    uint256_t res = engine.get_random_uint256();
    while (res >= test_fq_mod) {
        res -= test_fq_mod;
    }
    return res;
}

TEST(secp256k1, test_add)
{
    const size_t n = 100;
    for (size_t i = 0; i < n; ++i) {
        uint256_t a_raw = get_fq_element();
        uint256_t b_raw = get_fq_element();

        secp256k1::fq a{ a_raw.data[0], a_raw.data[1], a_raw.data[2], a_raw.data[3] };
        secp256k1::fq b{ b_raw.data[0], b_raw.data[1], b_raw.data[2], b_raw.data[3] };

        secp256k1::fq c = a + b;

        uint256_t expected = a_raw + b_raw;
        if (expected < a_raw) {
            expected -= test_fq_mod;
        }
        uint256_t result{ c.data[0], c.data[1], c.data[2], c.data[3] };
        EXPECT_EQ(result, expected);
    }
}

TEST(secp256k1, test_sub)
{
    const size_t n = 100;
    for (size_t i = 0; i < n; ++i) {
        uint256_t a_raw = get_fq_element();
        uint256_t b_raw = get_fq_element();

        secp256k1::fq a{ a_raw.data[0], a_raw.data[1], a_raw.data[2], a_raw.data[3] };
        secp256k1::fq b{ b_raw.data[0], b_raw.data[1], b_raw.data[2], b_raw.data[3] };

        secp256k1::fq c = a - b;

        uint256_t expected = a_raw - b_raw;
        if (expected > a_raw) {
            expected += test_fq_mod;
        }
        uint256_t result{ c.data[0], c.data[1], c.data[2], c.data[3] };
        EXPECT_EQ(result, expected);
    }
}

TEST(secp256k1, test_to_montgomery_form)
{
    const size_t n = 10;
    for (size_t i = 0; i < n; ++i) {
        uint256_t a_raw = get_fq_element();
        secp256k1::fq montgomery_result(a_raw);

        uint512_t R = uint512_t(0, 1);
        uint512_t aR = uint512_t(a_raw) * R;
        uint256_t expected = (aR % uint512_t(test_fq_mod)).lo;

        uint256_t result{
            montgomery_result.data[0], montgomery_result.data[1], montgomery_result.data[2], montgomery_result.data[3]
        };
        EXPECT_EQ(result, expected);
    }
}

TEST(secp256k1, test_from_montgomery_form)
{
    const size_t n = 100;
    for (size_t i = 0; i < n; ++i) {
        uint256_t a_raw = get_fq_element();
        secp256k1::fq b(a_raw);
        uint256_t c(b);
        EXPECT_EQ(a_raw, c);
    }
}

TEST(secp256k1, test_mul)
{
    const size_t n = 10;
    for (size_t i = 0; i < n; ++i) {
        uint256_t a_raw = get_fq_element();
        uint256_t b_raw = get_fq_element();

        secp256k1::fq a(a_raw);
        secp256k1::fq b(b_raw);
        secp256k1::fq c = (a * b);

        uint1024_t a_1024 = uint1024_t(uint512_t(a_raw));
        uint1024_t b_1024 = uint1024_t(uint512_t(b_raw));
        uint1024_t c_1024 = a_1024 * b_1024;
        uint1024_t cmod = c_1024 % uint1024_t(uint512_t(test_fq_mod));
        uint256_t expected = cmod.lo.lo;
        uint256_t result(c);
        EXPECT_EQ(result, expected);
    }
}

TEST(secp256k1, test_sqr)
{
    const size_t n = 10;
    for (size_t i = 0; i < n; ++i) {
        uint256_t a_raw = get_fq_element();

        secp256k1::fq a(a_raw);
        secp256k1::fq c = a.sqr();

        uint512_t c_raw = uint512_t(a_raw) * uint512_t(a_raw);
        c_raw = c_raw % uint512_t(test_fq_mod);
        uint256_t expected = c_raw.lo;
        uint256_t result(c);
        EXPECT_EQ(result, expected);
    }
}

TEST(secp256k1, test_arithmetic)
{
    secp256k1::fq a = secp256k1::fq::random_element();
    secp256k1::fq b = secp256k1::fq::random_element();

    secp256k1::fq c = (a + b) * (a - b);
    secp256k1::fq d = a.sqr() - b.sqr();
    EXPECT_EQ(c, d);
}

TEST(secp256k1, generator_on_curve)
{
    secp256k1::g1::element result = secp256k1::g1::one;
    EXPECT_EQ(result.on_curve(), true);
}

TEST(secp256k1, random_element)
{
    secp256k1::g1::element result = secp256k1::g1::element::random_element();
    EXPECT_EQ(result.on_curve(), true);
}

TEST(secp256k1, random_affine_element)
{
    secp256k1::g1::affine_element result = secp256k1::g1::affine_element(secp256k1::g1::element::random_element());
    EXPECT_EQ(result.on_curve(), true);
}

TEST(secp256k1, eq)
{
    secp256k1::g1::element a = secp256k1::g1::element::random_element();
    secp256k1::g1::element b = a.normalize();

    EXPECT_EQ(a == b, true);
    EXPECT_EQ(a == a, true);

    b.self_set_infinity();

    EXPECT_EQ(a == b, false);
    secp256k1::g1::element c = secp256k1::g1::element::random_element();

    EXPECT_EQ(a == c, false);

    a.self_set_infinity();

    EXPECT_EQ(a == b, true);
}

TEST(secp256k1, check_group_modulus)
{
    // secp256k1::g1::affine_element expected = secp256k1::g1::affine_one;
    secp256k1::fr exponent = -secp256k1::fr(1);
    secp256k1::g1::element result = secp256k1::g1::one * exponent;
    result += secp256k1::g1::one;
    result += secp256k1::g1::one;
    EXPECT_EQ(result.on_curve(), true);
    EXPECT_EQ(result == secp256k1::g1::one, true);
}

// TEST(secp256k1, mixed_add_check_against_constants)
// {
//     fq a_x = {{0x92716caa6cac6d26, 0x1e6e234136736544, 0x1bb04588cde00af0, 0x9a2ac922d97e6f5}};
//     fq a_y = {{0x9e693aeb52d79d2d, 0xf0c1895a61e5e975, 0x18cd7f5310ced70f, 0xac67920a22939ad}};
//     fq a_z = {{0xfef593c9ce1df132, 0xe0486f801303c27d, 0x9bbd01ab881dc08e, 0x2a589badf38ec0f9}};
//     fq b_x = {{0xa1ec5d1398660db8, 0x6be3e1f6fd5d8ab1, 0x69173397dd272e11, 0x12575bbfe1198886}};
//     fq b_y = {{0xcfbfd4441138823e, 0xb5f817e28a1ef904, 0xefb7c5629dcc1c42, 0x1a9ed3d6f846230e}};
//     fq expected_x = {{0x2a9d0201fccca20, 0x36f969b294f31776, 0xee5534422a6f646, 0x911dbc6b02310b6}};
//     fq expected_y = {{0x14c30aaeb4f135ef, 0x9c27c128ea2017a1, 0xf9b7d80c8315eabf, 0x35e628df8add760}};
//     fq expected_z = {{0xa43fe96673d10eb3, 0x88fbe6351753d410, 0x45c21cc9d99cb7d, 0x3018020aa6e9ede5}};
//     secp256k1::g1::element lhs;
//     secp256k1::g1::affine_element rhs;
//     secp256k1::g1::element result;
//     secp256k1::g1::element expected;
//     fq::__to_montgomery_form(a_x, lhs.x);
//     fq::__to_montgomery_form(a_y, lhs.y);
//     fq::__to_montgomery_form(a_z, lhs.z);
//     fq::__to_montgomery_form(b_x, rhs.x);
//     fq::__to_montgomery_form(b_y, rhs.y);
//     fq::__to_montgomery_form(expected_x, expected.x);
//     fq::__to_montgomery_form(expected_y, expected.y);
//     fq::__to_montgomery_form(expected_z, expected.z);
//     result = lhs + rhs;

//     EXPECT_EQ(result == expected, true);
// }

// TEST(secp256k1, dbl_check_against_constants)
// {
//     fq a_x = {{0x8d1703aa518d827f, 0xd19cc40779f54f63, 0xabc11ce30d02728c, 0x10938940de3cbeec}};
//     fq a_y = {{0xcf1798994f1258b4, 0x36307a354ad90a25, 0xcd84adb348c63007, 0x6266b85241aff3f}};
//     fq a_z = {{0xe213e18fd2df7044, 0xb2f42355982c5bc8, 0xf65cf5150a3a9da1, 0xc43bde08b03aca2}};
//     fq expected_x = {{0xd5c6473044b2e67c, 0x89b185ea20951f3a, 0x4ac597219cf47467, 0x2d00482f63b12c86}};
//     fq expected_y = {{0x4e7e6c06a87e4314, 0x906a877a71735161, 0xaa7b9893cc370d39, 0x62f206bef795a05}};
//     fq expected_z = {{0x8813bdca7b0b115a, 0x929104dffdfabd22, 0x3fff575136879112, 0x18a299c1f683bdca}};
//     secp256k1::g1::element lhs;
//     secp256k1::g1::element result;
//     secp256k1::g1::element expected;
//     fq::__to_montgomery_form(a_x, lhs.x);
//     fq::__to_montgomery_form(a_y, lhs.y);
//     fq::__to_montgomery_form(a_z, lhs.z);
//     fq::__to_montgomery_form(expected_x, expected.x);
//     fq::__to_montgomery_form(expected_y, expected.y);
//     fq::__to_montgomery_form(expected_z, expected.z);

//     result = lhs.dbl();
//     result.self_dbl();
//     result.self_dbl();

//     EXPECT_EQ(result == expected, true);
// }

// TEST(secp256k1, add_check_against_constants)
// {
//     fq a_x = {{0x184b38afc6e2e09a, 0x4965cd1c3687f635, 0x334da8e7539e71c4, 0xf708d16cfe6e14}};
//     fq a_y = {{0x2a6ff6ffc739b3b6, 0x70761d618b513b9, 0xbf1645401de26ba1, 0x114a1616c164b980}};
//     fq a_z = {{0x10143ade26bbd57a, 0x98cf4e1f6c214053, 0x6bfdc534f6b00006, 0x1875e5068ababf2c}};
//     fq b_x = {{0xafdb8a15c98bf74c, 0xac54df622a8d991a, 0xc6e5ae1f3dad4ec8, 0x1bd3fb4a59e19b52}};
//     fq b_y = {{0x21b3bb529bec20c0, 0xaabd496406ffb8c1, 0xcd3526c26ac5bdcb, 0x187ada6b8693c184}};
//     fq b_z = {{0xffcd440a228ed652, 0x8a795c8f234145f1, 0xd5279cdbabb05b95, 0xbdf19ba16fc607a}};
//     fq expected_x = {{0x18764da36aa4cd81, 0xd15388d1fea9f3d3, 0xeb7c437de4bbd748, 0x2f09b712adf6f18f}};
//     fq expected_y = {{0x50c5f3cab191498c, 0xe50aa3ce802ea3b5, 0xd9d6125b82ebeff8, 0x27e91ba0686e54fe}};
//     fq expected_z = {{0xe4b81ef75fedf95, 0xf608edef14913c75, 0xfd9e178143224c96, 0xa8ae44990c8accd}};
//     secp256k1::g1::element lhs;
//     secp256k1::g1::element rhs;
//     secp256k1::g1::element result;
//     secp256k1::g1::element expected;

//     fq::__to_montgomery_form(a_x, lhs.x);
//     fq::__to_montgomery_form(a_y, lhs.y);
//     fq::__to_montgomery_form(a_z, lhs.z);
//     fq::__to_montgomery_form(b_x, rhs.x);
//     fq::__to_montgomery_form(b_y, rhs.y);
//     fq::__to_montgomery_form(b_z, rhs.z);
//     fq::__to_montgomery_form(expected_x, expected.x);
//     fq::__to_montgomery_form(expected_y, expected.y);
//     fq::__to_montgomery_form(expected_z, expected.z);

//     result = lhs + rhs;

//     EXPECT_EQ(result == expected, true);
// }

TEST(secp256k1, add_exception_test_infinity)
{
    secp256k1::g1::element lhs = secp256k1::g1::element::random_element();
    secp256k1::g1::element rhs;
    secp256k1::g1::element result;

    rhs = -lhs;

    result = lhs + rhs;

    EXPECT_EQ(result.is_point_at_infinity(), true);

    secp256k1::g1::element rhs_b;
    rhs_b = rhs;
    rhs_b.self_set_infinity();

    result = lhs + rhs_b;

    EXPECT_EQ(lhs == result, true);

    lhs.self_set_infinity();
    result = lhs + rhs;

    EXPECT_EQ(rhs == result, true);
}

TEST(secp256k1, add_exception_test_dbl)
{
    secp256k1::g1::element lhs = secp256k1::g1::element::random_element();
    secp256k1::g1::element rhs;
    rhs = lhs;

    secp256k1::g1::element result;
    secp256k1::g1::element expected;

    result = lhs + rhs;
    expected = lhs.dbl();

    EXPECT_EQ(result == expected, true);
}

TEST(secp256k1, add_dbl_consistency)
{
    secp256k1::g1::element a = secp256k1::g1::element::random_element();
    secp256k1::g1::element b = secp256k1::g1::element::random_element();

    secp256k1::g1::element c;
    secp256k1::g1::element d;
    secp256k1::g1::element add_result;
    secp256k1::g1::element dbl_result;

    c = a + b;
    b = -b;
    d = a + b;

    add_result = c + d;
    dbl_result = a.dbl();

    EXPECT_EQ(add_result == dbl_result, true);
}

TEST(secp256k1, add_dbl_consistency_repeated)
{
    secp256k1::g1::element a = secp256k1::g1::element::random_element();
    secp256k1::g1::element b;
    secp256k1::g1::element c;
    secp256k1::g1::element d;
    secp256k1::g1::element e;

    secp256k1::g1::element result;
    secp256k1::g1::element expected;

    b = a.dbl(); // b = 2a
    c = b.dbl(); // c = 4a

    d = a + b;      // d = 3a
    e = a + c;      // e = 5a
    result = d + e; // result = 8a

    expected = c.dbl(); // expected = 8a

    EXPECT_EQ(result == expected, true);
}

TEST(secp256k1, mixed_add_exception_test_infinity)
{
    secp256k1::g1::element lhs = secp256k1::g1::one;
    secp256k1::g1::affine_element rhs = secp256k1::g1::affine_element(secp256k1::g1::element::random_element());
    secp256k1::fq::__copy(rhs.x, lhs.x);
    lhs.y = -rhs.y;

    secp256k1::g1::element result;
    result = lhs + rhs;

    EXPECT_EQ(result.is_point_at_infinity(), true);

    lhs.self_set_infinity();
    result = lhs + rhs;
    secp256k1::g1::element rhs_c;
    rhs_c = secp256k1::g1::element(rhs);

    EXPECT_EQ(rhs_c == result, true);
}

TEST(secp256k1, mixed_add_exception_test_dbl)
{
    secp256k1::g1::affine_element rhs = secp256k1::g1::affine_element(secp256k1::g1::element::random_element());
    secp256k1::g1::element lhs;
    lhs = secp256k1::g1::element(rhs);

    secp256k1::g1::element result;
    secp256k1::g1::element expected;
    result = lhs + rhs;

    expected = lhs.dbl();

    EXPECT_EQ(result == expected, true);
}

TEST(secp256k1, add_mixed_add_consistency_check)
{
    secp256k1::g1::affine_element rhs = secp256k1::g1::affine_element(secp256k1::g1::element::random_element());
    secp256k1::g1::element lhs = secp256k1::g1::element::random_element();
    secp256k1::g1::element rhs_b;
    rhs_b = secp256k1::g1::element(rhs);

    secp256k1::g1::element add_result;
    secp256k1::g1::element mixed_add_result;
    add_result = lhs + rhs_b;
    mixed_add_result = lhs + rhs;

    EXPECT_EQ(add_result == mixed_add_result, true);
}

TEST(secp256k1, on_curve)
{
    for (size_t i = 0; i < 100; ++i) {
        secp256k1::g1::element test = secp256k1::g1::element::random_element();
        EXPECT_EQ(test.on_curve(), true);
        secp256k1::g1::affine_element affine_test =
            secp256k1::g1::affine_element(secp256k1::g1::element::random_element());
        EXPECT_EQ(affine_test.on_curve(), true);
    }
}
TEST(secp256k1, batch_normalize)
{
    size_t num_points = 2;
    secp256k1::g1::element points[num_points];
    secp256k1::g1::element normalized[num_points];
    for (size_t i = 0; i < num_points; ++i) {
        secp256k1::g1::element a = secp256k1::g1::element::random_element();
        secp256k1::g1::element b = secp256k1::g1::element::random_element();
        points[i] = a + b;
        normalized[i] = points[i];
    }
    secp256k1::g1::element::batch_normalize(normalized, num_points);

    for (size_t i = 0; i < num_points; ++i) {
        secp256k1::fq zz;
        secp256k1::fq zzz;
        secp256k1::fq result_x;
        secp256k1::fq result_y;
        zz = points[i].z.sqr();
        zzz = points[i].z * zz;
        result_x = normalized[i].x * zz;
        result_y = normalized[i].y * zzz;

        EXPECT_EQ((result_x == points[i].x), true);
        EXPECT_EQ((result_y == points[i].y), true);
    }
}

TEST(secp256k1, group_exponentiation_zero_and_one)
{
    secp256k1::g1::affine_element result = secp256k1::g1::one * secp256k1::fr::zero();

    EXPECT_EQ(result.is_point_at_infinity(), true);

    result = secp256k1::g1::one * secp256k1::fr::one();

    EXPECT_EQ(result == secp256k1::g1::affine_one, true);
}

TEST(secp256k1, group_exponentiation_consistency_check)
{
    secp256k1::fr a = secp256k1::fr::random_element();
    secp256k1::fr b = secp256k1::fr::random_element();

    secp256k1::fr c;
    c = a * b;

    secp256k1::g1::affine_element input = secp256k1::g1::affine_one;
    secp256k1::g1::affine_element result = input * a;
    result = result * b;

    secp256k1::g1::affine_element expected = input * c;

    EXPECT_EQ(result == expected, true);
}

TEST(secp256k1, derive_generators)
{
    constexpr size_t num_generators = 128;
    auto result = secp256k1::g1::derive_generators<num_generators>();

    const auto is_unique = [&result](const secp256k1::g1::affine_element& y, const size_t j) {
        for (size_t i = 0; i < result.size(); ++i) {
            if ((i != j) && result[i] == y) {
                return false;
            }
        }
        return true;
    };

    for (size_t k = 0; k < num_generators; ++k) {
        EXPECT_EQ(is_unique(result[k], k), true);
        EXPECT_EQ(result[k].on_curve(), true);
    }
}

TEST(secp256k1, get_endomorphism_scalars)
{
    for (size_t i = 0; i < 2048; i++) {
        secp256k1::fr k = secp256k1::fr::random_element();
        secp256k1::fr k1 = 0;
        secp256k1::fr k2 = 0;

        secp256k1::fr::split_into_endomorphism_scalars(k, k1, k2);
        bool k1_neg = false;
        bool k2_neg = false;

        if (k2.uint256_t_no_montgomery_conversion().get_msb() > 200) {
            k2 = -k2;
            k2_neg = true;
        }

        EXPECT_LT(k1.uint256_t_no_montgomery_conversion().get_msb(), 129ULL);
        EXPECT_LT(k2.uint256_t_no_montgomery_conversion().get_msb(), 129ULL);

        if (k1_neg) {
            k1 = -k1;
        }
        if (k2_neg) {
            k2 = -k2;
        }

        k1.self_to_montgomery_form();
        k2.self_to_montgomery_form();

        secp256k1::fr beta = secp256k1::fr::cube_root_of_unity();
        secp256k1::fr expected = k1 - k2 * beta;

        expected.self_from_montgomery_form();
        EXPECT_EQ(k, expected);
    }
}

TEST(secp256k1, test_endomorphism_scalars)
{
    secp256k1::fr k = secp256k1::fr::random_element();
    secp256k1::fr k1 = 0;
    secp256k1::fr k2 = 0;

    secp256k1::fr::split_into_endomorphism_scalars(k, k1, k2);
    bool k1_neg = false;
    bool k2_neg = false;

    if (k1.uint256_t_no_montgomery_conversion().get_msb() > 200) {
        k1 = -k1;
        k1_neg = true;
    }
    if (k2.uint256_t_no_montgomery_conversion().get_msb() > 200) {
        k2 = -k2;
        k2_neg = true;
    }

    EXPECT_LT(k1.uint256_t_no_montgomery_conversion().get_msb(), 129ULL);
    EXPECT_LT(k2.uint256_t_no_montgomery_conversion().get_msb(), 129ULL);

    if (k1_neg) {
        k1 = -k1;
    }
    if (k2_neg) {
        k2 = -k2;
    }
    k1.self_to_montgomery_form();
    k2.self_to_montgomery_form();
    static const uint256_t secp256k1_const_lambda{
        0xDF02967C1B23BD72ULL, 0x122E22EA20816678UL, 0xA5261C028812645AULL, 0x5363AD4CC05C30E0ULL
    };

    secp256k1::fr expected = k1 - k2 * secp256k1_const_lambda;

    expected.self_from_montgomery_form();
    EXPECT_EQ(k, expected);
}

TEST(secp256k1, neg_and_self_neg_0_cmp_regression)
{
    secp256k1::fq a = 0;
    secp256k1::fq a_neg = -a;
    EXPECT_EQ((a == a_neg), true);
    a = 0;
    a_neg = 0;
    a_neg.self_neg();
    EXPECT_EQ((a == a_neg), true);
}

TEST(secp256k1, montgomery_mul_big_bug)
{
    secp256k1::fq a(uint256_t{ 0xfffffffe630dc02f, 0xffffffffffffffff, 0xffffffffffffffff, 0xffffffffffffffff });
    secp256k1::fq a_sqr = a.sqr();
    secp256k1::fq expected(uint256_t{ 0x60381e557e100000, 0x0, 0x0, 0x0 });
    EXPECT_EQ((a_sqr == expected), true);
}

} // namespace test_secp256k1
