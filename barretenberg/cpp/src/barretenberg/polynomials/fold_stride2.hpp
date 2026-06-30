#pragma once

#include "barretenberg/ecc/fields/vector_field.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/vectorized_for.hpp"

#include <cstddef>

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
            const Vec even = Vec::from_lanes([&](size_t lane) { return src[2 * (k + lane)]; });
            const Vec odd = Vec::from_lanes([&](size_t lane) { return src[2 * (k + lane) + 1]; });
            dst[ContiguousVectorIndex<WIDTH>{ k }] = even + (odd - even) * challenge_vec;
        }
    }
#endif
    for (; k < end; ++k) {
        const Fr even = src[2 * k];
        dst[ScalarIndex{ k }] = even + challenge * (src[2 * k + 1] - even);
    }
}

} // namespace bb
