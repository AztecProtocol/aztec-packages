#include "fq.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include <gtest/gtest.h>

using namespace bb;

// Used to ensure variables are evaluated at runtime and not compile time.
// If EXPECT_EQ macro params are evaluated at compile-time, compiler can optimize them away.
// This triggers compiler errors due to the gtest suite expecting at least one test statement in a TEST macro
void shallow_copy(const fq& in, fq& out)
{
    out.data[0] = in.data[0];
    out.data[1] = in.data[1];
    out.data[2] = in.data[2];
    out.data[3] = in.data[3];
};
TEST(fq, Msgpack)
{
    auto [actual, expected] = msgpack_roundtrip(bb::fq{ 1ULL, 2ULL, 3ULL, 4ULL });
    EXPECT_EQ(actual, expected);
}

TEST(fq, Eq)
{
    constexpr fq a{ 0x01, 0x02, 0x03, 0x04 };
    constexpr fq b{ 0x01, 0x02, 0x03, 0x04 };
    constexpr fq c{ 0x01, 0x02, 0x03, 0x05 };
    constexpr fq d{ 0x01, 0x02, 0x04, 0x04 };
    constexpr fq e{ 0x01, 0x03, 0x03, 0x04 };
    constexpr fq f{ 0x02, 0x02, 0x03, 0x04 };
    static_assert(a == b);
    static_assert(!(a == c));
    static_assert(!(a == d));
    static_assert(!(a == e));
    static_assert(!(a == f));

    fq a_var;
    fq b_var;
    fq c_var;
    fq d_var;
    fq e_var;
    fq f_var;

    shallow_copy(a, a_var);
    shallow_copy(b, b_var);
    shallow_copy(c, c_var);
    shallow_copy(d, d_var);
    shallow_copy(e, e_var);
    shallow_copy(f, f_var);

    EXPECT_EQ(a_var == a_var, true);
    EXPECT_EQ(a_var == b_var, true);
    EXPECT_EQ(a_var == c_var, false);
    EXPECT_EQ(a_var == d_var, false);
    EXPECT_EQ(a_var == e_var, false);
    EXPECT_EQ(a_var == f_var, false);
}

TEST(fq, IsZero)
{
    fq a = fq::zero();
    fq b = fq::zero();
    fq c = fq::zero();
    fq d = fq::zero();
    fq e = fq::zero();

    b.data[0] = 1;
    c.data[1] = 1;
    d.data[2] = 1;
    e.data[3] = 1;
    EXPECT_EQ(a.is_zero(), true);
    EXPECT_EQ(b.is_zero(), false);
    EXPECT_EQ(c.is_zero(), false);
    EXPECT_EQ(d.is_zero(), false);
    EXPECT_EQ(e.is_zero(), false);
}

TEST(fq, RandomElement)
{
    fq a = fq::random_element();
    fq b = fq::random_element();

    EXPECT_EQ(a == b, false);
    EXPECT_EQ(a.is_zero(), false);
    EXPECT_EQ(a.is_zero(), false);
}

TEST(fq, MulCheckAgainstConstants)
{
    // test against some randomly generated test data
    constexpr fq a = uint256_t{ 0xa9b879029c49e60eUL, 0x2517b72250caa7b3UL, 0x6b86c81105dae2d1UL, 0x3a81735d5aec0c3UL };
    constexpr fq a_copy =
        uint256_t{ 0xa9b879029c49e60eUL, 0x2517b72250caa7b3UL, 0x6b86c81105dae2d1UL, 0x3a81735d5aec0c3UL };
    constexpr fq b = uint256_t{ 0x744fc10aec23e56aUL, 0x5dea4788a3b936a6UL, 0xa0a89f4a8af01df1UL, 0x72ae28836807df3UL };
    constexpr fq b_copy =
        uint256_t{ 0x744fc10aec23e56aUL, 0x5dea4788a3b936a6UL, 0xa0a89f4a8af01df1UL, 0x72ae28836807df3UL };

    constexpr fq const_expected =
        uint256_t{ 0x6c0a789c0028fd09UL, 0xca9520d84c684efaUL, 0xcbf3f7b023a852b4UL, 0x1b2e4dac41400621UL };
    constexpr fq const_result = a * b;
    static_assert(const_result == const_expected);
    static_assert(a == a_copy);
    static_assert(b == b_copy);

    fq c;
    fq d;
    shallow_copy(a, c);
    shallow_copy(b, d);
    EXPECT_EQ(c * d, const_expected);
}

