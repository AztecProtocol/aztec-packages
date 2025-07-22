#include "polynomial_arithmetic.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "polynomial.hpp"
#include <algorithm>
#include <cstddef>
#include <gtest/gtest.h>
#include <utility>

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

TEST(polynomials, fft_with_small_degree)
{
    constexpr size_t n = 16;
    fr fft_transform[n];
    fr poly[n];

    for (size_t i = 0; i < n; ++i) {
        poly[i] = fr::random_element();
        fr::__copy(poly[i], fft_transform[i]);
    }

    auto domain = evaluation_domain(n);
    domain.compute_lookup_table();
    polynomial_arithmetic::fft(fft_transform, domain);

    fr work_root;
    work_root = fr::one();
    fr expected;
    for (size_t i = 0; i < n; ++i) {
        expected = polynomial_arithmetic::evaluate(poly, work_root, n);
        EXPECT_EQ((fft_transform[i] == expected), true);
        work_root *= domain.root;
    }
}

TEST(polynomials, split_polynomial_fft)
{
    constexpr size_t n = 256;
    fr fft_transform[n];
    fr poly[n];

    for (size_t i = 0; i < n; ++i) {
        poly[i] = fr::random_element();
        fr::__copy(poly[i], fft_transform[i]);
    }

    constexpr size_t num_poly = 4;
    constexpr size_t n_poly = n / num_poly;
    fr fft_transform_[num_poly][n_poly];
    for (size_t i = 0; i < n; ++i) {
        fft_transform_[i / n_poly][i % n_poly] = poly[i];
    }

    auto domain = evaluation_domain(n);
    domain.compute_lookup_table();
    polynomial_arithmetic::fft(fft_transform, domain);
    polynomial_arithmetic::fft({ fft_transform_[0], fft_transform_[1], fft_transform_[2], fft_transform_[3] }, domain);

    fr work_root;
    work_root = fr::one();
    fr expected;

    for (size_t i = 0; i < n; ++i) {
        expected = polynomial_arithmetic::evaluate(poly, work_root, n);
        EXPECT_EQ((fft_transform[i] == expected), true);
        EXPECT_EQ(fft_transform_[i / n_poly][i % n_poly], fft_transform[i]);
        work_root *= domain.root;
    }
}

TEST(polynomials, split_polynomial_evaluate)
{
    constexpr size_t n = 256;
    fr fft_transform[n];
    fr poly[n];

    for (size_t i = 0; i < n; ++i) {
        poly[i] = fr::random_element();
        fr::__copy(poly[i], fft_transform[i]);
    }

    constexpr size_t num_poly = 4;
    constexpr size_t n_poly = n / num_poly;
    fr fft_transform_[num_poly][n_poly];
    for (size_t i = 0; i < n; ++i) {
        fft_transform_[i / n_poly][i % n_poly] = poly[i];
    }

    fr z = fr::random_element();
    EXPECT_EQ(polynomial_arithmetic::evaluate(
                  { fft_transform_[0], fft_transform_[1], fft_transform_[2], fft_transform_[3] }, z, n),
              polynomial_arithmetic::evaluate(poly, z, n));
}

TEST(polynomials, basic_fft)
{
    constexpr size_t n = 1 << 14;
    fr* data = (fr*)aligned_alloc(32, sizeof(fr) * n * 2);
    fr* result = &data[0];
    fr* expected = &data[n];
    for (size_t i = 0; i < n; ++i) {
        result[i] = fr::random_element();
        fr::__copy(result[i], expected[i]);
    }

    auto domain = evaluation_domain(n);
    domain.compute_lookup_table();
    polynomial_arithmetic::fft(result, domain);
    polynomial_arithmetic::ifft(result, domain);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ((result[i] == expected[i]), true);
    }
    aligned_free(data);
}

