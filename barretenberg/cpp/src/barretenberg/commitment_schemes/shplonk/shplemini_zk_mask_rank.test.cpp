// Checks that tail_halving_support() produces the exact support assumed by the
// Shplemini ZK masking argument (SHPLEMINI_ZK_MASKING.md): the tail-halving
// layout
//   {E-1, E-2, N/2, N/2-1, N/4, N/4-1, ..., 2, 1}
// of exactly min(2d, 2^d) distinct in-range entries, E = round_up(extent, 2).
// The masking argument is proved over this support, so the generator must match
// it for the zero-knowledge property to hold.

#include "barretenberg/commitment_schemes/shplonk/sparse_masking_poly.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <gtest/gtest.h>
#include <unordered_set>
#include <vector>

namespace bb {
namespace {

constexpr std::array<size_t, 4> kDValues = { 4, 8, 11, 12 };

// Distinct, in-range, and exactly min(2d, 2^d) entries.
TEST(ShpleminiZkMaskSupport, ShapeContract)
{
    for (size_t d : kDValues) {
        const size_t n = size_t{ 1 } << d;
        const auto support = tail_halving_support(d, n);
        const size_t expected_size = std::min(2 * d, n);

        EXPECT_EQ(support.size(), expected_size) << "support size at d=" << d;

        std::unordered_set<size_t> seen(support.begin(), support.end());
        EXPECT_EQ(seen.size(), support.size()) << "duplicate support entry at d=" << d;
        for (size_t s : support) {
            EXPECT_LT(s, n) << "out-of-range support entry at d=" << d;
        }
    }
}

// Contains the top pair {E-1, E-2} and every dyadic halving pair that fits.
TEST(ShpleminiZkMaskSupport, ContainsTailHalvingPairs)
{
    for (size_t d : kDValues) {
        const size_t n = size_t{ 1 } << d;
        const auto support = tail_halving_support(d, n); // extent = n => E = N.
        const std::unordered_set<size_t> seen(support.begin(), support.end());

        // Top pair at E = N.
        EXPECT_TRUE(seen.count(n - 1)) << "missing top entry N-1 at d=" << d;
        EXPECT_TRUE(seen.count(n - 2)) << "missing top entry N-2 at d=" << d;

        // Dyadic halving pairs {N/2^level, N/2^level - 1}, as far as 2d allows.
        for (size_t level = 1; level < d; ++level) {
            const size_t base = n >> level;
            EXPECT_TRUE(seen.count(base)) << "missing dyadic entry " << base << " at d=" << d;
            EXPECT_TRUE(seen.count(base - 1)) << "missing dyadic entry " << (base - 1) << " at d=" << d;
        }
    }
}

// At extent = N = 2^d the support is exactly the descending S proved in
// SHPLEMINI_ZK_MASKING.md, with no tail-fill.
TEST(ShpleminiZkMaskSupport, ExactDescendingSupportAtFullExtent)
{
    for (size_t d : kDValues) {
        const size_t n = size_t{ 1 } << d;
        std::vector<size_t> expected = { n - 1, n - 2 };
        for (size_t level = 1; level < d; ++level) {
            const size_t base = n >> level;
            expected.push_back(base);
            expected.push_back(base - 1);
        }
        ASSERT_EQ(expected.size(), std::min(2 * d, n)) << "expected support size at d=" << d;

        EXPECT_EQ(tail_halving_support(d, n), expected) << "descending support mismatch at d=" << d;
    }
}

// A non-dyadic extent rounds up to an even top pair and is still distinct,
// in-range, and full size.
TEST(ShpleminiZkMaskSupport, OddExtentRoundsUp)
{
    const size_t d = 8;
    const size_t n = size_t{ 1 } << d;
    const size_t extent = (n / 2) + 5; // odd, in the upper half.
    const auto support = tail_halving_support(d, extent);
    const size_t E = extent + 1; // round_up to even.

    const std::unordered_set<size_t> seen(support.begin(), support.end());
    EXPECT_EQ(support.size(), std::min(2 * d, n));
    EXPECT_EQ(seen.size(), support.size());
    EXPECT_TRUE(seen.count(E - 1)) << "missing rounded-up top entry E-1";
    EXPECT_TRUE(seen.count(E - 2)) << "missing rounded-up top entry E-2";
}

// At extent E = N/2 + 2 the top entry E-2 lands on N/2, so the raw list has a
// duplicate. The support must still come out with min(2d, N) distinct in-range
// entries: the distinctness check fails if de-dup is dropped, the size check
// fails if the tail-fill does not refill the dropped slot.
TEST(ShpleminiZkMaskSupport, CollisionExtentStaysFull)
{
    for (size_t d : kDValues) {
        const size_t n = size_t{ 1 } << d;
        const size_t extent = (n / 2) + 2; // E = N/2 + 2, the only collision.
        const auto support = tail_halving_support(d, extent);

        const std::unordered_set<size_t> seen(support.begin(), support.end());
        EXPECT_EQ(support.size(), std::min(2 * d, n)) << "size at d=" << d;
        EXPECT_EQ(seen.size(), support.size()) << "duplicate support entry at d=" << d;
        for (size_t s : support) {
            EXPECT_LT(s, n) << "out-of-range support entry at d=" << d;
        }
    }
}

// The fallback boundary: at d = 3 the mask is dense (n nonzeros), at d = 4 it
// switches to sparse (2d nonzeros). d = 3 is the smallest size where dense and
// sparse differ (at d < 3, min(2d, N) == N, so both fill the whole buffer and a
// nonzero count cannot tell them apart).
TEST(ShpleminiZkMaskSupport, DenseMaskBelowSparseThreshold)
{
    // Coefficients outside [start_index, end_index) are virtually zero by construction.
    const auto count_nonzero = [](const auto& poly) {
        size_t nonzero = 0;
        for (size_t i = poly.start_index(); i < poly.end_index(); ++i) {
            if (!poly.at(i).is_zero()) {
                ++nonzero;
            }
        }
        return nonzero;
    };

    // d = 3 (< threshold): dense fills all n; the sparse mask would use only 2d = 6.
    const size_t n3 = size_t{ 1 } << 3;
    EXPECT_EQ(count_nonzero(build_gemini_masking_poly<fr>(3, n3, n3)), n3) << "expected dense mask at d=3";

    // d >= threshold: sparse mask with min(2d, N) coefficients (dense would fill N).
    for (size_t d : { size_t{ 4 }, size_t{ 8 } }) {
        const size_t n = size_t{ 1 } << d;
        const auto poly = build_gemini_masking_poly<fr>(d, /*extent=*/n, /*dyadic_size=*/n);
        EXPECT_EQ(count_nonzero(poly), std::min(2 * d, n)) << "expected sparse mask at d=" << d;
    }
}

} // namespace
} // namespace bb
