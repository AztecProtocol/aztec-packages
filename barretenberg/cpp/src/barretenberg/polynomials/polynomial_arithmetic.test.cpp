#include "polynomial_arithmetic.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/polynomials/backing_memory.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "polynomial.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <gtest/gtest.h>
#include <limits>
#include <span>
#include <utility>
#include <vector>

using namespace bb;

/**
 * @brief Ensure evaluate() gives consistent result for polynomials of different size but same non-zero coefficients.
 */
TEST(polynomials, evaluate)
{
    auto poly1 = Polynomial<fr>(15); // non power of 2
    auto poly2 = Polynomial<fr>(64);
    for (size_t i = 0; i < poly1.size(); ++i) {
        poly1.at(i) = fr::random_element();
        poly2.at(i) = poly1[i];
    }

    auto challenge = fr::random_element();
    auto eval1 = poly1.evaluate(challenge);
    auto eval2 = poly2.evaluate(challenge);

    EXPECT_EQ(eval1, eval2);
}

TEST(polynomials, ifft_consistency)
{
    constexpr size_t n = 16;
    auto domain = evaluation_domain(n);
    domain.compute_lookup_table();

    std::array<fr, n> coeffs;
    std::array<fr, n> values;
    std::array<fr, n> values_copy;
    std::array<fr, n> recovered;

    for (size_t k = 0; k < n; ++k) {
        coeffs[k] = fr::random_element();
        values[k] = fr::zero();
        recovered[k] = fr::zero();
    }

    // compute values[j] = sum_k coeffs[k] * ω^{j*k}
    for (size_t j = 0; j < n; ++j) {
        fr acc = fr::zero();
        for (size_t k = 0; k < n; ++k) {
            fr w = domain.root.pow(static_cast<uint64_t>(j * k));
            acc += coeffs[k] * w;
        }
        values[j] = acc;
        values_copy[j] = values[j];
    }

    // compute ifft of values, which should recover coeffs
    polynomial_arithmetic::ifft(values.data(), recovered.data(), domain);

    for (size_t k = 0; k < n; ++k) {
        EXPECT_EQ(recovered[k], coeffs[k]);   // check that ifft recovers coeffs
        EXPECT_EQ(values[k], values_copy[k]); // check that ifft does not modify input values
    }
}

template <typename FF> class PolynomialTests : public ::testing::Test {};

using FieldTypes = ::testing::Types<bb::fr, grumpkin::fr>;

TYPED_TEST_SUITE(PolynomialTests, FieldTypes);

TYPED_TEST(PolynomialTests, linear_poly_product)
{
    using FF = TypeParam;
    // Cover both BN254 and Grumpkin for the production SUBGROUP_SIZE range (87 Grumpkin, 256 BN254).
    constexpr size_t n = 256;
    std::array<FF, n> roots;

    FF z = FF::random_element();
    FF expected = 1;
    for (size_t i = 0; i < n; ++i) {
        roots[i] = FF::random_element();
        expected *= (z - roots[i]);
    }

    std::array<FF, n + 1> dest{};
    polynomial_arithmetic::compute_linear_polynomial_product(roots.data(), dest.data(), n);
    FF result = polynomial_arithmetic::evaluate(dest.data(), z, n + 1);

    EXPECT_EQ(result, expected);
}

// compute_linear_polynomial_product handles the n=1 and n=2 boundaries of the incremental update.
TYPED_TEST(PolynomialTests, LinearPolyProductSmallN)
{
    using FF = TypeParam;
    // n=1: dest should represent (X - roots[0]) = [-r0, 1].
    {
        std::array<FF, 1> roots = { FF(7) };
        std::array<FF, 2> dest{};
        polynomial_arithmetic::compute_linear_polynomial_product(roots.data(), dest.data(), 1);
        EXPECT_EQ(dest[0], -FF(7));
        EXPECT_EQ(dest[1], FF(1));
    }
    // n=2: (X - 1)(X - 2) = X^2 - 3X + 2 → [2, -3, 1].
    {
        std::array<FF, 2> roots = { FF(1), FF(2) };
        std::array<FF, 3> dest{};
        polynomial_arithmetic::compute_linear_polynomial_product(roots.data(), dest.data(), 2);
        EXPECT_EQ(dest[0], FF(2));
        EXPECT_EQ(dest[1], -FF(3));
        EXPECT_EQ(dest[2], FF(1));
    }
}

