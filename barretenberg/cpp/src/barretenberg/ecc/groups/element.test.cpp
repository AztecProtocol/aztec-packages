#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
template <typename G_> class TestElement : public testing::Test {
  public:
    using G = G_;
    using element = typename G::element;
    using affine_element = typename G::affine_element;
    using Fr = typename G::Fr;
    using Fq = typename G::Fq;

    static void test_random_element()
    {
        element result = element::random_element();
        EXPECT_EQ(result.on_curve(), true);
    }

    static void test_random_affine_element()
    {
        affine_element result = element::random_element();
        EXPECT_EQ(result.on_curve(), true);
    }

    static void test_on_curve()
    {
        for (size_t i = 0; i < 100; ++i) {
            element test = element::random_element();
            EXPECT_EQ(test.on_curve(), true);
            affine_element affine_test = element::random_element();
            EXPECT_EQ(affine_test.on_curve(), true);
        }
    }

    static void test_eq()
    {
        element a = element::random_element();
        element b = a.normalize();

        EXPECT_EQ(a == b, true);
        EXPECT_EQ(a == a, true);

        b.self_set_infinity();

        EXPECT_EQ(a == b, false);
        element c = element::random_element();

        EXPECT_EQ(a == c, false);

        a.self_set_infinity();

        EXPECT_EQ(a == b, true);
    }

    static void test_check_group_modulus()
    {
        Fr exponent = -Fr(1);
        element result = G::one * exponent;
        result += G::one;
        result += G::one;
        EXPECT_EQ(result.on_curve(), true);
        EXPECT_EQ(result == G::one, true);
    }

    static void test_add_exception_test_infinity()
    {
        element lhs = element::random_element();
        element rhs;
        element result;

        rhs = -lhs;

        result = lhs + rhs;

        EXPECT_EQ(result.is_point_at_infinity(), true);

        element rhs_b;
        rhs_b = rhs;
        rhs_b.self_set_infinity();

        result = lhs + rhs_b;

        EXPECT_EQ(lhs == result, true);

        lhs.self_set_infinity();
        result = lhs + rhs;

        EXPECT_EQ(rhs == result, true);
    }

    static void test_add_exception_test_dbl()
    {
        element lhs = element::random_element();
        element rhs;
        rhs = lhs;

        element result;
        element expected;

        result = lhs + rhs;
        expected = lhs.dbl();

        EXPECT_EQ(result == expected, true);
    }

    static void test_add_dbl_consistency()
    {
        element a = element::random_element();
        element b = element::random_element();

        element c;
        element d;
        element add_result;
        element dbl_result;

        c = a + b;
        b = -b;
        d = a + b;

        add_result = c + d;
        dbl_result = a.dbl();

        EXPECT_EQ(add_result == dbl_result, true);
    }

    static void test_add_dbl_consistency_repeated()
    {
        element a = element::random_element();
        element b;
        element c;
        element d;
        element e;

        element result;
        element expected;

        b = a.dbl(); // b = 2a
        c = b.dbl(); // c = 4a

        d = a + b;      // d = 3a
        e = a + c;      // e = 5a
        result = d + e; // result = 8a

        expected = c.dbl(); // expected = 8a

        EXPECT_EQ(result == expected, true);
    }

    static void test_mixed_add_exception_test_infinity()
    {
        element lhs = G::one;
        affine_element rhs = element::random_element();
        lhs.x = rhs.x;
        lhs.y = -rhs.y;

        element result;
        result = lhs + rhs;

        EXPECT_EQ(result.is_point_at_infinity(), true);

        lhs.self_set_infinity();
        result = lhs + rhs;
        element rhs_c;
        rhs_c = element(rhs);

        EXPECT_EQ(rhs_c == result, true);
    }

    static void test_mixed_add_exception_test_dbl()
    {
        affine_element rhs = element::random_element();
        element lhs;
        lhs = element(rhs);

        element result;
        element expected;
        result = lhs + rhs;

        expected = lhs.dbl();

        EXPECT_EQ(result == expected, true);
    }

    static void test_add_mixed_add_consistency_check()
    {
        affine_element rhs = element::random_element();
        element lhs = element::random_element();
        element rhs_b;
        rhs_b = element(rhs);

        element add_result;
        element mixed_add_result;
        add_result = lhs + rhs_b;
        mixed_add_result = lhs + rhs;

        EXPECT_EQ(add_result == mixed_add_result, true);
    }

    static void test_batch_normalize()
    {
        size_t num_points = 2;
        std::vector<element> points(num_points);
        std::vector<element> normalized(num_points);
        for (size_t i = 0; i < num_points; ++i) {
            element a = element::random_element();
            element b = element::random_element();
            points[i] = a + b;
            normalized[i] = points[i];
        }
        element::batch_normalize(&normalized[0], num_points);

        for (size_t i = 0; i < num_points; ++i) {
            Fq zz;
            Fq zzz;
            Fq result_x;
            Fq result_y;
            zz = points[i].z.sqr();
            zzz = points[i].z * zz;
            result_x = normalized[i].x * zz;
            result_y = normalized[i].y * zzz;

            EXPECT_EQ((result_x == points[i].x), true);
            EXPECT_EQ((result_y == points[i].y), true);
        }
    }

    // batch_normalize must preserve infinity points and correctly normalize non-infinity ones.
    static void test_batch_normalize_with_infinity()
    {
        constexpr size_t num_points = 6;
        std::vector<element> points(num_points);
        for (size_t i = 0; i < num_points; ++i) {
            if (i % 3 == 0) {
                points[i] = element::infinity();
            } else {
                element a = element::random_element();
                element b = element::random_element();
                points[i] = a + b;
            }
        }
        std::vector<element> normalized = points;
        element::batch_normalize(&normalized[0], num_points);

        for (size_t i = 0; i < num_points; ++i) {
            if (i % 3 == 0) {
                EXPECT_TRUE(normalized[i].is_point_at_infinity());
            } else {
                Fq zz = points[i].z.sqr();
                Fq zzz = points[i].z * zz;
                EXPECT_EQ(normalized[i].x * zz, points[i].x);
                EXPECT_EQ(normalized[i].y * zzz, points[i].y);
            }
        }
    }

    static void test_group_exponentiation_zero_and_one()
    {
        affine_element result = G::one * Fr::zero();

        EXPECT_EQ(result.is_point_at_infinity(), true);

        result = G::one * Fr::one();

        EXPECT_EQ(result == G::affine_one, true);
    }

    static void test_group_exponentiation_consistency_check()
    {
        Fr a = Fr::random_element();
        Fr b = Fr::random_element();

        Fr c;
        c = a * b;

        affine_element input = G::affine_one;
        affine_element result = input * a;
        result = result * b;

        affine_element expected = input * c;

        EXPECT_EQ(result == expected, true);
    }

    static void test_infinity()
    {
        affine_element inf_affine = affine_element::infinity();
        EXPECT_EQ(inf_affine.is_point_at_infinity(), true);

        element inf_element = element::infinity();
        EXPECT_EQ(inf_element.is_point_at_infinity(), true);
    }

    static void test_infinity_canonical_form()
    {
        // affine_element: infinity() (value-init then self_set_infinity) and set_infinity() applied
        // to a random point (copy of a non-trivial state then self_set_infinity) must match.
        const affine_element inf_from_factory = affine_element::infinity();
        const affine_element inf_from_random = affine_element(element::random_element()).set_infinity();

        EXPECT_TRUE(inf_from_factory.is_point_at_infinity());
        EXPECT_TRUE(inf_from_random.is_point_at_infinity());

        EXPECT_EQ(inf_from_factory.y, Fq::zero());
        EXPECT_EQ(inf_from_random.y, Fq::zero());
        EXPECT_EQ(inf_from_factory.x, inf_from_random.x);
        EXPECT_EQ(inf_from_factory.y, inf_from_random.y);

        // element: infinity() (value-init), zero() (default-init, indeterminate y/z storage), and
        // set_infinity() applied to a random point must all match.
        const element inf_elem_factory = element::infinity();
        const element inf_elem_zero = element::zero();
        const element inf_elem_set = element::random_element().set_infinity();

        EXPECT_TRUE(inf_elem_factory.is_point_at_infinity());
        EXPECT_TRUE(inf_elem_zero.is_point_at_infinity());
        EXPECT_TRUE(inf_elem_set.is_point_at_infinity());

        for (const element& e : { inf_elem_factory, inf_elem_zero, inf_elem_set }) {
            EXPECT_EQ(e.y, Fq::zero());
            EXPECT_EQ(e.z, Fq::zero());
            EXPECT_EQ(e.x, inf_elem_factory.x);
        }
    }

    static void test_straus_msm_matches_naive_sum()
    {
        for (size_t n = 1; n <= 16; ++n) {
            std::vector<affine_element> points(n);
            std::vector<Fr> scalars(n);
            for (size_t i = 0; i < n; ++i) {
                points[i] = affine_element(element::random_element());
                scalars[i] = Fr::random_element();
            }
            element naive = element::infinity();
            for (size_t i = 0; i < n; ++i) {
                naive += points[i] * scalars[i];
            }
            element strauss = element::straus_msm(points, scalars);
            EXPECT_EQ(strauss == naive, true) << "straus_msm mismatch at n=" << n;
        }
    }

    static void test_straus_msm_truncates_to_shorter_input()
    {
        std::vector<affine_element> points = { affine_element(element::random_element()),
                                               affine_element(element::random_element()),
                                               affine_element(element::random_element()) };
        std::vector<Fr> scalars = { Fr::random_element(), Fr::random_element() };

        element expected = (points[0] * scalars[0]) + (points[1] * scalars[1]);
        EXPECT_EQ(element::straus_msm(points, scalars) == expected, true);

        std::vector<Fr> extra_scalars = { scalars[0], scalars[1], Fr::random_element() };
        std::vector<affine_element> fewer_points = { points[0], points[1] };
        EXPECT_EQ(element::straus_msm(fewer_points, extra_scalars) == expected, true);
    }

    static void test_straus_msm_edge_cases()
    {
        // Empty input → infinity
        EXPECT_EQ(element::straus_msm({}, {}).is_point_at_infinity(), true);

        // All-zero scalars → infinity
        std::vector<affine_element> points = { affine_element(element::random_element()),
                                               affine_element(element::random_element()) };
        std::vector<Fr> zeros = { Fr::zero(), Fr::zero() };
        EXPECT_EQ(element::straus_msm(points, zeros).is_point_at_infinity(), true);

        // Mixed: some zero scalars, some infinity points → matches non-zero/non-infinity sum
        const Fr s0 = Fr::random_element();
        const Fr s2 = Fr::random_element();
        std::vector<affine_element> mixed_points = {
            affine_element(element::random_element()),
            affine_element::infinity(),
            affine_element(element::random_element()),
        };
        std::vector<Fr> mixed_scalars = { s0, Fr::random_element(), s2 };
        element expected = mixed_points[0] * s0 + mixed_points[2] * s2;
        EXPECT_EQ(element::straus_msm(mixed_points, mixed_scalars) == expected, true);
    }

    static void test_derive_generators()
    {
        constexpr size_t num_generators = 128;
        auto result = G::derive_generators("test generators", num_generators);

        const auto is_unique = [&result](const affine_element& y, const size_t j) {
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
};

using TestTypes = testing::Types<bb::g1, bb::g2, grumpkin::g1, secp256k1::g1, secp256r1::g1>;
} // namespace

TYPED_TEST_SUITE(TestElement, TestTypes);

TYPED_TEST(TestElement, RandomElement)
{
    TestFixture::test_random_element();
}

TYPED_TEST(TestElement, RandomAffineElement)
{
    TestFixture::test_random_affine_element();
}

TYPED_TEST(TestElement, OnCurve)
{
    TestFixture::test_on_curve();
}

TYPED_TEST(TestElement, Eq)
{
    TestFixture::test_eq();
}

TYPED_TEST(TestElement, CheckGroupModulus)
{
    TestFixture::test_check_group_modulus();
}

TYPED_TEST(TestElement, AddExceptionTestInfinity)
{
    TestFixture::test_add_exception_test_infinity();
}

TYPED_TEST(TestElement, AddExceptionTestDbl)
{
    TestFixture::test_add_exception_test_dbl();
}

TYPED_TEST(TestElement, AddDblConsistency)
{
    TestFixture::test_add_dbl_consistency();
}

TYPED_TEST(TestElement, AddDblConsistencyRepeated)
{
    TestFixture::test_add_dbl_consistency_repeated();
}

TYPED_TEST(TestElement, MixedAddExceptionTestInfinity)
{
    TestFixture::test_mixed_add_exception_test_infinity();
}

TYPED_TEST(TestElement, MixedAddExceptionTestDbl)
{
    TestFixture::test_mixed_add_exception_test_dbl();
}

TYPED_TEST(TestElement, AddMixedAddConsistencyCheck)
{
    TestFixture::test_add_mixed_add_consistency_check();
}

TYPED_TEST(TestElement, BatchNormalize)
{
    TestFixture::test_batch_normalize();
}

TYPED_TEST(TestElement, BatchNormalizeWithInfinity)
{
    TestFixture::test_batch_normalize_with_infinity();
}

TYPED_TEST(TestElement, GroupExponentiationZeroAndOne)
{
    TestFixture::test_group_exponentiation_zero_and_one();
}

TYPED_TEST(TestElement, GroupExponentiationConsistencyCheck)
{
    TestFixture::test_group_exponentiation_consistency_check();
}

TYPED_TEST(TestElement, Infinity)
{
    TestFixture::test_infinity();
}

TYPED_TEST(TestElement, InfinityCanonicalForm)
{
    TestFixture::test_infinity_canonical_form();
}

TYPED_TEST(TestElement, DeriveGenerators)
{
    if constexpr (!std::is_same_v<typename TestFixture::G, bb::g2>) {
        TestFixture::test_derive_generators();
    }
}

TYPED_TEST(TestElement, StrausMsmMatchesNaiveSum)
{
    if constexpr (!std::is_same_v<typename TestFixture::G, bb::g2>) {
        TestFixture::test_straus_msm_matches_naive_sum();
    }
}

TYPED_TEST(TestElement, StrausMsmTruncatesToShorterInput)
{
    if constexpr (!std::is_same_v<typename TestFixture::G, bb::g2>) {
        TestFixture::test_straus_msm_truncates_to_shorter_input();
    }
}

TYPED_TEST(TestElement, StrausMsmEdgeCases)
{
    if constexpr (!std::is_same_v<typename TestFixture::G, bb::g2>) {
        TestFixture::test_straus_msm_edge_cases();
    }
}
