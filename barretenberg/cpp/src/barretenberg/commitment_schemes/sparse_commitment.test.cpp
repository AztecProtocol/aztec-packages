#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

namespace bb {

template <typename Curve> class CommitmentKeyTest : public ::testing::Test {
    using CK = CommitmentKey<Curve>;

    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;

    struct StructuredPolyData {
        Polynomial polynomial;
        std::vector<std::pair<size_t, size_t>> active_range_endpoints;
    };

  public:
    template <class CK> CK create_commitment_key(size_t num_points);

    // Construct a random poly with the prescribed block structure; complement is zero/constant if non_zero_complement =
    // false/true (to mimic wire/z_perm)
    StructuredPolyData create_structured_test_polynomial(std::vector<uint32_t> fixed_sizes,
                                                         std::vector<uint32_t> actual_sizes,
                                                         bool non_zero_complement = false)
    {
        // Add zero row offset to mimic actual structure of wire/z_perm
        const size_t ZERO_ROW_OFFSET = 1;

        uint32_t full_size = ZERO_ROW_OFFSET;
        for (auto size : fixed_sizes) {
            full_size += size;
        }
        // In practice the polynomials will have a power-of-2 size
        auto log2_n = static_cast<size_t>(numeric::get_msb(full_size));
        if ((1UL << log2_n) != (full_size)) {
            ++log2_n;
        }
        full_size = 1 << log2_n;

        // Construct polynomial with the specified form and track active range endpoints
        Polynomial polynomial(full_size - 1, full_size, 1);
        uint32_t start_idx = ZERO_ROW_OFFSET;
        uint32_t end_idx = 0;
        std::vector<std::pair<size_t, size_t>> active_range_endpoints;
        for (auto [fixed_size, actual_size] : zip_view(fixed_sizes, actual_sizes)) {
            end_idx = start_idx + actual_size;
            active_range_endpoints.emplace_back(start_idx, end_idx);
            for (size_t idx = start_idx; idx < end_idx; ++idx) {
                polynomial.at(idx) = Fr::random_element();
            }
            start_idx += fixed_size;
        }

        // If non_zero_complement, populate the space between active regions with a random constant value
        if (non_zero_complement) {
            for (size_t i = 0; i < active_range_endpoints.size() - 1; ++i) {
                const size_t start = active_range_endpoints[i].second;
                const size_t end = active_range_endpoints[i + 1].first;
                Fr const_val = Fr::random_element();
                for (size_t idx = start; idx < end; ++idx) {
                    polynomial.at(idx) = const_val;
                }
            }
        }

        return { polynomial, active_range_endpoints };
    }
};

template <>
template <>
CommitmentKey<curve::BN254> CommitmentKeyTest<curve::BN254>::create_commitment_key<CommitmentKey<curve::BN254>>(
    const size_t num_points)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    return CommitmentKey<curve::BN254>(num_points);
}

template <>
template <>
CommitmentKey<curve::Grumpkin> CommitmentKeyTest<curve::Grumpkin>::create_commitment_key<
    CommitmentKey<curve::Grumpkin>>(const size_t num_points)
{
    srs::init_file_crs_factory(bb::srs::bb_crs_path());
    return CommitmentKey<curve::Grumpkin>(num_points);
}

using Curves = ::testing::Types<curve::BN254, curve::Grumpkin>;

TYPED_TEST_SUITE(CommitmentKeyTest, Curves);

// Check that commit for a structured polynomial and the same polynomial but full return the same results
TYPED_TEST(CommitmentKeyTest, CommitFull)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 1 << 5; // large enough to ensure normal pippenger logic is used
    const size_t start_index = 13;    // random start index
    const size_t num_nonzero = 13;    // random size

    // Construct a random structured polynomial
    Polynomial poly{ num_nonzero, num_points, start_index };
    for (size_t i = start_index; i < start_index + num_nonzero; ++i) {
        poly.at(i) = Fr::random_element();
    }

    // Commit to the polynomial and the same polynomial but full
    auto key = TestFixture::template create_commitment_key<CK>(num_points);
    G1 commit_result = key.commit(poly);
    auto full_poly = poly.full();
    G1 full_commit_result = key.commit(full_poly);

    EXPECT_EQ(commit_result, full_commit_result);
}

