#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"

#include <gtest/gtest.h>

namespace bb {

template <typename Curve> class CommitmentKeyTest : public ::testing::Test {
    using CK = CommitmentKey<Curve>;

    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;

  public:
    template <class CK> inline std::shared_ptr<CK> create_commitment_key(size_t num_points);
};

template <>
template <>
std::shared_ptr<CommitmentKey<curve::BN254>> CommitmentKeyTest<curve::BN254>::create_commitment_key<
    CommitmentKey<curve::BN254>>(const size_t num_points)
{
    srs::init_crs_factory("../srs_db/ignition");
    return std::make_shared<CommitmentKey<curve::BN254>>(num_points);
}

template <>
template <>
std::shared_ptr<CommitmentKey<curve::Grumpkin>> CommitmentKeyTest<curve::Grumpkin>::create_commitment_key<
    CommitmentKey<curve::Grumpkin>>(const size_t num_points)
{
    srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    return std::make_shared<CommitmentKey<curve::Grumpkin>>(num_points);
}

// WORKTODO: method for mock structured poly? maybe in shared space somewhere?

using Curves = ::testing::Types<curve::BN254, curve::Grumpkin>;

TYPED_TEST_SUITE(CommitmentKeyTest, Curves);

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
    G1 commit_result = key->commit(poly);
    G1 sparse_commit_result = key->commit_sparse(poly);

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
    G1 commit_result = key->commit(poly);
    G1 sparse_commit_result = key->commit_sparse(poly);

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
    G1 commit_result = key->commit(poly);
    G1 sparse_commit_result = key->commit_sparse(poly);

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
    G1 commit_result = key->commit(poly);
    G1 sparse_commit_result = key->commit_sparse(poly);

    EXPECT_EQ(sparse_commit_result, commit_result);
}

/**
 * @brief Test commit_structured on polynomial with blocks of non-zero values (like wires when using structured trace)
 *
 */
TYPED_TEST(CommitmentKeyTest, CommitStructured)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    // Define the structure of the test polynomial
    const uint32_t NUM_BLOCKS = 8;
    const uint32_t BLOCK_SIZE = 1 << 10;
    const uint32_t ACTUAL_SIZE = 1 << 8;
    std::vector<uint32_t> block_sizes(NUM_BLOCKS, BLOCK_SIZE);
    std::vector<uint32_t> actual_sizes(NUM_BLOCKS, ACTUAL_SIZE);
    const uint32_t num_points = NUM_BLOCKS * BLOCK_SIZE;

    uint32_t full_size = 0;
    for (auto size : block_sizes) {
        full_size += size;
    }

    // Construct a random polynomial with the prescribed structure
    auto polynomial = Polynomial(full_size);
    uint32_t start_idx = 0;
    uint32_t end_idx = 0;
    for (auto [block_size, actual_size] : zip_view(block_sizes, actual_sizes)) {
        end_idx = start_idx + actual_size;
        for (size_t i = start_idx; i < end_idx; ++i) {
            polynomial.at(i) = Fr::random_element();
        }
        start_idx += block_size;
    }

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(num_points);
    G1 commit_result = key->commit(polynomial);
    G1 structured_commit_result = key->commit_structured(polynomial, block_sizes, actual_sizes);

    EXPECT_EQ(structured_commit_result, commit_result);
}