// validate that zero-value limbs don't cause any problems
TEST(fq, MulShortIntegers)
{
    constexpr fq a{ 0xa, 0, 0, 0 };
    constexpr fq b{ 0xb, 0, 0, 0 };
    constexpr uint256_t a_original(a);
    constexpr uint256_t b_original(b);
    uint256_t prod_expected = (uint512_t(a_original) * uint512_t(b_original) % uint512_t(fq::modulus)).lo;
    fq const_expected = prod_expected;
    constexpr fq const_result = a * b;
    ASSERT_EQ(const_result, const_expected);

    fq c;
    fq d;
    shallow_copy(a, c);
    shallow_copy(b, d);
    EXPECT_EQ(c * d, const_expected);
}

TEST(fq, MulSqrConsistency)
{
    fq a = fq::random_element();
    fq b = fq::random_element();
    fq t1;
    fq t2;
    fq mul_result;
    fq sqr_result;
    t1 = a - b;
    t2 = a + b;
    mul_result = t1 * t2;
    t1 = a.sqr();
    t2 = b.sqr();
    sqr_result = t1 - t2;
    EXPECT_EQ(mul_result, sqr_result);
}

TEST(fq, SqrCheckAgainstConstants)
{
    constexpr fq a = uint256_t{ 0xa9b879029c49e60eUL, 0x2517b72250caa7b3UL, 0x6b86c81105dae2d1UL, 0x3a81735d5aec0c3UL };

    constexpr fq expected =
        uint256_t{ 0x41081a42fdaa7e23UL, 0x44d1140f756ed419UL, 0x53716b0a6f253e63UL, 0xb1a0b04044d75fUL };
    constexpr fq result = a.sqr();
    static_assert(result == expected);

    fq b;
    shallow_copy(a, b);

    fq c = b.sqr();
    EXPECT_EQ(result, c);
}

TEST(fq, AddCheckAgainstConstants)
{
    constexpr fq a{ 0x7d2e20e82f73d3e8, 0x8e50616a7a9d419d, 0xcdc833531508914b, 0xd510253a2ce62c };
    constexpr fq b{ 0x2829438b071fd14e, 0xb03ef3f9ff9274e, 0x605b671f6dc7b209, 0x8701f9d971fbc9 };
    constexpr fq const_expected{ 0xa55764733693a536, 0x995450aa1a9668eb, 0x2e239a7282d04354, 0x15c121f139ee1f6 };
    constexpr fq const_result = a + b;
    static_assert(const_result == const_expected);

    fq c;
    fq d;
    shallow_copy(a, c);
    shallow_copy(b, d);
    EXPECT_EQ(c + d, const_expected);
}

TEST(fq, SubCheckAgainstConstants)
{
    constexpr fq a{ 0xd68d01812313fb7c, 0x2965d7ae7c6070a5, 0x08ef9af6d6ba9a48, 0x0cb8fe2108914f53 };
    constexpr fq b{ 0x2cd2a2a37e9bf14a, 0xebc86ef589c530f6, 0x75124885b362b8fe, 0x1394324205c7a41d };
    constexpr fq const_expected{ 0xe5daeaf47cf50779, 0xd51ed34a5b0d0a3c, 0x4c2d9827a4d939a6, 0x29891a51e3fb4b5f };
    constexpr fq const_result = a - b;
    static_assert(const_result == const_expected);

    fq c;
    fq d;
    shallow_copy(a, c);
    shallow_copy(b, d);
    EXPECT_EQ(c - d, const_expected);
}

