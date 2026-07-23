// Carry-less signed-Booth window recoding helpers.
//
// Each window is a c-bit signed digit in [-2^(c-1), 2^(c-1)], read as a (c+1)-bit
// slice that overlaps its lower neighbour by one bit; the shared boundary bit
// substitutes for an explicit carry. This is the algorithm Constantine calls
// `signedWindowEncoding` / `getSignedFullWindowAt`
// (constantine/math/arithmetic/bigints.nim).
//
#pragma once

#include "barretenberg/common/assert.hpp"
#include <array>
#include <cstddef>
#include <cstdint>

namespace bb::ecc::booth {

/**
 * @brief Per-window precomputed slice parameters for the carry-less signed-Booth
 *        window recoding. Read out by the per-(point, window) hot loop as two i32
 *        loads + a fixed bit-twiddle (no branches, no per-iter address arithmetic).
 *
 * `slice_localised_to_one_u64`: true iff every bit of the (c+1)-bit window lives
 * inside a single uint64 limb. Callers that have a single-load fast path branch on
 * this; callers that don't can ignore it (the field is one bool — zero cost).
 */
struct BoothSliceParams {
    uint32_t lo_mask;
    uint32_t hi_mask;
    uint32_t lo_limb;
    uint32_t hi_limb; // == lo_limb + 1, except clamped to last valid limb at the top window
    uint32_t lo_off;
    uint32_t lo_bits;
    bool slice_localised_to_one_u64;
};

/**
 * @brief Compute the Booth slice params for a window starting at absolute bit
 *        position `bit_offset`. The slice is `[bit_offset - 1, bit_offset + window_bits)`;
 *        the bit at `bit_offset - 1` is the shared boundary bit. The bottom window
 *        (`bit_offset == 0`) is encoded specially so the same recoding algebra
 *        applies — read "limb -1" as a zero-masked load.
 *
 *        `constexpr` so callers with compile-time window schedules
 *        (`element_impl`'s GLV-endo 32-window table) can materialise the param
 *        array at compile time, while runtime-schedule callers (Pippenger) use
 *        the checked wrapper at runtime.
 */
[[nodiscard]] constexpr BoothSliceParams compute_booth_slice_params_unchecked(size_t bit_offset,
                                                                              size_t window_bits,
                                                                              size_t num_uint64_limbs) noexcept
{
    constexpr size_t LIMB_BITS = 64;
    BoothSliceParams sp{};
    if (bit_offset == 0) {
        // Bottom window: the boundary bit below the LSB is a synthetic 0. Encode this by
        // reading "limb -1" as a zero-masked load (lo_mask = 0), then reading window_bits
        // bits from limb 0 into the hi side and shifting them left by 1. This puts the
        // window_bits-bit window at bits 1..window_bits with bit 0 = 0, matching the inner-
        // loop body used by every other window. Not localised — the synthetic-lookback
        // assembly only works in the slow path.
        sp.lo_limb = 0; // safe in-range, but masked to 0
        sp.hi_limb = 0; // = scalar limb 0
        sp.lo_off = LIMB_BITS - 1;
        sp.lo_bits = 1; // shifts hi_part left by 1, planting the window_bits-bit window at bits 1..window_bits
        sp.lo_mask = 0; // lo_part contributes nothing
        sp.hi_mask = (uint32_t{ 1 } << window_bits) - 1;
        sp.slice_localised_to_one_u64 = false;
    } else {
        const size_t lookback_bit = bit_offset - 1;
        const size_t bits_to_read = window_bits + 1;
        sp.lo_limb = static_cast<uint32_t>(lookback_bit / LIMB_BITS);
        sp.lo_off = static_cast<uint32_t>(lookback_bit & (LIMB_BITS - 1));
        sp.lo_bits = static_cast<uint32_t>(LIMB_BITS - sp.lo_off < bits_to_read ? LIMB_BITS - sp.lo_off : bits_to_read);
        const uint32_t hi_bits = static_cast<uint32_t>(bits_to_read) - sp.lo_bits;
        // window_bits+1 ≤ 32 for our windows ⇒ lo_bits ≤ 32 ⇒ mask fits in uint32.
        sp.lo_mask = (uint32_t{ 1 } << sp.lo_bits) - 1;
        // If the natural hi-limb read would land past the end of the scalar's storage,
        // clamp `hi_limb` to a safe in-range index and mask its contribution to zero. The
        // top window's hi_bits worth of bits are conceptually zero (scalar < 2^num_bits ≤
        // num_windows·window_bits). Re-reading lo_limb under a zero mask keeps the slow
        // path's two unconditional limb loads branch-free.
        if (static_cast<size_t>(sp.lo_limb) + 1 >= num_uint64_limbs) {
            sp.hi_limb = sp.lo_limb;
            sp.hi_mask = 0;
        } else {
            sp.hi_limb = sp.lo_limb + 1;
            sp.hi_mask = (uint32_t{ 1 } << hi_bits) - 1;
        }
        // Fast path: the full (window_bits+1)-bit window lives inside `lo_limb`. hi_bits == 0
        // captures both the in-limb case (window doesn't straddle a 64-bit boundary) and the
        // clamped top-window case (above) where hi_mask was forced to 0.
        sp.slice_localised_to_one_u64 = (hi_bits == 0);
    }
    return sp;
}

[[nodiscard]] inline BoothSliceParams compute_booth_slice_params(size_t bit_offset,
                                                                 size_t window_bits,
                                                                 size_t num_uint64_limbs) noexcept
{
    BB_ASSERT(window_bits + 1 <= 32, "Booth window_bits must fit in uint32_t masks");
    BB_ASSERT(num_uint64_limbs > 0, "Booth scalar limb count must be non-zero");
    return compute_booth_slice_params_unchecked(bit_offset, window_bits, num_uint64_limbs);
}

template <size_t NUM_WINDOWS, size_t WINDOW_BITS, size_t NUM_UINT64_LIMBS>
[[nodiscard]] constexpr std::array<BoothSliceParams, NUM_WINDOWS> make_booth_slice_params() noexcept
{
    static_assert(WINDOW_BITS + 1 <= 32);
    static_assert(NUM_UINT64_LIMBS > 0);

    std::array<BoothSliceParams, NUM_WINDOWS> sp{};
    for (size_t w = 0; w < NUM_WINDOWS; ++w) {
        sp[w] = compute_booth_slice_params_unchecked(w * WINDOW_BITS, WINDOW_BITS, NUM_UINT64_LIMBS);
    }
    return sp;
}

template <size_t NUM_WINDOWS, size_t WINDOW_BITS, size_t LOW_WINDOW_BITS, size_t NUM_UINT64_LIMBS>
[[nodiscard]] constexpr std::array<BoothSliceParams, NUM_WINDOWS> make_offset_booth_slice_params() noexcept
{
    static_assert(NUM_WINDOWS > 0);
    static_assert(WINDOW_BITS + 1 <= 32);
    static_assert(LOW_WINDOW_BITS + 1 <= 32);
    static_assert(NUM_UINT64_LIMBS > 0);

    std::array<BoothSliceParams, NUM_WINDOWS> sp{};
    sp[0] = compute_booth_slice_params_unchecked(0, LOW_WINDOW_BITS, NUM_UINT64_LIMBS);
    for (size_t w = 1; w < NUM_WINDOWS; ++w) {
        const size_t bit_offset = (w - 1) * WINDOW_BITS + LOW_WINDOW_BITS;
        sp[w] = compute_booth_slice_params_unchecked(bit_offset, WINDOW_BITS, NUM_UINT64_LIMBS);
    }
    return sp;
}

/**
 * @brief Read a (window_bits+1)-bit window from `s[]` (uint64 limbs) and apply Constantine's
 *        signedWindowEncoding to produce a `(sign | magnitude)` packed digit: bit 31 = sign
 *        (1 = negative), bits 0..30 = magnitude in [0, 2^(window_bits-1)]. Magnitude 0 means
 *        the window contributes nothing.
 *
 * @details Two unconditional limb loads; windows entirely inside one uint64 still work because
 *          `hi_mask == 0`, so `hi_part` vanishes without a branch.
 */
[[nodiscard]] [[gnu::always_inline]] inline uint32_t booth_packed_digit(const uint64_t* s,
                                                                        const BoothSliceParams& sp,
                                                                        size_t window_bits) noexcept
{
    const uint64_t s_lo = s[sp.lo_limb];
    const uint64_t s_hi = s[sp.hi_limb];
    const uint64_t lo_part = (s_lo >> sp.lo_off) & sp.lo_mask;
    const uint64_t hi_part = (s_hi & sp.hi_mask) << sp.lo_bits;
    // raw fits in window_bits+1 ≤ 32 bits, safe to narrow.
    const uint32_t raw = static_cast<uint32_t>(lo_part | hi_part);
    const uint32_t neg = (raw >> window_bits) & uint32_t{ 1 };
    const uint32_t neg_mask = uint32_t{ 0 } - neg;
    const uint32_t val_mask = (uint32_t{ 1 } << window_bits) - 1;
    const uint32_t encode = (raw + 1) >> 1;
    const uint32_t magnitude = ((encode + neg_mask) ^ neg_mask) & val_mask;
    return (neg << 31) | magnitude;
}

} // namespace bb::ecc::booth
