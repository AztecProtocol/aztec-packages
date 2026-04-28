
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

    // Regression test for a zero-counting bug in Pippenger's MSD radix sort
    // (sort_point_schedule_and_count_zero_buckets in process_buckets.cpp).
    //
    // The bug: the recursive radix sort passed `keys` instead of `top_level_keys` when recursing,
    // causing the zero-entry counter to be overwritten by non-zero-bucket counts when the sort
    // uses 3+ recursion levels. The inflated count makes the MSM skip valid point contributions.
    //
    // When does 3-level recursion occur?
    //   - Pippenger chooses bits_per_slice via a cost model (get_optimal_log_num_buckets).
    //   - bits_per_slice > 16 pads to 24 bits -> initial_shift=16 -> 3 levels (shift 16->8->0).
    //   - For BN254 (254-bit scalars), bits_per_slice=17 at ~4.6M+ points per work unit.
    //   - Multi-threading splits MSM across cores, so each work unit is total_points/num_threads.
    //     On a 32-core machine, a single work unit reaches 4.6M at ~150M total points.
    //   - Single-threaded execution (WASM, resource-constrained environments) hits the threshold
    //     at 4.6M points directly.
    //
    // Polynomial design (deterministic, all coefficients non-zero):
    //   get_scalar_slice extracts bits MSB-first. With bits_per_slice=17 and 15 rounds for BN254,
    //   round 13 extracts bits [16:33) of each scalar. We choose scalar values so that round 13
    //   has the bucket distribution needed to trigger the overwrite:
    //
    //     100 coefficients = Fr(1)      -> bits [16:33) = 0 -> bucket_index = 0
    //     10  coefficients = Fr(2^16)   -> bits [16:33) = 1 -> bucket_index = 1    [DROPPED]
    //     ~5M coefficients = Fr(2^32)   -> bits [16:33) = 2^16 -> bucket_index = 65536 [OVERWRITES]
    //
    //   Fr(1) entries must be non-zero (zero scalars are filtered before the MSM) but still
    //   land in bucket 0 for round 13. They ensure point_schedule[0] has bucket_index=0 after
    //   sorting, bypassing the post-sort safety check in sort_point_schedule_and_count_zero_buckets.
    //
    //   The bug overwrites num_zero_entries from 100 (correct) to ~5M (count at bucket 65536).
    //   The MSM span then starts ~5M entries into the sorted schedule, skipping all 10 target
    //   entries with bucket_index=1 and silently dropping their contributions.
    //
    //   This layout is chosen for efficiency (~1.5s) and full determinism (no random scalars).
    //   The reference commitment is computed by chunking into 1M-point sub-MSMs, each using
    //   bits_per_slice <= 15 (2-level sort, bug-free).
    void test_pippenger_zero_count_regression()
    {
        constexpr size_t n = 5000000;
        CK ck(n);

        Polynomial poly(n);

        constexpr size_t num_fake_zeros = 100;
        for (size_t i = 0; i < num_fake_zeros; ++i) {
            poly.at(i) = Fr(1);
        }

        constexpr size_t num_targets = 10;
        for (size_t i = num_fake_zeros; i < num_fake_zeros + num_targets; ++i) {
            poly.at(i) = Fr(65536);
        }

        for (size_t i = num_fake_zeros + num_targets; i < n; ++i) {
            poly.at(i) = Fr(uint256_t(1) << 32);
        }

        // Commit single-threaded to keep the full point set in one work unit
        size_t original_concurrency = get_num_cpus();
        set_parallel_for_concurrency(1);
        Commitment actual_commitment = ck.commit(poly);
        set_parallel_for_concurrency(original_concurrency);

        // Reference: sum of chunked sub-MSMs (each chunk uses bits_per_slice <= 15, bug-free)
        constexpr size_t chunk_size = 1UL << 20;
        auto srs_points = ck.get_monomial_points();
        GroupElement correct_sum;
        correct_sum.self_set_infinity();

        for (size_t offset = 0; offset < n; offset += chunk_size) {
            size_t this_chunk = std::min(chunk_size, n - offset);
            std::span<const Fr> chunk_coeffs(&poly[offset], this_chunk);
            PolynomialSpan<const Fr> chunk_span(0, chunk_coeffs);
            std::span<const Commitment> chunk_points = srs_points.subspan(offset, this_chunk);

            auto chunk_result = scalar_multiplication::pippenger_unsafe<Curve>(chunk_span, chunk_points);
            correct_sum += chunk_result;
        }
        Commitment correct_commitment(correct_sum);

        EXPECT_EQ(actual_commitment, correct_commitment);
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
TYPED_TEST(CommitmentKeyTest, DISABLED_PippengerZeroCountRegression)
{
    if constexpr (!std::is_same_v<TypeParam, curve::BN254>) {
        GTEST_SKIP() << "BN254 only: Grumpkin CRS has insufficient points for the 5M threshold";
    }
#ifndef NDEBUG
    GTEST_SKIP() << "Too slow in debug builds";
#else
    TestFixture::test_pippenger_zero_count_regression();
#endif
}

} // namespace bb
