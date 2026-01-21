
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

namespace bb {

template <typename Curve> class CommitmentKeyTest : public ::testing::Test {
  public:
    using CK = CommitmentKey<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;

    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }

    // Naive MSM computation for testing
    static Commitment commit_naive(const CK& ck, const Polynomial& poly)
    {
        auto srs = ck.get_monomial_points();
        GroupElement result = srs[poly.start_index()] * poly[poly.start_index()];
        for (size_t i = poly.start_index() + 1; i < poly.end_index(); ++i) {
            result += srs[i] * poly[i];
        }
        return result.normalize();
    }

    void test_commit_to_zero_poly()
    {
        constexpr size_t n = 16;
        CK ck(n);

        Polynomial zero_poly(n);
        Commitment commitment = ck.commit(zero_poly);

        EXPECT_TRUE(commitment.is_point_at_infinity());
    }

    void test_commit_sparse_poly()
    {
        constexpr size_t n = 16;
        CK ck(n);

        // Polynomial with mostly zero coefficients
        Polynomial poly(n);
        poly.at(3) = Fr::random_element();

        Commitment commitment = ck.commit(poly);
        Commitment expected = commit_naive(ck, poly);
        EXPECT_EQ(expected, commitment);
    }

    void test_commit_random_poly()
    {
        constexpr size_t n = 16;
        CK ck(n);

        auto poly = Polynomial::random(n);
        Commitment commitment = ck.commit(poly);
        Commitment expected = commit_naive(ck, poly);
        EXPECT_EQ(expected, commitment);
    }

    void test_non_dyadic_srs_size()
    {
        // Test various non-power-of-2 sizes
        for (size_t n : { size_t{ 10 }, size_t{ 100 }, size_t{ 1000 }, size_t{ 1234 } }) {
            CK ck(n);

            EXPECT_EQ(ck.srs_size, n);
            // Note: get_monomial_size() may be >= n since it returns the underlying SRS size
            EXPECT_GE(ck.get_monomial_size(), n);

            auto poly = Polynomial::random(n);
            Commitment commitment = ck.commit(poly);
            Commitment expected = commit_naive(ck, poly);
            EXPECT_EQ(expected, commitment);
        }
    }

    void test_batch_commit()
    {
        constexpr size_t n = 16;
        CK ck(n);

        // Create multiple polynomials
        std::vector<Polynomial> polys;
        for (size_t i = 0; i < 5; ++i) {
            polys.emplace_back(Polynomial::random(n));
        }

        RefVector<Polynomial> poly_refs(polys);
        auto batch_commitments = ck.batch_commit(poly_refs);

        EXPECT_EQ(batch_commitments.size(), polys.size());

        // Verify batch commit matches individual commits and naive computation
        for (size_t i = 0; i < polys.size(); ++i) {
            Commitment individual = ck.commit(polys[i]);
            Commitment expected = commit_naive(ck, polys[i]);
            EXPECT_EQ(batch_commitments[i], individual);
            EXPECT_EQ(batch_commitments[i], expected);
        }
    }

    void test_commit_with_start_index()
    {
        constexpr size_t n = 32;
        CK ck(n);

        // Create polynomial with non-zero start index
        // Polynomial(size, virtual_size, start_index) requires start_index + size <= virtual_size
        // Indices must be in range [start_index, start_index + size)
        constexpr size_t start_index = 8;
        constexpr size_t poly_size = 16;
        constexpr size_t virtual_size = start_index + poly_size; // 24
        Polynomial poly(poly_size, virtual_size, start_index);
        for (size_t i = 0; i < poly_size; ++i) {
            poly.at(start_index + i) = Fr::random_element();
        }

        Commitment commitment = ck.commit(poly);
        Commitment expected = commit_naive(ck, poly);
        EXPECT_EQ(expected, commitment);
    }
};

using Curves = ::testing::Types<curve::BN254, curve::Grumpkin>;
TYPED_TEST_SUITE(CommitmentKeyTest, Curves);

TYPED_TEST(CommitmentKeyTest, CommitToZeroPoly)
{
    TestFixture::test_commit_to_zero_poly();
}
TYPED_TEST(CommitmentKeyTest, CommitSparsePoly)
{
    TestFixture::test_commit_sparse_poly();
}
TYPED_TEST(CommitmentKeyTest, CommitRandomPoly)
{
    TestFixture::test_commit_random_poly();
}
TYPED_TEST(CommitmentKeyTest, NonDyadicSrsSize)
{
    TestFixture::test_non_dyadic_srs_size();
}
TYPED_TEST(CommitmentKeyTest, BatchCommit)
{
    TestFixture::test_batch_commit();
}
TYPED_TEST(CommitmentKeyTest, CommitWithStartIndex)
{
    TestFixture::test_commit_with_start_index();
}

} // namespace bb