TEST(polynomials, fft_ifft_consistency)
{
    constexpr size_t n = 256;
    fr result[n];
    fr expected[n];
    for (size_t i = 0; i < n; ++i) {
        result[i] = fr::random_element();
        fr::__copy(result[i], expected[i]);
    }

    auto domain = evaluation_domain(n);
    domain.compute_lookup_table();
    polynomial_arithmetic::fft(result, domain);
    polynomial_arithmetic::ifft(result, domain);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ((result[i] == expected[i]), true);
    }
}

TEST(polynomials, split_polynomial_fft_ifft_consistency)
{
    constexpr size_t n = 256;
    constexpr size_t num_poly = 4;
    fr result[num_poly][n];
    fr expected[num_poly][n];
    for (size_t j = 0; j < num_poly; j++) {
        for (size_t i = 0; i < n; ++i) {
            result[j][i] = fr::random_element();
            fr::__copy(result[j][i], expected[j][i]);
        }
    }

    auto domain = evaluation_domain(num_poly * n);
    domain.compute_lookup_table();

    std::vector<fr*> coeffs_vec;
    for (size_t j = 0; j < num_poly; j++) {
        coeffs_vec.push_back(result[j]);
    }
    polynomial_arithmetic::fft(coeffs_vec, domain);
    polynomial_arithmetic::ifft(coeffs_vec, domain);

    for (size_t j = 0; j < num_poly; j++) {
        for (size_t i = 0; i < n; ++i) {
            EXPECT_EQ((result[j][i] == expected[j][i]), true);
        }
    }
}

TEST(polynomials, fft_coset_ifft_consistency)
{
    constexpr size_t n = 256;
    fr result[n];
    fr expected[n];
    for (size_t i = 0; i < n; ++i) {
        result[i] = fr::random_element();
        fr::__copy(result[i], expected[i]);
    }

    auto domain = evaluation_domain(n);
    domain.compute_lookup_table();
    fr T0;
    T0 = domain.generator * domain.generator_inverse;
    EXPECT_EQ((T0 == fr::one()), true);

    polynomial_arithmetic::coset_fft(result, domain);
    polynomial_arithmetic::coset_ifft(result, domain);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ((result[i] == expected[i]), true);
    }
}

TEST(polynomials, split_polynomial_fft_coset_ifft_consistency)
{
    constexpr size_t n = 256;
    constexpr size_t num_poly = 4;
    fr result[num_poly][n];
    fr expected[num_poly][n];
    for (size_t j = 0; j < num_poly; j++) {
        for (size_t i = 0; i < n; ++i) {
            result[j][i] = fr::random_element();
            fr::__copy(result[j][i], expected[j][i]);
        }
    }

    auto domain = evaluation_domain(num_poly * n);
    domain.compute_lookup_table();

    std::vector<fr*> coeffs_vec;
    for (size_t j = 0; j < num_poly; j++) {
        coeffs_vec.push_back(result[j]);
    }
    polynomial_arithmetic::coset_fft(coeffs_vec, domain);
    polynomial_arithmetic::coset_ifft(coeffs_vec, domain);

    for (size_t j = 0; j < num_poly; j++) {
        for (size_t i = 0; i < n; ++i) {
            EXPECT_EQ((result[j][i] == expected[j][i]), true);
        }
    }
}