TYPED_TEST(PolynomialTests, evaluation_domain)
{
    using FF = TypeParam;
    constexpr size_t n = 256;
    auto domain = EvaluationDomain<FF>(n);

    EXPECT_EQ(domain.size, 256UL);
    EXPECT_EQ(domain.log2_size, 8UL);
}

// EvaluationDomain::operator=(EvaluationDomain&&) is a no-op under self-assignment and preserves
// the precomputed round-roots tables.
TYPED_TEST(PolynomialTests, EvaluationDomainMoveSelfAssign)
{
    using FF = TypeParam;
    auto domain = EvaluationDomain<FF>(256);
    domain.compute_lookup_table();
    const size_t round_roots_before = domain.get_round_roots().size();
    EXPECT_GT(round_roots_before, 0UL);

    domain = std::move(domain);

    EXPECT_EQ(domain.size, 256UL);
    EXPECT_EQ(domain.get_round_roots().size(), round_roots_before);
}

// EvaluationDomain::operator=(EvaluationDomain&&) leaves the moved-from object in the empty
// default-constructed state (size == 0, round-root tables empty), restoring the invariant
// `size > 0 implies roots tables populated`. Without this, a moved-from domain would report
// size > 0 with empty round-roots, which is the partial-validity pattern flagged by audit.
TYPED_TEST(PolynomialTests, EvaluationDomainMoveAssignClearsSource)
{
    using FF = TypeParam;
    constexpr size_t n = 256;
    auto src = EvaluationDomain<FF>(n);
    src.compute_lookup_table();
    EXPECT_GT(src.get_round_roots().size(), 0UL);

    EvaluationDomain<FF> dst;
    dst = std::move(src);

    EXPECT_EQ(dst.size, n);
    EXPECT_GT(dst.get_round_roots().size(), 0UL);

    EXPECT_EQ(src.size, 0UL);
    EXPECT_EQ(src.num_threads, 0UL);
    EXPECT_EQ(src.thread_size, 0UL);
    EXPECT_EQ(src.log2_size, 0UL);
    EXPECT_EQ(src.log2_thread_size, 0UL);
    EXPECT_EQ(src.log2_num_threads, 0UL);
    EXPECT_EQ(src.generator_size, 0UL);
    EXPECT_EQ(src.get_round_roots().size(), 0UL);
    EXPECT_EQ(src.get_inverse_round_roots().size(), 0UL);
}

TYPED_TEST(PolynomialTests, domain_roots)
{
    using FF = TypeParam;
    constexpr size_t n = 256;
    auto domain = EvaluationDomain<FF>(n);

    FF result;
    FF expected;
    expected = FF::one();
    result = domain.root.pow(static_cast<uint64_t>(n));

    EXPECT_EQ((result == expected), true);
}

TYPED_TEST(PolynomialTests, evaluation_domain_roots)
{
    using FF = TypeParam;
    constexpr size_t n = 16;
    EvaluationDomain<FF> domain(n);
    domain.compute_lookup_table();
    std::vector<FF*> root_table = domain.get_round_roots();
    std::vector<FF*> inverse_root_table = domain.get_inverse_round_roots();
    FF* roots = root_table[root_table.size() - 1];
    FF* inverse_roots = inverse_root_table[inverse_root_table.size() - 1];
    for (size_t i = 0; i < (n - 1) / 2; ++i) {
        EXPECT_EQ(roots[i] * domain.root, roots[i + 1]);
        EXPECT_EQ(inverse_roots[i] * domain.root_inverse, inverse_roots[i + 1]);
        EXPECT_EQ(roots[i] * inverse_roots[i], FF::one());
    }
}

