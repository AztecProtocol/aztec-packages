#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <algorithm>
#include <cstddef>
#include <unordered_set>
#include <vector>

namespace bb {

// Tail-halving support {E-1, E-2, N/2, N/2-1, N/4, N/4-1, ..., 2, 1} truncated
// or tail-filled to exactly min(2d, 2^d) entries, where N = 2^d and
// E = round_up(extent, 2). See SHPLEMINI_ZK_MASKING.md for the rank argument.
inline std::vector<size_t> tail_halving_support(size_t d, size_t extent)
{
    const size_t n = size_t{ 1 } << d;
    BB_ASSERT_GT(extent, 0U);
    BB_ASSERT_LTE(extent, n);
    const size_t E = std::min(n, ((extent % 2) == 0) ? extent : extent + 1);
    const size_t target = std::min(2 * d, n);

    std::unordered_set<size_t> seen;
    std::vector<size_t> support;
    support.reserve(target);
    const auto add = [&](size_t i) {
        if (i < n && seen.insert(i).second) {
            support.push_back(i);
        }
    };

    if (E >= 2) {
        add(E - 1);
        add(E - 2);
    }
    for (size_t level = 1; level < d; ++level) {
        const size_t base = n >> level;
        if (base == 0) {
            break;
        }
        add(base);
        if (base > 0) {
            add(base - 1);
        }
    }
    if (E > 0) {
        size_t i = E - 1;
        while (support.size() < target) {
            add(i);
            if (i == 0) {
                break;
            }
            --i;
        }
    }
    support.resize(std::min(support.size(), target));
    return support;
}

// Build the Gemini PCS masking polynomial as a sparse polynomial supported on
// the tail-halving layout. The polynomial has virtual size `dyadic_size`,
// physical buffer covering [min(S), max(S)+1), and 2d random scalars on the
// support entries (zero elsewhere).
template <typename FF> Polynomial<FF> build_sparse_masking_poly(size_t d, size_t extent, size_t dyadic_size)
{
    BB_ASSERT_EQ(dyadic_size, size_t{ 1 } << d);
    const auto support = tail_halving_support(d, extent);
    BB_ASSERT_GT(support.size(), 0U);

    const auto [min_it, max_it] = std::minmax_element(support.begin(), support.end());
    const size_t start = *min_it;
    const size_t length = (*max_it - start) + 1;

    Polynomial<FF> poly(length, dyadic_size, start);
    for (size_t s : support) {
        poly.at(s) = FF::random_element();
    }
    return poly;
}

} // namespace bb