TEST(polynomials, fft_coset_ifft_cross_consistency)
{
    constexpr size_t n = 2;
    fr expected[n];
    fr poly_a[4 * n];
    fr poly_b[4 * n];
    fr poly_c[4 * n];

    for (size_t i = 0; i < n; ++i) {
        poly_a[i] = fr::random_element();
        fr::__copy(poly_a[i], poly_b[i]);
        fr::__copy(poly_a[i], poly_c[i]);
        expected[i] = poly_a[i] + poly_c[i];
        expected[i] += poly_b[i];
    }

    for (size_t i = n; i < 4 * n; ++i) {
        poly_a[i] = fr::zero();
        poly_b[i] = fr::zero();
        poly_c[i] = fr::zero();
    }
    auto small_domain = evaluation_domain(n);
    auto mid_domain = evaluation_domain(2 * n);
    auto large_domain = evaluation_domain(4 * n);
    small_domain.compute_lookup_table();
    mid_domain.compute_lookup_table();
    large_domain.compute_lookup_table();
    polynomial_arithmetic::coset_fft(poly_a, small_domain);
    polynomial_arithmetic::coset_fft(poly_b, mid_domain);
    polynomial_arithmetic::coset_fft(poly_c, large_domain);

    for (size_t i = 0; i < n; ++i) {
        poly_a[i] = poly_a[i] + poly_c[4 * i];
        poly_a[i] = poly_a[i] + poly_b[2 * i];
    }

    polynomial_arithmetic::coset_ifft(poly_a, small_domain);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ((poly_a[i] == expected[i]), true);
    }
}

TEST(polynomials, compute_kate_opening_coefficients)
{
    // generate random polynomial F(X) = coeffs
    constexpr size_t n = 256;
    fr* coeffs = static_cast<fr*>(aligned_alloc(64, sizeof(fr) * 2 * n));
    fr* W = static_cast<fr*>(aligned_alloc(64, sizeof(fr) * 2 * n));
    for (size_t i = 0; i < n; ++i) {
        coeffs[i] = fr::random_element();
        coeffs[i + n] = fr::zero();
    }
    polynomial_arithmetic::copy_polynomial(coeffs, W, 2 * n, 2 * n);

    // generate random evaluation point z
    fr z = fr::random_element();

    // compute opening polynomial W(X), and evaluation f = F(z)
    fr f = polynomial_arithmetic::compute_kate_opening_coefficients(W, W, z, n);

    // validate that W(X)(X - z) = F(X) - F(z)
    // compute (X - z) in coefficient form
    fr* multiplicand = static_cast<fr*>(aligned_alloc(64, sizeof(fr) * 2 * n));
    multiplicand[0] = -z;
    multiplicand[1] = fr::one();
    for (size_t i = 2; i < 2 * n; ++i) {
        multiplicand[i] = fr::zero();
    }

    // set F(X) = F(X) - F(z)
    coeffs[0] -= f;

    // compute fft of polynomials
    auto domain = evaluation_domain(2 * n);
    domain.compute_lookup_table();
    polynomial_arithmetic::coset_fft(coeffs, domain);
    polynomial_arithmetic::coset_fft(W, domain);
    polynomial_arithmetic::coset_fft(multiplicand, domain);

    // validate that, at each evaluation, W(X)(X - z) = F(X) - F(z)
    fr result;
    for (size_t i = 0; i < domain.size; ++i) {
        result = W[i] * multiplicand[i];
        EXPECT_EQ((result == coeffs[i]), true);
    }

    aligned_free(coeffs);
    aligned_free(W);
    aligned_free(multiplicand);
}

TEST(polynomials, barycentric_weight_evaluations)
{
    constexpr size_t n = 16;

    evaluation_domain domain(n);

    std::vector<fr> poly(n);
    std::vector<fr> barycentric_poly(n);

    for (size_t i = 0; i < n / 2; ++i) {
        poly[i] = fr::random_element();
        barycentric_poly[i] = poly[i];
    }
    for (size_t i = n / 2; i < n; ++i) {
        poly[i] = fr::zero();
        barycentric_poly[i] = poly[i];
    }
    fr evaluation_point = fr{ 2, 0, 0, 0 }.to_montgomery_form();

    fr result =
        polynomial_arithmetic::compute_barycentric_evaluation(&barycentric_poly[0], n / 2, evaluation_point, domain);

    domain.compute_lookup_table();

    polynomial_arithmetic::ifft(&poly[0], domain);

    fr expected = polynomial_arithmetic::evaluate(&poly[0], evaluation_point, n);

    EXPECT_EQ((result == expected), true);
}