TEST(fq, CoarseEquivalenceChecks)
{
    fq a = fq::random_element();
    fq b = fq::random_element();

    fq c = (a * b) + a - b;

    fq d = a * b + a - b;

    EXPECT_EQ(c, d);
}

TEST(fq, toMontgomeryForm)
{
    fq result = fq{ 0x01, 0x00, 0x00, 0x00 }.to_montgomery_form();
    fq expected = fq::one();
    EXPECT_EQ(result, expected);
}

TEST(fq, FromMontgomeryForm)
{
    constexpr fq t0 = fq::one();
    constexpr fq result = t0.from_montgomery_form();
    constexpr fq expected{ 0x01, 0x00, 0x00, 0x00 };
    EXPECT_EQ(result, expected);
}

TEST(fq, MontgomeryConsistencyCheck)
{
    fq a = fq::random_element();
    fq b = fq::random_element();
    fq aR;
    fq bR;
    fq aRR;
    fq bRR;
    fq bRRR;
    fq result_a;
    fq result_b;
    fq result_c;
    fq result_d;
    aR = a.to_montgomery_form();
    aRR = aR.to_montgomery_form();
    bR = b.to_montgomery_form();
    bRR = bR.to_montgomery_form();
    bRRR = bRR.to_montgomery_form();
    result_a = aRR * bRR; // abRRR
    result_b = aR * bRRR; // abRRR
    result_c = aR * bR;   // abR
    result_d = a * b;     // abR^-1
    EXPECT_EQ((result_a == result_b), true);
    result_a.self_from_montgomery_form(); // abRR
    result_a.self_from_montgomery_form(); // abR
    result_a.self_from_montgomery_form(); // ab
    result_c.self_from_montgomery_form(); // ab
    result_d.self_to_montgomery_form();   // ab
    EXPECT_EQ((result_a == result_c), true);
    EXPECT_EQ((result_a == result_d), true);
}

TEST(fq, AddMulConsistency)
{
    fq multiplicand = { 0x09, 0, 0, 0 };
    multiplicand.self_to_montgomery_form();

    fq a = fq::random_element();
    fq result;
    result = a + a;   // 2
    result += result; // 4
    result += result; // 8
    result += a;      // 9

    fq expected;
    expected = a * multiplicand;

    EXPECT_EQ((result == expected), true);
}

TEST(fq, SubMulConsistency)
{
    fq multiplicand = { 0x05, 0, 0, 0 };
    multiplicand.self_to_montgomery_form();

    fq a = fq::random_element();
    fq result;
    result = a + a;   // 2
    result += result; // 4
    result += result; // 8
    result -= a;      // 7
    result -= a;      // 6
    result -= a;      // 5

    fq expected;
    expected = a * multiplicand;

    EXPECT_EQ((result == expected), true);
}

TEST(fq, beta)
{
    fq x = fq::random_element();

    fq beta_x = { x.data[0], x.data[1], x.data[2], x.data[3] };
    fq beta = fq::cube_root_of_unity();
    beta_x = beta_x * beta;

    // compute x^3
    fq x_cubed;
    x_cubed = x * x;
    x_cubed *= x;

    // compute beta_x^3
    fq beta_x_cubed;
    beta_x_cubed = beta_x * beta_x;
    beta_x_cubed *= beta_x;

    EXPECT_EQ((x_cubed == beta_x_cubed), true);
}

TEST(fq, Invert)
{
    fq input = fq::random_element();
    fq inverse = input.invert();
    fq result = input * inverse;
    result = result.reduce_once();
    result = result.reduce_once();
    EXPECT_EQ(result, fq::one());
}

TEST(fq, InvertOneIsOne)
{
    fq result = fq::one();
    result = result.invert();
    EXPECT_EQ((result == fq::one()), true);
}

TEST(fq, Sqrt)
{
    fq input = fq::one();
    auto [is_sqr, root] = input.sqrt();
    fq result = root.sqr();
    EXPECT_EQ(result, input);
}

TEST(fq, SqrtRandom)
{
    for (size_t i = 0; i < 1; ++i) {
        fq input = fq::random_element().sqr();
        auto [is_sqr, root] = input.sqrt();
        fq root_test = root.sqr();
        EXPECT_EQ(root_test, input);
    }
}