TYPED_TEST(PolynomialTests, compute_efficient_interpolation)
{
    using FF = TypeParam;
    constexpr size_t n = 250;
    std::array<FF, n> src, poly, x;

    for (size_t i = 0; i < n; ++i) {
        poly[i] = FF::random_element();
    }

    for (size_t i = 0; i < n; ++i) {
        x[i] = FF::random_element();
        src[i] = polynomial_arithmetic::evaluate(poly.data(), x[i], n);
    }
    polynomial_arithmetic::compute_efficient_interpolation(src.data(), src.data(), x.data(), n);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ(src[i], poly[i]);
    }
}
// Test efficient Lagrange interpolation when interpolation points contain 0
TYPED_TEST(PolynomialTests, compute_efficient_interpolation_domain_with_zero)
{
    using FF = TypeParam;
    constexpr size_t n = 15;
    std::array<FF, n> src, poly, x;

    for (size_t i = 0; i < n; ++i) {
        poly[i] = FF(i + 1);
    }

    for (size_t i = 0; i < n; ++i) {
        x[i] = FF(i);
        src[i] = polynomial_arithmetic::evaluate(poly.data(), x[i], n);
    }
    polynomial_arithmetic::compute_efficient_interpolation(src.data(), src.data(), x.data(), n);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ(src[i], poly[i]);
    }
    // Test for the domain (-n/2, ..., 0, ... , n/2)

    for (size_t i = 0; i < n; ++i) {
        poly[i] = FF(i + 54);
    }

    for (size_t i = 0; i < n; ++i) {
        x[i] = FF(i - n / 2);
        src[i] = polynomial_arithmetic::evaluate(poly.data(), x[i], n);
    }
    polynomial_arithmetic::compute_efficient_interpolation(src.data(), src.data(), x.data(), n);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ(src[i], poly[i]);
    }

    // Test for the domain (-n+1, ..., 0)

    for (size_t i = 0; i < n; ++i) {
        poly[i] = FF(i * i + 57);
    }

    for (size_t i = 0; i < n; ++i) {
        x[i] = FF(i - (n - 1));
        src[i] = polynomial_arithmetic::evaluate(poly.data(), x[i], n);
    }
    polynomial_arithmetic::compute_efficient_interpolation(src.data(), src.data(), x.data(), n);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ(src[i], poly[i]);
    }
}

TYPED_TEST(PolynomialTests, interpolation_constructor_single)
{
    using FF = TypeParam;

    auto root = std::array{ FF(3) };
    auto eval = std::array{ FF(4) };
    Polynomial<FF> t(root, eval, 1);
    ASSERT_EQ(t.size(), 1);
    ASSERT_EQ(t[0], eval[0]);
}

TYPED_TEST(PolynomialTests, interpolation_constructor)
{
    using FF = TypeParam;

    constexpr size_t N = 32;
    std::array<FF, N> roots;
    std::array<FF, N> evaluations;
    for (size_t i = 0; i < N; ++i) {
        roots[i] = FF::random_element();
        evaluations[i] = FF::random_element();
    }

    auto roots_copy(roots);
    auto evaluations_copy(evaluations);

    Polynomial<FF> interpolated(roots, evaluations, N);

    ASSERT_EQ(interpolated.size(), N);
    ASSERT_EQ(roots, roots_copy);
    ASSERT_EQ(evaluations, evaluations_copy);

    for (size_t i = 0; i < N; ++i) {
        FF eval = interpolated.evaluate(roots[i]);
        ASSERT_EQ(eval, evaluations[i]);
    }
}

