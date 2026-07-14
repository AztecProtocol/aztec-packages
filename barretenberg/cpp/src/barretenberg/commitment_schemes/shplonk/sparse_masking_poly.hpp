#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <algorithm>
#include <cstddef>
#include <unordered_set>
#include <vector>

namespace bb {

// Tail-halving support {E-1, E-2, N/2, N/2-1, N/4, N/4-1, ..., 2, 1}, de-duplicated
// and tail-filled to min(2d, N) distinct entries (N = 2^d, E = round_up(extent, 2)).
// See SHPLEMINI_ZK_MASKING.md for the rank argument.
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

    // `add` de-dups. The only collision is when the top-pair entry E-2 lands on the
    // level-1 anchor N/2, dropping one index; the tail-fill below then restores the
    // support to the 2d distinct points the rank argument needs.
    if (E >= 2) {
        add(E - 1);
        add(E - 2);
    }
    for (size_t level = 1; level < d; ++level) {
        const size_t base = n >> level;
        add(base);
        add(base - 1);
    }
    for (size_t i = E - 1; support.size() < target; --i) {
        add(i);
        if (i == 0) {
            break;
        }
    }
    return support;
}

// 2d random scalars on the tail-halving support, zero elsewhere, virtual size dyadic_size.
template <typename FF> Polynomial<FF> build_sparse_masking_poly(size_t d, size_t extent, size_t dyadic_size)
{
    BB_ASSERT_EQ(dyadic_size, size_t{ 1 } << d);
    const auto support = tail_halving_support(d, extent);
    BB_ASSERT_GT(support.size(), 0U);

    const size_t length = *std::ranges::max_element(support) + 1;
    Polynomial<FF> poly(length, dyadic_size, /*start_index=*/0);
    for (size_t s : support) {
        poly.at(s) = FF::random_element();
    }
    return poly;
}

// Below this log size the sparse rank argument does not apply (2d < N fails), so a
// dense random mask is used instead: unconditionally hiding and cheap at these sizes.
inline constexpr size_t SPARSE_MASKING_MIN_LOG_N = 4;

template <typename FF> Polynomial<FF> build_gemini_masking_poly(size_t d, size_t extent, size_t dyadic_size)
{
    if (d < SPARSE_MASKING_MIN_LOG_N) {
        return Polynomial<FF>::random(extent, dyadic_size, /*start_index=*/0);
    }
    return build_sparse_masking_poly<FF>(d, extent, dyadic_size);
}

} // namespace bb
