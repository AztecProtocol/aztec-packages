#pragma once

#include "barretenberg/ecc/fields/ifma_field.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"
#include "barretenberg/ecc/fields/vectorized_for.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <utility>

namespace bb {

/**
 * @brief Stride-2 linear-interpolation fold: `dst[k] = src[2k] + challenge * (src[2k+1] - src[2k])`
 *        for every output index `k` in `[begin, end)`.
 *
 * @details This is the shared kernel behind two call sites that compute the same thing:
 * `Sumcheck::partially_evaluate` (fold a multilinear's lowest variable at the round challenge) and
 * `GeminiProver::compute_fold_polynomials` (the PCS fold). Each output reads the adjacent source pair
 * `(2k, 2k+1)`; the write region `[begin, end)` is contiguous.
 *
 * All buffer access goes through `Polynomial`'s index-token overloads, so there is no raw pointer
 * arithmetic or `start_index` book-keeping here:
 *  - Reads use the scalar `operator[]` (`get`), which returns the virtual zero for indices outside
 *    `[start_index, end_index)`. Shiftable polynomials (`start_index > 0`) therefore need no special
 *    prefix handling -- the leading virtual slots read back as zero.
 *  - The WASM SIMD path packs `WIDTH` even/odd lanes via `VectorField::from_lanes` (the counterpart to
 *    `gather` for non-flat sources). The even/odd source indices are strided, so the contiguous-load
 *    primitive does not apply; `from_lanes` matches the per-lane cost of `gather` while staying
 *    virtual-zero-safe. The result stores through the `ContiguousVectorIndex` write-proxy
 *    (`VectorField::store_to`), which translates `start_index` internally.
 *  - The scalar loop is both the SIMD remainder tail and the entire native / non-SIMD-`Fr` path.
 *
 * Aliasing (`src` aliases `dst`, as in `partially_evaluate_in_place`): output `k` overwrites source
 * slot `k`, while iteration `k` reads `2k`/`2k+1` and every later iteration reads indices `>= 2k`.
 * Each SIMD iteration fully materializes its reads (`from_lanes` returns by value) before the store, so
 * the in-place overwrite of the lower half is safe.
 *
 * @note `dst` must be writable over `[begin, end)`; reads of `src` at index `2k`/`2k+1` are answered by
 * `get`, so out-of-extent reads yield zero rather than UB.
 */
template <typename Fr>
void fold_stride2(
    const Polynomial<Fr>& src, Polynomial<Fr>& dst, const size_t begin, const size_t end, const Fr& challenge)
{
    size_t k = begin;
#if defined(__wasm_simd128__)
    if constexpr (simd_supported_v<Fr>) {
        constexpr size_t WIDTH = VECTOR_FIELD_WIDTH;
        using Vec = VectorField<typename Fr::Params>;
        const Vec challenge_vec = Vec::broadcast(challenge);
        for (; k + WIDTH <= end; k += WIDTH) {
            // A block whose WIDTH source pairs are all bit-identical (constant selector runs, zero padding) folds to
            // the even values; copy them instead of packing and multiplying.
            if (2 * k >= src.start_index() && 2 * (k + WIDTH) <= src.end_index()) {
                const Fr* pairs = src.data() + (2 * k - src.start_index());
                uint64_t diff = 0;
                for (size_t j = 0; j < 2 * WIDTH; j += 2) {
                    diff |= (pairs[j].data[0] ^ pairs[j + 1].data[0]) | (pairs[j].data[1] ^ pairs[j + 1].data[1]) |
                            (pairs[j].data[2] ^ pairs[j + 1].data[2]) | (pairs[j].data[3] ^ pairs[j + 1].data[3]);
                }
                if (diff == 0) {
                    std::array<Fr, WIDTH> evens;
                    for (size_t lane = 0; lane < WIDTH; ++lane) {
                        evens[lane] = pairs[2 * lane];
                    }
                    for (size_t lane = 0; lane < WIDTH; ++lane) {
                        dst[ScalarIndex{ k + lane }] = evens[lane];
                    }
                    continue;
                }
            }
            const Vec even = Vec::from_lanes([&](size_t lane) { return src[2 * (k + lane)]; });
            const Vec odd = Vec::from_lanes([&](size_t lane) { return src[2 * (k + lane) + 1]; });
            dst[ContiguousVectorIndex<WIDTH>{ k }] = even + (odd - even) * challenge_vec;
        }
    }
#endif
    const auto fold_scalar = [&](const size_t from, const size_t to) {
        for (size_t i = from; i < to; ++i) {
            const Fr even = src[2 * i];
            const Fr odd = src[2 * i + 1];
            // Equal neighbours (constant selector runs, zero padding inside the active extent) fold to themselves, so
            // skip the multiplication. Only bit-identical representations are short-cut.
            if (even.data[0] == odd.data[0] && even.data[1] == odd.data[1] && even.data[2] == odd.data[2] &&
                even.data[3] == odd.data[3]) {
                dst[ScalarIndex{ i }] = even;
            } else {
                dst[ScalarIndex{ i }] = even + challenge * (odd - even);
            }
        }
    };
#ifdef BB_FIELD_IFMA
    // AVX-512 IFMA bulk over the outputs whose source pairs and destination lie inside the backing memory; the
    // virtual-zero prefix and the tail keep the scalar loop. Outputs are produced in increasing k as in the scalar
    // loop, which keeps the in-place case (src aliasing dst) safe.
    if constexpr (field_ifma::Consts<typename Fr::Params>::supported) {
        if (field_ifma::available()) {
            const size_t bulk_begin = std::min(end, std::max({ k, (src.start_index() + 1) / 2, dst.start_index() }));
            const size_t bulk_limit = std::max(bulk_begin, std::min({ end, src.end_index() / 2, dst.end_index() }));
            const size_t bulk_end = bulk_begin + ((bulk_limit - bulk_begin) & ~size_t{ 7 });
            if (bulk_end > bulk_begin) {
                fold_scalar(k, bulk_begin);
                field_ifma::fold_stride2<typename Fr::Params>(&src.data()[(2 * bulk_begin) - src.start_index()].data[0],
                                                              &dst.data()[bulk_begin - dst.start_index()].data[0],
                                                              bulk_end - bulk_begin,
                                                              &challenge.data[0]);
                k = bulk_end;
            }
        }
    }
#endif
    fold_scalar(k, end);
}

/**
 * @brief Backed range [⌊start/2⌋, ⌈end/2⌉) of the fold of a polynomial backed on [start, end); empty if the source is.
 */
template <typename Fr> std::pair<size_t, size_t> folded_backed_range(const Polynomial<Fr>& src)
{
    if (src.size() == 0) {
        return { 0, 0 };
    }
    return { src.start_index() / 2, (src.end_index() / 2) + (src.end_index() % 2) };
}

/**
 * @brief Fold `src` at `challenge` over its whole support: writes `dst[k]` for k in `folded_backed_range(src)`.
 * @details `dst` is either a distinct polynomial backed on a range that starts at the folded start and covers the
 * folded end (its end index is shrunk to the folded end), or `src` itself. In the in-place case the backed range is
 * moved down to the folded range over the same buffer: output k is stored at offset k - ⌊start/2⌋ while iteration k
 * reads offsets 2k - start and 2k + 1 - start, and k - ⌊start/2⌋ < 2k - start + 2 for every k >= ⌊start/2⌋, so no
 * output overwrites a source slot a later iteration still reads.
 */
template <typename Fr> void fold_stride2_backed(const Polynomial<Fr>& src, Polynomial<Fr>& dst, const Fr& challenge)
{
    const auto [begin, end] = folded_backed_range(src);
    if (&src == &dst) {
        const Polynomial<Fr> source = src.share();
        dst.rebase_backed_range(begin, end);
        fold_stride2(source, dst, begin, end, challenge);
        return;
    }
    if (begin == end) {
        return;
    }
    fold_stride2(src, dst, begin, end, challenge);
    dst.shrink_end_index(end);
}

} // namespace bb