TYPED_TEST(PolynomialTests, evaluate_mle_legacy)
{
    using FF = TypeParam;

    auto test_case = [](size_t N) {
        auto& engine = numeric::get_debug_randomness();
        const size_t m = numeric::get_msb(N);
        EXPECT_EQ(N, 1 << m);
        Polynomial<FF> poly(N);
        for (size_t i = 1; i < N - 1; ++i) {
            poly.at(i) = FF::random_element(&engine);
        }
        poly.at(N - 1) = FF::zero();

        EXPECT_TRUE(poly[0].is_zero());

        // sample u = (u₀,…,uₘ₋₁)
        std::vector<FF> u(m);
        for (size_t l = 0; l < m; ++l) {
            u[l] = FF::random_element(&engine);
        }

        std::vector<FF> lagrange_evals(N, FF(1));
        for (size_t i = 0; i < N; ++i) {
            auto& coef = lagrange_evals[i];
            for (size_t l = 0; l < m; ++l) {
                size_t mask = (1 << l);
                if ((i & mask) == 0) {
                    coef *= (FF(1) - u[l]);
                } else {
                    coef *= u[l];
                }
            }
        }

        // check eval by computing scalar product between
        // lagrange evaluations and coefficients
        FF real_eval(0);
        for (size_t i = 0; i < N; ++i) {
            real_eval += poly[i] * lagrange_evals[i];
        }
        FF computed_eval = poly.evaluate_mle(u);
        EXPECT_EQ(real_eval, computed_eval);

        // also check shifted eval
        FF real_eval_shift(0);
        for (size_t i = 1; i < N; ++i) {
            real_eval_shift += poly[i] * lagrange_evals[i - 1];
        }
        FF computed_eval_shift = poly.evaluate_mle(u, true);
        EXPECT_EQ(real_eval_shift, computed_eval_shift);
    };
    test_case(32);
    test_case(4);
    test_case(2);
}

/**
 * @brief Test the function for partially evaluating MLE polynomials
 *
 */
TYPED_TEST(PolynomialTests, move_construct_and_assign)
{
    using FF = TypeParam;

    // construct a poly with some arbitrary data
    size_t num_coeffs = 64;
    Polynomial<FF> polynomial_a(num_coeffs);
    for (size_t i = 0; i < num_coeffs; i++) {
        polynomial_a.at(i) = FF::random_element();
    }

    // construct a new poly from the original via the move constructor
    Polynomial<FF> polynomial_b(std::move(polynomial_a));

    // The moved-from polynomial must report itself as empty in every accessor: size() == 0,
    // virtual_size() == 0, is_empty() == true, data() == nullptr. Failure modes here are the
    // inconsistent moved-from state flagged by audit (size > 0 with data == nullptr).
    EXPECT_EQ(polynomial_a.data(), nullptr);
    EXPECT_EQ(polynomial_a.size(), 0UL);
    EXPECT_EQ(polynomial_a.virtual_size(), 0UL);
    EXPECT_TRUE(polynomial_a.is_empty());

    // construct another poly; this will also use the move constructor!
    auto polynomial_c = std::move(polynomial_b);

    EXPECT_EQ(polynomial_b.data(), nullptr);
    EXPECT_EQ(polynomial_b.size(), 0UL);
    EXPECT_EQ(polynomial_b.virtual_size(), 0UL);
    EXPECT_TRUE(polynomial_b.is_empty());

    // define a poly with some arbitrary coefficients
    Polynomial<FF> polynomial_d(num_coeffs);
    for (size_t i = 0; i < num_coeffs; i++) {
        polynomial_d.at(i) = FF::random_element();
    }

    // reset its data using move assignment
    polynomial_d = std::move(polynomial_c);

    EXPECT_EQ(polynomial_c.data(), nullptr);
    EXPECT_EQ(polynomial_c.size(), 0UL);
    EXPECT_EQ(polynomial_c.virtual_size(), 0UL);
    EXPECT_TRUE(polynomial_c.is_empty());
}

TYPED_TEST(PolynomialTests, default_construct_then_assign)
{
    using FF = TypeParam;

    // construct an arbitrary but non-empty polynomial
    size_t num_coeffs = 64;
    Polynomial<FF> interesting_poly(num_coeffs);
    for (size_t i = 0; i < num_coeffs; i++) {
        interesting_poly.at(i) = FF::random_element();
    }

    // construct an empty poly via the default constructor
    Polynomial<FF> poly;

    EXPECT_EQ(poly.is_empty(), true);

    // fill the empty poly using the assignment operator
    poly = interesting_poly;

    // coefficients and size should be equal in value
    for (size_t i = 0; i < num_coeffs; ++i) {
        EXPECT_EQ(poly[i], interesting_poly[i]);
    }
    EXPECT_EQ(poly.size(), interesting_poly.size());
}

