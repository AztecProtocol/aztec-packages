#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include <gtest/gtest.h>
#include <optional>
#include <vector>

using namespace bb;

namespace {
using Curve = curve::Grumpkin;
using Fq = Curve::BaseField;
using Fr = Curve::ScalarField;
using Element = Curve::Element;
using Commitment = Curve::AffineElement;

// IPA round challenges are 127-bit transcript limbs, and batch_two_round_fold asserts that bound.
Fr random_127_bit_challenge()
{
    uint256_t challenge = Fr::random_element();
    challenge.data[1] &= 0x7FFFFFFFFFFFFFFFULL;
    challenge.data[2] = 0;
    challenge.data[3] = 0;
    return Fr(challenge);
}

// Independent random points: four of them satisfy a relation that makes the fold add equal or opposite points only with
// negligible probability. Only the x draws use the shared RNG, which is not thread-safe; the square roots, the bulk of
// the cost, run in parallel.
std::vector<Commitment> random_points(size_t num_points)
{
    std::vector<Fq> xs(num_points);
    for (auto& x : xs) {
        x = Fq::random_element();
    }
    std::vector<Commitment> points(num_points);
    parallel_for_range(num_points, [&](size_t start, size_t end) {
        for (size_t i = start; i < end; ++i) {
            const bool sign_bit = (i & 1) != 0;
            Fq x = xs[i];
            std::optional<Commitment> point = Commitment::derive_from_x_coordinate(x, sign_bit);
            while (!point.has_value()) {
                x += Fq::one();
                point = Commitment::derive_from_x_coordinate(x, sign_bit);
            }
            points[i] = *point;
        }
    });
    return points;
}

// EXPECT_EQ on affine points compares coordinate values: the same point can be held in a coarse-reduced form whose
// limbs differ.
void expect_same_points(const std::vector<Commitment>& actual, const std::vector<Commitment>& expected, size_t count)
{
    ASSERT_GE(actual.size(), count);
    ASSERT_GE(expected.size(), count);
    for (size_t i = 0; i < count; ++i) {
        EXPECT_EQ(actual[i], expected[i]) << "index " << i;
    }
}

void check_blocked_fold_matches_single_call(size_t quarter, size_t block)
{
    SCOPED_TRACE(testing::Message() << "quarter " << quarter << ", block " << block);
    const std::vector<Commitment> srs = random_points(4 * quarter);
    const Fr u1 = random_127_bit_challenge();
    const Fr u2 = random_127_bit_challenge();

    const std::vector<Commitment> expected = Element::batch_two_round_fold(srs, u1, u2);
    ASSERT_EQ(expected.size(), quarter);

    std::vector<Commitment> folded = srs;
    detail::two_round_fold_srs<Curve>(folded, u1, u2, block);

    expect_same_points(folded, expected, quarter);
    for (size_t i = quarter; i < 4 * quarter; ++i) {
        EXPECT_EQ(folded[i], srs[i]) << "untouched index " << i;
    }
}

class ConcurrencyGuard {
  public:
    ConcurrencyGuard() = default;
    ConcurrencyGuard(const ConcurrencyGuard&) = delete;
    ConcurrencyGuard(ConcurrencyGuard&&) = delete;
    ConcurrencyGuard& operator=(const ConcurrencyGuard&) = delete;
    ConcurrencyGuard& operator=(ConcurrencyGuard&&) = delete;
    ~ConcurrencyGuard() { set_parallel_for_concurrency(saved_); }

  private:
    size_t saved_ = get_num_cpus();
};
} // namespace

TEST(IpaSrsFold, BlockedFoldMatchesSingleCall)
{
    constexpr size_t block = 8;
    check_blocked_fold_matches_single_call(1, block);
    check_blocked_fold_matches_single_call(5, block);
    check_blocked_fold_matches_single_call(block, block);
    check_blocked_fold_matches_single_call(block + 1, block);
    check_blocked_fold_matches_single_call(4 * block, block);
    check_blocked_fold_matches_single_call(61, block);
}

TEST(IpaSrsFold, DefaultBlockMatchesSingleCall)
{
    check_blocked_fold_matches_single_call(64, detail::SRS_FOLD_BLOCK);
}

TEST(IpaSrsFold, DefaultBlockJustAboveOneBlockMatchesSingleCall)
{
    check_blocked_fold_matches_single_call(detail::SRS_FOLD_BLOCK + 1, detail::SRS_FOLD_BLOCK);
}

// The first fold of a Grumpkin IPA opening, whose only size is 2^CONST_ECCVM_LOG_N points.
TEST(IpaSrsFold, DefaultBlockAtTheFirstProductionFoldMatchesSingleCall)
{
    check_blocked_fold_matches_single_call((size_t{ 1 } << CONST_ECCVM_LOG_N) / 4, detail::SRS_FOLD_BLOCK);
}

#ifndef NO_MULTITHREADING
// batch_two_round_fold splits its batched inversions by thread ranges, so the split differs between thread counts.
TEST(IpaSrsFold, SameResultAtDifferentThreadCounts)
{
    constexpr size_t quarter = 100;
    const std::vector<Commitment> srs = random_points(4 * quarter);
    const Fr u1 = random_127_bit_challenge();
    const Fr u2 = random_127_bit_challenge();
    const std::vector<Commitment> expected = Element::batch_two_round_fold(srs, u1, u2);

    for (const size_t block : { size_t{ 32 }, detail::SRS_FOLD_BLOCK }) {
        SCOPED_TRACE(testing::Message() << "block " << block);
        std::vector<Commitment> one_thread = srs;
        std::vector<Commitment> five_threads = srs;
        {
            const ConcurrencyGuard guard;
            set_parallel_for_concurrency(1);
            detail::two_round_fold_srs<Curve>(one_thread, u1, u2, block);
            set_parallel_for_concurrency(5);
            detail::two_round_fold_srs<Curve>(five_threads, u1, u2, block);
        }
        expect_same_points(one_thread, five_threads, quarter);
        expect_same_points(one_thread, expected, quarter);
    }
}
#endif