TEST(polynomials, linear_poly_product)
{
    constexpr size_t n = 64;
    fr roots[n];

    fr z = fr::random_element();
    fr expected = 1;
    for (size_t i = 0; i < n; ++i) {
        roots[i] = fr::random_element();
        expected *= (z - roots[i]);
    }

    fr dest[n + 1];
    polynomial_arithmetic::compute_linear_polynomial_product(roots, dest, n);
    fr result = polynomial_arithmetic::evaluate(dest, z, n + 1);

    EXPECT_EQ(result, expected);
}

template <typename FF> class PolynomialTests : public ::testing::Test {};

using FieldTypes = ::testing::Types<bb::fr, grumpkin::fr>;

TYPED_TEST_SUITE(PolynomialTests, FieldTypes);

TYPED_TEST(PolynomialTests, evaluation_domain)
{
    using FF = TypeParam;
    constexpr size_t n = 256;
    auto domain = EvaluationDomain<FF>(n);

    EXPECT_EQ(domain.size, 256UL);
    EXPECT_EQ(domain.log2_size, 8UL);
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

TYPED_TEST(PolynomialTests, compute_interpolation)
{
    using FF = TypeParam;
    constexpr size_t n = 100;
    FF src[n], poly[n], x[n];

    for (size_t i = 0; i < n; ++i) {
        poly[i] = FF::random_element();
    }

    for (size_t i = 0; i < n; ++i) {
        x[i] = FF::random_element();
        src[i] = polynomial_arithmetic::evaluate(poly, x[i], n);
    }
    polynomial_arithmetic::compute_interpolation(src, src, x, n);

    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ(src[i], poly[i]);
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

// LegacyPolynomials MLE
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
TYPED_TEST(PolynomialTests, partial_evaluate_mle)
{
    // Initialize a random polynomial
    using FF = TypeParam;
    size_t N = 32;
    Polynomial<FF> poly(N);
    for (size_t i = 0; i < N; i++) {
        poly.at(i) = FF::random_element();
    }

    // Define a random multivariate evaluation point u = (u_0, u_1, u_2, u_3, u_4)
    auto u_0 = FF::random_element();
    auto u_1 = FF::random_element();
    auto u_2 = FF::random_element();
    auto u_3 = FF::random_element();
    auto u_4 = FF::random_element();
    std::vector<FF> u_challenge = { u_0, u_1, u_2, u_3, u_4 };

    // Show that directly computing v = p(u_0,...,u_4) yields the same result as first computing the partial evaluation
    // in the last 3 variables g(X_0,X_1) = p(X_0,X_1,u_2,u_3,u_4), then v = g(u_0,u_1)

    // Compute v = p(u_0,...,u_4)
    auto v_expected = poly.evaluate_mle(u_challenge);

    // Compute g(X_0,X_1) = p(X_0,X_1,u_2,u_3,u_4), then v = g(u_0,u_1)
    std::vector<FF> u_part_1 = { u_0, u_1 };
    std::vector<FF> u_part_2 = { u_2, u_3, u_4 };
    auto partial_evaluated_poly = poly.partial_evaluate_mle(u_part_2);
    auto v_result = partial_evaluated_poly.evaluate_mle(u_part_1);

    EXPECT_EQ(v_result, v_expected);
}

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

    // verifiy that source poly is appropriately destroyed
    EXPECT_EQ(polynomial_a.data(), nullptr);

    // construct another poly; this will also use the move constructor!
    auto polynomial_c = std::move(polynomial_b);

    // verifiy that source poly is appropriately destroyed
    EXPECT_EQ(polynomial_b.data(), nullptr);

    // define a poly with some arbitrary coefficients
    Polynomial<FF> polynomial_d(num_coeffs);
    for (size_t i = 0; i < num_coeffs; i++) {
        polynomial_d.at(i) = FF::random_element();
    }

    // reset its data using move assignment
    polynomial_d = std::move(polynomial_c);

    // verifiy that source poly is appropriately destroyed
    EXPECT_EQ(polynomial_c.data(), nullptr);
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