// factor_roots produces the correct quotient when (X - r) divides p(X) cleanly.
TEST(polynomials, FactorRootsExactDivisionRegression)
{
    using FF = fr;
    // p(X) = X^2 - 1 = (X - 1)(X + 1): exact division by (X - 1) produces q(X) = X + 1.
    std::array<FF, 3> exact_poly = { -FF(1), FF(0), FF(1) };
    polynomial_arithmetic::factor_roots(std::span<FF>(exact_poly), FF(1));
    EXPECT_EQ(exact_poly[0], FF(1));
    EXPECT_EQ(exact_poly[1], FF(1));
    EXPECT_EQ(exact_poly[2], FF(0));
}

// factor_roots asserts when the exact-divisibility precondition is violated.
TEST(polynomials, FactorRootsNonExactDivisionAsserts)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = fr;
    std::array<FF, 3> bad_poly = { FF(1), FF(0), FF(1) }; // p(X) = X^2 + 1, p(1) = 2 != 0
    ASSERT_THROW_OR_ABORT(polynomial_arithmetic::factor_roots(std::span<FF>(bad_poly), FF(1)), ".*");
}

// Polynomial's interpolation constructor asserts when interpolation_points and evaluations differ in size.
TEST(polynomials, InterpolationCtorMismatchedSpansAsserts)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = fr;
    std::vector<FF> points = { FF(1), FF(2), FF(3), FF(4) };
    std::vector<FF> evals = { FF(10), FF(20) }; // shorter than points
    ASSERT_THROW_OR_ABORT(
        bb::Polynomial<FF>(std::span<const FF>(points), std::span<const FF>(evals), /*virtual_size=*/4), ".*");
}

// parse_size_string throws when value * multiplier overflows size_t.
TEST(polynomials, ParseSizeStringOverflowAsserts)
{
    // Sanity: well-formed inputs still parse correctly.
    EXPECT_EQ(parse_size_string("1k"), 1024U);
    EXPECT_EQ(parse_size_string("2g"), 2UL * 1024 * 1024 * 1024);

    // 2^54 * 1024 == 2^64 wraps to 0 without a guard.
    ASSERT_THROW_OR_ABORT(parse_size_string("18014398509481984k"), ".*");
}

// compute_efficient_interpolation asserts (always-on, not _DEBUG) when evaluation points are not all distinct,
// because batch_invert silently skips zero entries and would otherwise produce wrong output.
TEST(polynomials, ComputeEfficientInterpolationDuplicatePointsAsserts)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = fr;
    constexpr size_t n = 3;
    std::array<FF, n> src = { FF(10), FF(20), FF(30) };
    std::array<FF, n> dest{};
    std::array<FF, n> points = { FF(1), FF(2), FF(2) }; // duplicate
    ASSERT_THROW_OR_ABORT(
        polynomial_arithmetic::compute_efficient_interpolation<FF>(src.data(), dest.data(), points.data(), n), ".*");
}

// fft_inner_parallel asserts when called in-place (coeffs == target).
TEST(polynomials, FftInnerParallelInPlaceAsserts)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = fr;
    constexpr size_t n = 16;
    auto domain = bb::EvaluationDomain<FF>(n);
    domain.compute_lookup_table();

    std::array<FF, n> coeffs{};
    for (size_t i = 0; i < n; ++i) {
        coeffs[i] = FF(i + 1);
    }
    ASSERT_THROW_OR_ABORT(
        polynomial_arithmetic::fft_inner_parallel(coeffs.data(), coeffs.data(), domain, FF(), domain.get_round_roots()),
        ".*");
}