TEST(fq, OneAndZero)
{
    fq result;
    result = fq::one() - fq::one();
    EXPECT_EQ((result == fq::zero()), true);
}

TEST(fq, Copy)
{
    fq result = fq::random_element();
    fq expected;
    fq::__copy(result, expected);
    EXPECT_EQ((result == expected), true);
}

TEST(fq, Neg)
{
    fq a = fq::random_element();
    fq b;
    b = -a;
    fq result;
    result = a + b;
    EXPECT_EQ((result == fq::zero()), true);
}

TEST(fq, SplitIntoEndomorphismScalars)
{
    fq k = fq::random_element();
    fq k1 = 0;
    fq k2 = 0;

    fq::split_into_endomorphism_scalars(k, k1, k2);

    // std::cout << "endo scalars = " << k1 << k2 << std::endl;
    fq result = 0;

    k1.self_to_montgomery_form();
    k2.self_to_montgomery_form();

    result = k2 * fq::cube_root_of_unity();
    result = k1 - result;

    result.self_from_montgomery_form();
    EXPECT_EQ(result, k);
}

TEST(fq, SplitIntoEndomorphismScalarsSimple)
{

    fq input = { 1, 0, 0, 0 };
    fq k = { 0, 0, 0, 0 };
    fq k1 = { 0, 0, 0, 0 };
    fq k2 = { 0, 0, 0, 0 };
    fq::__copy(input, k);

    fq::split_into_endomorphism_scalars(k, k1, k2);

    fq result{ 0, 0, 0, 0 };
    k1.self_to_montgomery_form();
    k2.self_to_montgomery_form();

    fq beta = fq::cube_root_of_unity();
    result = k2 * beta;
    result = k1 - result;

    result.self_from_montgomery_form();
    for (size_t i = 0; i < 4; ++i) {
        EXPECT_EQ(result.data[i], k.data[i]);
    }
}

TEST(fq, SerializeToBuffer)
{
    std::array<uint8_t, 32> buffer;
    fq a = { 0x1234567876543210, 0x2345678987654321, 0x3456789a98765432, 0x006789abcba98765 };
    a = a.to_montgomery_form();

    fq::serialize_to_buffer(a, &buffer[0]);

    EXPECT_EQ(buffer[31], 0x10);
    EXPECT_EQ(buffer[30], 0x32);
    EXPECT_EQ(buffer[29], 0x54);
    EXPECT_EQ(buffer[28], 0x76);
    EXPECT_EQ(buffer[27], 0x78);
    EXPECT_EQ(buffer[26], 0x56);
    EXPECT_EQ(buffer[25], 0x34);
    EXPECT_EQ(buffer[24], 0x12);

    EXPECT_EQ(buffer[23], 0x21);
    EXPECT_EQ(buffer[22], 0x43);
    EXPECT_EQ(buffer[21], 0x65);
    EXPECT_EQ(buffer[20], 0x87);
    EXPECT_EQ(buffer[19], 0x89);
    EXPECT_EQ(buffer[18], 0x67);
    EXPECT_EQ(buffer[17], 0x45);
    EXPECT_EQ(buffer[16], 0x23);

    EXPECT_EQ(buffer[15], 0x32);
    EXPECT_EQ(buffer[14], 0x54);
    EXPECT_EQ(buffer[13], 0x76);
    EXPECT_EQ(buffer[12], 0x98);
    EXPECT_EQ(buffer[11], 0x9a);
    EXPECT_EQ(buffer[10], 0x78);
    EXPECT_EQ(buffer[9], 0x56);
    EXPECT_EQ(buffer[8], 0x34);

    EXPECT_EQ(buffer[7], 0x65);
    EXPECT_EQ(buffer[6], 0x87);
    EXPECT_EQ(buffer[5], 0xa9);
    EXPECT_EQ(buffer[4], 0xcb);
    EXPECT_EQ(buffer[3], 0xab);
    EXPECT_EQ(buffer[2], 0x89);
    EXPECT_EQ(buffer[1], 0x67);
    EXPECT_EQ(buffer[0], 0x00);
}