// Check that commit for a structured polynomial and the same polynomial but full return the same results
TYPED_TEST(CommitmentKeyTest, CommitFullMedium)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 4096;  // large enough to ensure normal pippenger logic is used
    const size_t start_index = 1402; // random start index
    const size_t num_nonzero = 1392; // random size

    // Construct a random structured polynomial
    Polynomial poly{ num_nonzero, num_points, start_index };
    for (size_t i = start_index; i < start_index + num_nonzero; ++i) {
        poly.at(i) = Fr::random_element();
    }

    // Commit to the polynomial and the same polynomial but full
    auto key = TestFixture::template create_commitment_key<CK>(num_points);
    G1 commit_result = key.commit(poly);
    auto full_poly = poly.full();
    G1 full_commit_result = key.commit(full_poly);

    EXPECT_EQ(commit_result, full_commit_result);
}

// Check that commit for a structured polynomial doesn't require more SRS points beyond the size of the polynomial
TYPED_TEST(CommitmentKeyTest, CommitSRSCheck)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 32;  // large enough to ensure normal pippenger logic is used
    const size_t start_index = 15; // just slightly less than half
    const size_t num_nonzero = 17; // fill to the end of the size

    // Construct a random structured polynomial
    Polynomial poly{ num_nonzero, num_points, start_index };
    for (size_t i = start_index; i < start_index + num_nonzero; ++i) {
        poly.at(i) = Fr::random_element();
    }

    // Commit to the polynomial and the same polynomial but full
    auto key = TestFixture::template create_commitment_key<CK>(num_points);
    G1 commit_result = key.commit(poly);
    auto full_poly = poly.full();
    G1 full_commit_result = key.commit(full_poly);

    EXPECT_EQ(commit_result, full_commit_result);
}

// Check that commit and commit_sparse return the same result for a random sparse polynomial
TYPED_TEST(CommitmentKeyTest, CommitSparse)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 1 << 12; // large enough to ensure normal pippenger logic is used
    const size_t num_nonzero = 7;

    // Construct a sparse random polynomial
    Polynomial poly{ num_points };
    for (size_t i = 0; i < num_nonzero; ++i) {
        size_t idx = (i + 1) * (i + 1) % num_points;
        poly.at(idx) = Fr::random_element();
    }

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(num_points);
    G1 commit_result = key.commit(poly);
    G1 sparse_commit_result = key.commit_sparse(poly);

    EXPECT_EQ(sparse_commit_result, commit_result);
}

/**
 * @brief Test commit_sparse on polynomial with zero start index.
 *
 */
TYPED_TEST(CommitmentKeyTest, CommitSparseSmallSize)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 1 << 12; // large enough to ensure normal pippenger logic is used
    const size_t num_nonzero = 7;

    // Construct a sparse random polynomial
    Polynomial poly(num_nonzero, num_points, 0);
    for (size_t i = 0; i < num_nonzero; ++i) {
        poly.at(i) = Fr::random_element();
    }

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(num_points);
    G1 commit_result = key.commit(poly);
    G1 sparse_commit_result = key.commit_sparse(poly);

    EXPECT_EQ(sparse_commit_result, commit_result);
}

/**
 * @brief Test commit_sparse on polynomial with nonzero start index.
 *
 */
TYPED_TEST(CommitmentKeyTest, CommitSparseNonZeroStartIndex)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 1 << 12; // large enough to ensure normal pippenger logic is used
    const size_t num_nonzero = 7;
    const size_t offset = 1 << 11;

    // Construct a sparse random polynomial
    Polynomial poly(num_nonzero, num_points, offset);
    for (size_t i = offset; i < offset + num_nonzero; ++i) {
        poly.at(i) = Fr::random_element();
    }

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(num_points);
    G1 commit_result = key.commit(poly);
    G1 sparse_commit_result = key.commit_sparse(poly);

    EXPECT_EQ(sparse_commit_result, commit_result);
}

/**
 * @brief Test commit_sparse on polynomial with medium size and nonzero start index.
 * @details This was used to catch a bug in commit_sparse where the number of threads was > 1 and the size was not a
 * power of 2.
 */
TYPED_TEST(CommitmentKeyTest, CommitSparseMediumNonZeroStartIndex)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t num_points = 1 << 12; // large enough to ensure normal pippenger logic is used
    const size_t num_nonzero = (1 << 9) + 1;
    const size_t offset = 1 << 11;

    // Construct a sparse random polynomial
    Polynomial poly(num_nonzero, num_points, offset);
    for (size_t i = offset; i < offset + num_nonzero; ++i) {
        poly.at(i) = Fr::random_element();
    }

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(num_points);
    G1 commit_result = key.commit(poly);
    G1 sparse_commit_result = key.commit_sparse(poly);

    EXPECT_EQ(sparse_commit_result, commit_result);
}