TYPED_TEST(CommitmentKeyTest, CommitStructuredShifted)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    // std::vector<uint32_t> structured_sizes = { 1000, 4000, 180000, 90000, 9000, 137000, 72000, 4000, 2500, 11500 };
    // std::vector<uint32_t> actual_sizes = { 10, 16, 48873, 18209, 4132, 23556, 35443, 3, 2, 2 };
    std::vector<uint32_t> structured_sizes = { 4, 6 };
    std::vector<uint32_t> actual_sizes = { 2, 2 };
    bool non_zero_complement = false;

    const size_t ZERO_ROW_OFFSET = 1;

    uint32_t full_size = ZERO_ROW_OFFSET; // account for zero row
    for (auto size : structured_sizes) {
        full_size += size;
    }

    // In practice the polynomials will have a power-of-2 size
    auto log2_n = static_cast<size_t>(numeric::get_msb(full_size));
    if ((1UL << log2_n) != (full_size)) {
        ++log2_n;
    }
    full_size = 1 << log2_n;

    Polynomial polynomial(full_size - 1, full_size, 1);

    uint32_t start_idx = ZERO_ROW_OFFSET;
    uint32_t end_idx = 0;
    for (auto [block_size, actual_size] : zip_view(structured_sizes, actual_sizes)) {
        end_idx = start_idx + actual_size;
        for (size_t i = start_idx; i < end_idx; ++i) {
            polynomial.at(i) = Fr::random_element();
        }
        start_idx += block_size;
        // If indicated, populate the 'dead' regions of the blocks with a random constant (mimicking z_perm)
        if (non_zero_complement) {
            Fr const_random_coeff = Fr::random_element();
            for (size_t i = end_idx; i < start_idx; ++i) {
                polynomial.at(i) = const_random_coeff;
            }
        }
    }
    // In practice z_perm will be constant from the end of the last fixed block to the dyadic poly size
    if (non_zero_complement) {
        Fr const_random_coeff = polynomial[start_idx - 1];
        for (size_t i = start_idx; i < full_size; ++i) {
            polynomial.at(i) = const_random_coeff;
        }
    }

    info("Polynomial values:");
    for (size_t i = 0; i < full_size; ++i) {
        info("val = ", polynomial[i]);
    }

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(full_size);

    G1 expected_result = key->commit(polynomial);

    G1 result = key->commit_structured(polynomial, structured_sizes, actual_sizes);

    EXPECT_EQ(result, expected_result);
}

/**
 * @brief WORKTODO
 *
 */
TYPED_TEST(CommitmentKeyTest, CommitStructuredNonzeroComplement)
{
    using Curve = TypeParam;
    using CK = CommitmentKey<Curve>;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    std::vector<uint32_t> structured_sizes = { 1000, 4000, 180000, 90000, 9000, 137000, 72000, 4000, 2500, 11500 };
    std::vector<uint32_t> actual_sizes = { 10, 16, 48873, 18209, 4132, 23556, 35443, 3, 2, 2 };
    // std::vector<uint32_t> structured_sizes = { 4, 6 };
    // std::vector<uint32_t> actual_sizes = { 2, 2 };
    bool non_zero_complement = true;

    const size_t ZERO_ROW_OFFSET = 1;

    uint32_t full_size = ZERO_ROW_OFFSET; // account for zero row
    for (auto size : structured_sizes) {
        full_size += size;
    }

    // In practice the polynomials will have a power-of-2 size
    auto log2_n = static_cast<size_t>(numeric::get_msb(full_size));
    if ((1UL << log2_n) != (full_size)) {
        ++log2_n;
    }
    full_size = 1 << log2_n;

    Polynomial polynomial(full_size - 1, full_size, 1);

    uint32_t start_idx = ZERO_ROW_OFFSET;
    uint32_t end_idx = 0;
    for (auto [block_size, actual_size] : zip_view(structured_sizes, actual_sizes)) {
        end_idx = start_idx + actual_size;
        for (size_t i = start_idx; i < end_idx; ++i) {
            polynomial.at(i) = Fr::random_element();
        }
        start_idx += block_size;
        // If indicated, populate the 'dead' regions of the blocks with a random constant (mimicking z_perm)
        if (non_zero_complement) {
            Fr const_random_coeff = Fr::random_element();
            for (size_t i = end_idx; i < start_idx; ++i) {
                polynomial.at(i) = const_random_coeff;
            }
        }
    }
    // In practice z_perm will be constant from the end of the last fixed block to the dyadic poly size
    if (non_zero_complement) {
        Fr const_random_coeff = polynomial[start_idx - 1];
        for (size_t i = start_idx; i < full_size; ++i) {
            polynomial.at(i) = const_random_coeff;
        }
    }

    // Commit to the polynomial using both the conventional commit method and the sparse commitment method
    auto key = TestFixture::template create_commitment_key<CK>(full_size);

    G1 expected_result = key->commit(polynomial);

    G1 result = key->commit_structured_with_nonzero_complement(polynomial, structured_sizes, actual_sizes);

    EXPECT_EQ(result, expected_result);
}

} // namespace bb
