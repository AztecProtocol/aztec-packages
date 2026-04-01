
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/thread.hpp"
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

// Exploit: Pippenger zero-counting bug causes CommitmentKey::commit to produce wrong results
// for polynomials with ≥5M coefficients (bits_per_slice > 16 → 3-level radix sort → bug).
//
// Multi-threading masks the bug by splitting MSM across cores, so each work unit stays below
// the threshold. We force single-threaded execution to expose it.
//
// The test computes the same commitment two ways:
// 1. ck.commit(poly) with 1 thread (full MSM, triggers bug)
// 2. Sum of ck.commit(chunk_i) over 1M-sized chunks (each chunk is bug-free)
TEST(CommitmentKeyExploit, DISABLED_PippengerZeroCountBugCorruptsCommitment)
{
    using Curve = curve::BN254;
    using CK = CommitmentKey<Curve>;
    using Fr = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using GroupElement = Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;

    srs::init_file_crs_factory(srs::bb_crs_path());

    // 5M coefficients → bits_per_slice = 17 → 3-level radix sort → bug triggers
    constexpr size_t n = 5000000;
    CK ck(n);

    auto poly = Polynomial::random(n);

    // 1. Commit via the real CommitmentKey::commit, single-threaded
    info("Computing ck.commit() on degree-", n, " polynomial (single-threaded)...");
    size_t original_concurrency = get_num_cpus();
    set_parallel_for_concurrency(1);
    Commitment buggy_commitment = ck.commit(poly);
    set_parallel_for_concurrency(original_concurrency);

    // 2. Reference: sum of commitments over small chunks (each uses bits_per_slice ≤ 15)
    info("Computing chunked reference commitment...");
    constexpr size_t chunk_size = 1UL << 20; // 1M per chunk
    auto srs_points = ck.get_monomial_points();
    GroupElement correct_sum;
    correct_sum.self_set_infinity();

    for (size_t offset = 0; offset < n; offset += chunk_size) {
        size_t this_chunk = std::min(chunk_size, n - offset);
        // Build a PolynomialSpan for this chunk of coefficients
        std::span<const Fr> chunk_coeffs(&poly[offset], this_chunk);
        PolynomialSpan<const Fr> chunk_span(0, chunk_coeffs);
        std::span<const Commitment> chunk_points = srs_points.subspan(offset, this_chunk);

        auto chunk_result = scalar_multiplication::pippenger_unsafe<Curve>(chunk_span, chunk_points);
        correct_sum += chunk_result;
    }
    Commitment correct_commitment(correct_sum);

    EXPECT_EQ(buggy_commitment, correct_commitment)
        << "CommitmentKey::commit produced WRONG commitment for a degree-" << n << " polynomial.\n"
        << "  commit() result:  " << buggy_commitment << "\n"
        << "  correct result:   " << correct_commitment << "\n"
        << "Root cause: Pippenger zero-counting bug in sort_point_schedule_and_count_zero_buckets "
        << "(bucket_index_bits=17 triggers 3-level radix sort where top_level_keys is not propagated).";
}

} // namespace bb
