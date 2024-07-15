#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "claim.hpp"
#include <ranges>
#include <vector>

#include <gtest/gtest.h>

namespace bb {

// constexpr size_t COMMITMENT_TEST_NUM_POINTS = 4096;

template <typename Curve> class CommitmentKeyTest : public ::testing::Test {
    using CK = CommitmentKey<Curve>;

    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;

  public:
    Polynomial random_polynomial(const size_t n)
    {
        Polynomial p(n);
        for (size_t i = 0; i < n; ++i) {
            p[i] = Fr::random_element();
        }
        return p;
    }

    template <class CK> inline std::shared_ptr<CK> create_commitment_key(const size_t num_points);

    template <>
    inline std::shared_ptr<CommitmentKey<curve::BN254>> create_commitment_key<CommitmentKey<curve::BN254>>(
        const size_t num_points)
    {
        srs::init_crs_factory("../srs_db/ignition");
        return std::make_shared<CommitmentKey<curve::BN254>>(num_points);
    }
};

using Curves = ::testing::Types<curve::BN254>;

TYPED_TEST_SUITE(CommitmentKeyTest, Curves);

TYPED_TEST(CommitmentKeyTest, CommitSimple)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 10;

    auto key = TestFixture::template create_commitment_key<CK>(num_points);

    const size_t point_table_size = 2 * num_points;
    std::span<G1> point_table(key->srs->get_monomial_points(), point_table_size);

    std::vector<G1> srs;

    size_t idx = 0;
    for (auto& element : point_table) {
        if (idx % 2 == 0) {
            srs.emplace_back(element);
        }
        idx++;
    }

    const size_t num_nonzero = 2;
    Polynomial poly{ num_points };
    for (size_t i = 0; i < num_nonzero; ++i) {
        size_t idx = (i + 1) * (i + 1) % num_points;
        poly[idx] = Fr::random_element();
    }

    G1 normal_result = key->commit(poly);

    std::vector<Fr> scalars;
    std::vector<G1> points;

    for (auto [scalar, point] : zip_view(poly, srs)) {
        if (!scalar.is_zero()) {
            scalars.emplace_back(scalar);
            points.emplace_back(point);
        }
    }

    EXPECT_EQ(points.size(), num_nonzero);

    G1 reduced_result;
    reduced_result.self_set_infinity();
    for (auto [scalar, point] : zip_view(scalars, points)) {
        reduced_result = reduced_result + point * scalar;
    }

    EXPECT_EQ(reduced_result, normal_result);

    G1 pippenger_result = scalar_multiplication::pippenger_without_endomorphism_basis_points<Curve>(
        scalars.data(), points.data(), num_nonzero, key->pippenger_runtime_state);

    EXPECT_EQ(pippenger_result, normal_result);
}

TYPED_TEST(CommitmentKeyTest, SrsView)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;

    const size_t num_points = 10;

    auto key = TestFixture::template create_commitment_key<CK>(num_points);

    const size_t point_table_size = 2 * num_points;
    std::span<G1> point_table(key->srs->get_monomial_points(), point_table_size);

    // Manually construct the SRS from the point table
    std::vector<G1> srs;
    size_t idx = 0;
    for (auto& element : point_table) {
        if (idx % 2 == 0) {
            srs.emplace_back(element);
        }
        idx++;
    }

    // Create a view of the even elements of the point table (i.e. the raw srs points)
    auto srs_view = std::views::iota(static_cast<size_t>(0), point_table_size) | // generate view of indices 0, ..., n-1
                    std::views::filter([](int i) { return i % 2 == 0; }) | // create a view of the even indices only
                    std::views::transform([&point_table](size_t i) { return point_table[i]; }); // extract even srs

    // Check that the two agree
    size_t point_idx = 0;
    for (auto element : srs_view) {
        EXPECT_EQ(srs[point_idx], element);
        point_idx++;
    }
}

TYPED_TEST(CommitmentKeyTest, SrsViewCommit)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 10;

    auto key = TestFixture::template create_commitment_key<CK>(num_points);

    const size_t num_nonzero = 2;
    Polynomial poly{ num_points };
    for (size_t i = 0; i < num_nonzero; ++i) {
        size_t idx = (i + 1) * (i + 1) % num_points;
        poly[idx] = Fr::random_element();
    }

    G1 normal_result = key->commit(poly);

    // Create a view of the even elements of the point table (i.e. the raw srs points)
    auto srs_view = key->get_srs_view();

    std::vector<Fr> scalars;
    std::vector<G1> points;

    size_t point_idx = 0;
    for (auto point : srs_view) {
        Fr& scalar = poly[point_idx++];
        if (!scalar.is_zero()) {
            scalars.emplace_back(scalar);
            points.emplace_back(point);
        }
    }

    EXPECT_EQ(points.size(), num_nonzero);

    G1 reduced_result;
    reduced_result.self_set_infinity();
    for (auto [scalar, point] : zip_view(scalars, points)) {
        reduced_result = reduced_result + point * scalar;
    }

    EXPECT_EQ(reduced_result, normal_result);

    G1 pippenger_result = scalar_multiplication::pippenger_without_endomorphism_basis_points<Curve>(
        scalars.data(), points.data(), num_nonzero, key->pippenger_runtime_state);

    EXPECT_EQ(pippenger_result, normal_result);
}

TYPED_TEST(CommitmentKeyTest, SrsViewCommitSparse)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 10;

    auto key = TestFixture::template create_commitment_key<CK>(num_points);

    const size_t num_nonzero = 2;
    Polynomial poly{ num_points };
    for (size_t i = 0; i < num_nonzero; ++i) {
        size_t idx = (i + 1) * (i + 1) % num_points;
        poly[idx] = Fr::random_element();
    }

    G1 normal_result = key->commit(poly);

    G1 pippenger_result = key->commit_sparse(poly);

    EXPECT_EQ(pippenger_result, normal_result);
}

} // namespace bb