TEST(fq, SerializeFromBuffer)
{
    std::array<uint8_t, 32> buffer;
    fq expected = { 0x1234567876543210, 0x2345678987654321, 0x3456789a98765432, 0x006789abcba98765 };

    fq::serialize_to_buffer(expected, &buffer[0]);

    fq result = fq::serialize_from_buffer(&buffer[0]);

    EXPECT_EQ((result == expected), true);
}

TEST(fq, MultiplicativeGenerator)
{
    EXPECT_EQ(fq::multiplicative_generator(), fq(3));
}

TEST(fq, RInv)
{
    uint256_t prime_256{
        Bn254FqParams::modulus_0, Bn254FqParams::modulus_1, Bn254FqParams::modulus_2, Bn254FqParams::modulus_3
    };
    uint512_t r{ 0, 1 };
    // -(1/q) mod r
    uint512_t q{ -prime_256, 0 };
    uint256_t q_inv = q.invmod(r).lo;
    uint64_t expected = (q_inv).data[0];
    uint64_t result = Bn254FqParams::r_inv;
    EXPECT_EQ(result, expected);
}

// TEST to check we don't have 0^0=0
TEST(fq, PowRegressionCheck)
{
    fq zero = fq::zero();
    fq one = fq::one();
    EXPECT_EQ(zero.pow(uint256_t(0)), one);
}
//   438268ca91d42ad f1e7025a7b654e1f f8d9d72e0438b995 8c422ec208ac8a6e

TEST(fq, SqrRegression)
{
    std::array<uint256_t, 7> values = {
        uint256_t(0xbdf876654b0ade1b, 0x2c3a66c64569f338, 0x2cd8bf2ec1fe55a3, 0x11c0ea9ee5693ede),
        uint256_t(0x551b14ec34f2151c, 0x62e472ed83a2891e, 0xf208d5e5c9b5b3fb, 0x14315aeaf6027d8c),
        uint256_t(0xad39959ae8013750, 0x7f1d2c709ab84cbb, 0x408028b80a60c2f1, 0x1dcd116fc26f856e),
        uint256_t(0x95e967d30dcce9ce, 0x56139274241d2ea1, 0x85b19c1c616ec456, 0x1f1780cf9bf045b4),
        uint256_t(0xbe841c861d8eb80e, 0xc5980d67a21386c0, 0x5fd1f1afecddeeb5, 0x24dbb8c1baea0250),
        uint256_t(0x3ae4b3a27f05d6e3, 0xc5f6785b12df8d29, 0xc3a6c5f095103046, 0xd6b94cb2cc1fd4b),
        uint256_t(0xc003c71932a6ced5, 0x6302a413f68e26e9, 0x2ed4a9b64d69fad, 0xfe61ffab1ae227d)
    };
    for (auto& value : values) {
        fq element(value);
        EXPECT_EQ(element.sqr(), element * element);
    }
}

TEST(fq, NegAndSelfNeg0CmpRegression)
{
    fq a = 0;
    fq a_neg = -a;
    EXPECT_EQ((a == a_neg), true);
    a = 0;
    a_neg = 0;
    a_neg.self_neg();
    EXPECT_EQ((a == a_neg), true);
}

// This test shows that ((lo|hi)% modulus) in uint512_t is equivalent to (lo + 2^256 * hi) in field elements so we
// don't have to use the slow API (uint512_t' modulo operation)
TEST(fq, EquivalentRandomness)
{
    auto& engine = numeric::get_debug_randomness();
    uint512_t random_uint512 = engine.get_random_uint512();
    auto random_lo = fq(random_uint512.lo);
    auto random_hi = fq(random_uint512.hi);
    uint512_t q(fq::modulus);
    constexpr auto pow_2_256 = fq(uint256_t(1) << 128).sqr();
    EXPECT_EQ(random_lo + pow_2_256 * random_hi, fq((random_uint512 % q).lo));
}
