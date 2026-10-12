#include "barretenberg/polynomials/fold_stride2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <gtest/gtest.h>

#include <vector>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();

// Random coefficients with runs of bit-identical neighbour pairs (the fold's copy short-cut).
Polynomial<fr> random_poly(size_t size, size_t virtual_size, size_t start_index)
{
    Polynomial<fr> p(size, virtual_size, start_index);
    for (size_t i = start_index; i < start_index + size; ++i) {
        p.at(i) = ((i / 32) % 3 == 1 && i > start_index) ? p.at(i - 1) : fr::random_element(&engine);
    }
    return p;
}
} // namespace

// The fold (IFMA bulk on capable CPUs, scalar elsewhere) against the formula on virtual-zero-aware reads, for
// shiftable sources, odd extents, partial output ranges and the in-place case.
TEST(FoldStride2, MatchesFormula)
{
    const fr u = fr::random_element(&engine);
    for (const size_t start : { size_t{ 0 }, size_t{ 1 } }) {
        for (const size_t size : { size_t{ 7 }, size_t{ 64 }, size_t{ 255 }, size_t{ 1000 } }) {
            const size_t virtual_size = 2048;
            const Polynomial<fr> src = random_poly(size, virtual_size, start);
            const size_t limit = src.end_index();
            const size_t num_outputs = (limit / 2) + (limit % 2);
            for (const size_t begin : { size_t{ 0 }, size_t{ 3 } }) {
                if (begin >= num_outputs) {
                    continue;
                }
                Polynomial<fr> dst(num_outputs, virtual_size / 2);
                fold_stride2(src, dst, begin, num_outputs, u);
                for (size_t k = begin; k < num_outputs; ++k) {
                    EXPECT_EQ(dst[k], src[2 * k] + u * (src[2 * k + 1] - src[2 * k]))
                        << start << " " << size << " " << k;
                }
            }
            Polynomial<fr> expected(num_outputs, virtual_size / 2);
            fold_stride2(src, expected, 0, num_outputs, u);
            Polynomial<fr> copy(src);
            if (start == 0) {
                fold_stride2(copy, copy, 0, num_outputs, u);
                for (size_t k = 0; k < num_outputs; ++k) {
                    EXPECT_EQ(copy[k], expected[k]);
                }
            }
        }
    }
}

TEST(AddScaledBatch, MatchesSequentialAddScaled)
{
    const size_t n = 3000;
    std::vector<Polynomial<fr>> sources;
    std::vector<fr> scalars;
    for (size_t k = 0; k < 9; ++k) {
        const size_t start = (k * 37) % 300;
        const size_t size = n - start - ((k * 101) % 700);
        Polynomial<fr> p(size, n, start);
        for (size_t i = start; i < start + size; ++i) {
            // Zero stretches like selector columns.
            p.at(i) = (k % 3 == 0 && (i / 64) % 2 == 0) ? fr::zero() : fr::random_element(&engine);
        }
        sources.push_back(std::move(p));
        scalars.push_back(k == 0 ? fr::one() : fr::random_element(&engine));
    }
    Polynomial<fr> dst(n, n);
    for (size_t i = 0; i < n; ++i) {
        dst.at(i) = fr::random_element(&engine);
    }
    std::vector<fr> expected(n);
    for (size_t i = 0; i < n; ++i) {
        expected[i] = dst[i];
        for (size_t k = 0; k < sources.size(); ++k) {
            expected[i] += scalars[k] * sources[k][i];
        }
    }
    add_scaled_batch(dst, sources, std::span<const fr>(scalars));
    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ(dst[i], expected[i]) << i;
    }
}
