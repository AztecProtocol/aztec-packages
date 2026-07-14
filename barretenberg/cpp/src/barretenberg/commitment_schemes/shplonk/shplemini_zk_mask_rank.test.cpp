// Conformance test for the sparse Shplemini KZG masking support generator.
//
// The rank / zero-knowledge theorem (SHPLEMINI_ZK_MASKING.md, and the Lean
// formalization under shplemini_lean/) is stated about an abstract support S
// with a fixed contract: the tail-halving layout
//   {E-1, E-2, N/2, N/2-1, N/4, N/4-1, ..., 2, 1}
// of exactly min(2d, 2^d) distinct in-range entries, E = round_up(extent, 2).
// The proofs cannot observe the compiled C++ generator, so this test pins that
// the production `tail_halving_support()` actually emits that contract; a
// refactor that breaks it would silently invalidate the masking argument.

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

// At extent = N = 2^d the support is exactly the descending S used by the
// E = 2^d Lean theorem and the markdown proof, with no tail-fill.
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

// A non-dyadic extent rounds up to an even top pair and still meets the shape
// contract (distinct, in-range, full size).
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

} // namespace
} // namespace bb