/**
 * @brief Test commit_structured on polynomial with blocks of non-zero values (like wires when using structured trace)
 *
 */
TYPED_TEST(CommitmentKeyTest, CommitStructuredWire)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;

    if constexpr (std::is_same_v<Curve, curve::Grumpkin>) {
        GTEST_SKIP() << "Skipping test for Grumpkin as it has too small a CRS.";
    }

    // Arbitrary but realistic block structure in the ivc setting (roughly 2^19 full size with 2^17 utlization)
    std::vector<uint32_t> fixed_sizes = { 1000, 4000, 180000, 90000, 9000, 137000, 72000, 4000, 2500, 11500 };
    std::vector<uint32_t> actual_sizes = { 10, 16, 48873, 18209, 4132, 23556, 35443, 3, 2, 2 };

    // Construct a random polynomial resembling the wires in the structured trace setting
    const bool non_zero_complement = false;
    auto [polynomial, active_range_endpoints] =
        TestFixture::create_structured_test_polynomial(fixed_sizes, actual_sizes, non_zero_complement);

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(polynomial.virtual_size());

    auto full_poly = polynomial.full();
    G1 actual_expected_result = key.commit(full_poly);
    G1 expected_result = key.commit(polynomial);
    G1 result = key.commit_structured(polynomial, active_range_endpoints);
    EXPECT_EQ(actual_expected_result, expected_result);
    EXPECT_EQ(result, expected_result);
}

/**
 * @brief Test commit_structured on polynomial with blocks of non-zero values that resembles masked structured witness.
 *
 */
TYPED_TEST(CommitmentKeyTest, CommitStructuredMaskedWire)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;

    const uint32_t circuit_size = 8192;
    // To ensure that commit_structured is used.
    const uint32_t actual_size = circuit_size / 8;

    // Create a polynomial with a block of zeroes between actual_size and circuit_size - NUM_DISABLED_ROWS_IN_SUMCHECK.
    // We subtract 1 to account for ZERO_ROW_OFFSET
    std::vector<uint32_t> fixed_sizes = { circuit_size - 1 - NUM_DISABLED_ROWS_IN_SUMCHECK,
                                          NUM_DISABLED_ROWS_IN_SUMCHECK };
    std::vector<uint32_t> actual_sizes = { actual_size, NUM_DISABLED_ROWS_IN_SUMCHECK };

    // Construct a random polynomial resembling a masked structured wire
    const bool non_zero_complement = false;
    auto [polynomial, active_range_endpoints] =
        TestFixture::create_structured_test_polynomial(fixed_sizes, actual_sizes, non_zero_complement);

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(polynomial.virtual_size());

    auto full_poly = polynomial.full();
    G1 actual_expected_result = key.commit(full_poly);
    G1 expected_result = key.commit(polynomial);
    G1 result = key.commit_structured(polynomial, active_range_endpoints);
    EXPECT_EQ(actual_expected_result, expected_result);
    EXPECT_EQ(result, expected_result);
}

/**
 * @brief Test the method for committing to structured polynomials with a constant nonzero complement (i.e. the
 * permutation grand product polynomial z_perm in the structured trace setting).
 *
 */
TYPED_TEST(CommitmentKeyTest, CommitStructuredNonzeroComplement)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;

    if constexpr (std::is_same_v<Curve, curve::Grumpkin>) {
        GTEST_SKIP() << "Skipping test for Grumpkin as it has too small a CRS.";
    }

    // Arbitrary but realistic block structure in the ivc setting (roughly 2^19 full size with 2^17 utlization)
    std::vector<uint32_t> fixed_sizes = { 1000, 4000, 180000, 90000, 9000, 137000, 72000, 4000, 2500, 11500 };
    std::vector<uint32_t> actual_sizes = { 10, 16, 48873, 18209, 4132, 23556, 35443, 3, 2, 2 };

    // Construct a random polynomial resembling z_perm in the structured trace setting
    const bool non_zero_complement = true;
    auto [polynomial, active_range_endpoints] =
        TestFixture::create_structured_test_polynomial(fixed_sizes, actual_sizes, non_zero_complement);

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(polynomial.virtual_size());

    G1 expected_result = key.commit(polynomial);
    G1 result = key.commit_structured_with_nonzero_complement(polynomial, active_range_endpoints);

    EXPECT_EQ(result, expected_result);
}

} // namespace bb
