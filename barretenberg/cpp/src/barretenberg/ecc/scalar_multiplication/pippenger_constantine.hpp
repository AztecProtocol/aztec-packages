// Constantine-style signed-Booth window recoder for Pippenger MSM.
//
// Given a scalar s = sum_i s_i 2^i and a window [b, b + c), this module computes a
// signed digit d in [-(2^c - 1), 2^c - 1] such that the scalar can be reconstructed as
// s = sum_w d_w 2^{b_w}. It returns d as a packed `(sign | bucket)` value, where
// `bucket = |d|` and `sign` records whether d is negative.
//
// Implements the carry-less `signedWindowEncoding` / `getSignedFullWindowAt` pattern from
// `constantine/math/arithmetic/bigints.nim`: each window reads c+1 bits including the
// previous window boundary bit, lets that shared boundary bit substitute for an explicit
// carry, and produces a `(sign | bucket)` packed digit.
//
// Assumptions: production callers pass `window_bits` in [1, 19] and bit offsets within a
// 256-bit scalar. The bit-twiddling below assumes `window_bits < 32`.
//
// Two parallel paths:
//   * scalar path  — `ConstantineSliceParams` + `get_constantine_packed_digit` (uint64-
//     indexed limbs).
//   * SIMD x4 path — `ConstantineSliceParamsU32` + `store_constantine_packed_digits_x4_*`
//     (uint32-indexed limbs, processes 4 scalars per call via GCC vector_size).
//
// The SIMD helpers split on slice-path (Localised / Bottom / Boundary) so the per-window
// branch is hoisted out of the per-scalar loop. `classify_slice_path_u32` returns the
// matching enum for callers to dispatch on once per window.

#pragma once

#include "barretenberg/ecc/groups/booth_recode.hpp"

#include <cstddef>
#include <cstdint>

#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

namespace bb::scalar_multiplication::round_parallel_detail {

// Bring the shared signed-Booth slice primitive (from ecc/groups/booth_recode.hpp) into
// this namespace so the MSM-specific readers below can call it unqualified. The same
// primitive is also used by the GLV-endo straus path in element_impl.hpp; only the
// MSM-specific u32-indexed variant and perf-tuned packed-digit readers stay local.
using bb::ecc::booth::BoothSliceParams;
using bb::ecc::booth::compute_booth_slice_params;

// Backward-compat aliases for the MSM-local names; the canonical definitions live in
// ecc/groups/booth_recode.hpp and are pulled in by the using-declarations above.
using ConstantineSliceParams = BoothSliceParams;
[[nodiscard]] [[gnu::always_inline]] inline ConstantineSliceParams compute_constantine_slice_params(
    size_t bit_offset, size_t window_bits, size_t num_uint64_limbs) noexcept
{
    return compute_booth_slice_params(bit_offset, window_bits, num_uint64_limbs);
}

/**
 * @brief Read (window_bits+1) bits from `scalar_data` (uint64 limbs) using precomputed
 *        slice params and apply Constantine's signedWindowEncoding to produce a
 *        `(sign | bucket)` packed digit.
 *
 *        Takes the slice params as scalar value parameters rather than a struct reference
 *        so the compiler can keep them in registers across the caller loop.
 *
 *        `slice_localised_to_one_u64` selects the single-load fast path: ~75% of windows
 *        on typical 254-bit scalars (window_bits in [12, 19]) hit this.
 */
[[nodiscard]] [[gnu::always_inline]] inline uint32_t get_constantine_packed_digit(const uint64_t* scalar_data,
                                                                                  uint32_t lo_limb,
                                                                                  uint32_t hi_limb,
                                                                                  uint32_t lo_off,
                                                                                  uint32_t lo_bits,
                                                                                  uint32_t lo_mask,
                                                                                  uint32_t hi_mask,
                                                                                  bool slice_localised_to_one_u64,
                                                                                  size_t window_bits) noexcept
{
    uint64_t raw_wide = 0;
    if (slice_localised_to_one_u64) {
        // Fast path: one load + shift + mask. hi_part vanishes (hi_mask == 0); skip it.
        raw_wide = (scalar_data[lo_limb] >> lo_off) & lo_mask;
    } else if (lo_mask == 0) {
        // Bottom-window fast path: synthetic-zero lookback bit, so the lo_part contribution is
        // always 0 (lo_mask == 0). Skip the lo limb load entirely. lo_bits == 1 here, so the
        // shift plants the window_bits-bit slice at bits 1..window_bits with bit 0 = 0.
        // sp_lo_mask is loop-invariant within a window but is a runtime stack value, so the
        // compiler does NOT constant-fold the `(s_lo >> lo_off) & 0 = 0` path inside the
        // boundary branch; this explicit check saves ~3 ALU ops per scalar on the bottom window.
        raw_wide = (scalar_data[hi_limb] & hi_mask) << lo_bits;
    } else {
        // Slow path: window straddles a uint64 boundary.
        const uint64_t s_lo = scalar_data[lo_limb];
        const uint64_t s_hi = scalar_data[hi_limb];
        const uint64_t lo_part = (s_lo >> lo_off) & lo_mask;
        const uint64_t hi_part = (s_hi & hi_mask) << lo_bits;
        raw_wide = lo_part | hi_part;
    }
    // raw fits in window_bits+1 ≤ 32 bits, safe to narrow.
    const uint32_t raw = static_cast<uint32_t>(raw_wide);

    // signedWindowEncoding(raw, window_bits). raw fits in window_bits+1 bits; bit
    // `window_bits` is the sign indicator.
    //
    // The conditional-negate trick `((encode + neg_mask) ^ neg_mask)` is the standard
    // branchless idiom. We use the equivalent `(encode - neg) ^ neg_mask` to break the
    // latency chain: `encode - neg` and `neg_mask = -neg` can issue in parallel (both
    // depend only on `neg` / `encode`), whereas `encode + neg_mask` first waits for
    // `neg_mask` to materialise. Saves one cycle on the inner-loop critical path
    // (neg → neg_mask → +neg_mask → ^neg_mask → &val_mask vs neg → {neg_mask, enc_neg}
    // in parallel → ^neg_mask → &val_mask). Identical result by:
    //   neg=0: enc_neg = encode, xored = encode ^ 0 = encode. ✓
    //   neg=1: enc_neg = encode−1, xored = (encode−1) ^ −1 = ~(encode−1) = −encode. ✓
    const uint32_t neg = (raw >> window_bits) & uint32_t{ 1 };
    const uint32_t neg_mask = uint32_t{ 0 } - neg; // 0 or 0xFFFFFFFF
    const uint32_t val_mask = (uint32_t{ 1 } << window_bits) - 1;
    const uint32_t encode = (raw + 1) >> 1;
    const uint32_t bucket_idx = ((encode - neg) ^ neg_mask) & val_mask;

    // Pack into (sign | bucket): sign in bit 31, bucket magnitude in the low bits.
    return (neg << 31) | bucket_idx;
}

// 128-bit SIMD-friendly 4-wide variant of get_constantine_packed_digit. Computes 4 packed
// digits in parallel via GCC's vector_size extension, which lowers to native SIMD on x86
// (SSE2), ARM (NEON), and WASM (wasm-simd128). The branch on slice path is hoisted from
// the per-call site to the per-window outer loop, so callers select the localised / bottom /
// boundary specialisation once per window.
//
// We index the scalar via a `const uint32_t*` view rather than the natural `uint64_t*`:
// each lane is one uint32, so a 128-bit SIMD register holds 4 (raw, encode, bucket, …)
// values. `scalar.data` is a `std::array<uint64_t, 4>` whose byte layout is identical to
// `uint32_t[8]` on every target we ship to (x86 / ARM / WASM are all little-endian, and the
// codebase already assumes this layout in many places — `from_montgomery`, `uint256_t`,
// etc.). The reinterpret_cast is the same alias pattern.
//
// Returns the four packed digits in `out[0..3]`. The caller scatters them individually,
// since the consuming writes are not vectorisable. Switching from 2-wide uint64 to 4-wide
// uint32 doubles the compute throughput per SIMD instruction at the cost of slightly more
// straddle hits.
using SimdU32x4 = uint32_t __attribute__((vector_size(16)));

// Helpers return `SimdU32x4` directly so the v128 stays in the SIMD register file end-to-end.
// Wrapping in a 4-uint32 struct round-tripped the v128 through 4 scalar memory slots.

// uint32-indexed Constantine slice params, mirroring `ConstantineSliceParams` but with
// limb indices measured in 32-bit (rather than 64-bit) chunks. Computed once per window in
// `compute_constantine_slice_params_u32`; consumed by the SIMD x4 helpers below.
struct ConstantineSliceParamsU32 {
    uint32_t lo_mask;
    uint32_t hi_mask;
    uint32_t lo_limb; // u32 limb index of the lookback bit
    uint32_t hi_limb; // == lo_limb + 1, clamped to last in-range u32 limb at the top window
    uint32_t lo_off;  // bit-offset of the lookback bit within `lo_limb`
    uint32_t lo_bits; // # bits read from `lo_limb` (also acts as the hi_part left-shift amount)
    bool slice_localised_to_one_u32;
    bool is_bottom_window;
};

[[nodiscard]] inline ConstantineSliceParamsU32 compute_constantine_slice_params_u32(size_t bit_offset,
                                                                                    size_t window_bits,
                                                                                    size_t num_u32_limbs) noexcept
{
    constexpr size_t LIMB_BITS_U32 = 32;
    ConstantineSliceParamsU32 sp;
    if (bit_offset == 0) {
        sp.lo_limb = 0;
        sp.hi_limb = 0;
        sp.lo_off = LIMB_BITS_U32 - 1;
        sp.lo_bits = 1;
        sp.lo_mask = 0;
        sp.hi_mask = (uint32_t{ 1 } << window_bits) - 1;
        sp.slice_localised_to_one_u32 = false;
        sp.is_bottom_window = true;
    } else {
        const size_t lookback_bit = bit_offset - 1;
        const size_t bits_to_read = window_bits + 1;
        sp.lo_limb = static_cast<uint32_t>(lookback_bit / LIMB_BITS_U32);
        sp.lo_off = static_cast<uint32_t>(lookback_bit & (LIMB_BITS_U32 - 1));
        const uint32_t in_lo = static_cast<uint32_t>(LIMB_BITS_U32 - sp.lo_off);
        sp.lo_bits = (in_lo < static_cast<uint32_t>(bits_to_read)) ? in_lo : static_cast<uint32_t>(bits_to_read);
        const uint32_t hi_bits = static_cast<uint32_t>(bits_to_read) - sp.lo_bits;
        sp.lo_mask = (sp.lo_bits == LIMB_BITS_U32) ? ~uint32_t{ 0 } : ((uint32_t{ 1 } << sp.lo_bits) - 1);
        if (static_cast<size_t>(sp.lo_limb) + 1 >= num_u32_limbs) {
            sp.hi_limb = sp.lo_limb;
            sp.hi_mask = 0;
        } else {
            sp.hi_limb = sp.lo_limb + 1;
            sp.hi_mask = (uint32_t{ 1 } << hi_bits) - 1;
        }
        sp.slice_localised_to_one_u32 = (hi_bits == 0);
        sp.is_bottom_window = false;
    }
    return sp;
}

// Gather 4 disjoint uint32 values into one v128 via wasm v128.load32_lane. On WASM this
// is 1 splat + 3 load32_lane (4 ops); brace-init `{a, b, c, d}` with runtime values emits
// 4 scalar i32.load + 1 splat + 3 replace_lane (8 ops). On native it falls back to brace-
// init which clang lowers to NEON ins / SSE2 pinsrd.
[[nodiscard]] [[gnu::always_inline]] inline SimdU32x4 gather_x4_u32(
    const uint32_t* p0, const uint32_t* p1, const uint32_t* p2, const uint32_t* p3, uint32_t idx) noexcept
{
#ifdef __wasm_simd128__
    v128_t v = wasm_i32x4_splat(0);
    v = wasm_v128_load32_lane(p0 + idx, v, 0);
    v = wasm_v128_load32_lane(p1 + idx, v, 1);
    v = wasm_v128_load32_lane(p2 + idx, v, 2);
    v = wasm_v128_load32_lane(p3 + idx, v, 3);
    return reinterpret_cast<SimdU32x4>(v);
#else
    return SimdU32x4{ p0[idx], p1[idx], p2[idx], p3[idx] };
#endif
}

// Store a `SimdU32x4` to a 4-lane uint32 destination as a single 128-bit op.
// On WASM the explicit `wasm_v128_store` is used because earlier codegen for
// the equivalent struct-wrapper assignment was observed to round-trip the
// vector through 4 scalar memory slots; the intrinsic guarantees the
// `i32x4.store` opcode. On native we store via `memcpy`: `dst` is an arbitrary
// `uint32_t*` (only 4-byte aligned), but `SimdU32x4` carries 16-byte alignment,
// so `*reinterpret_cast<SimdU32x4*>(dst) = v` emits an alignment-requiring
// `movaps`/`movdqa` and segfaults whenever `dst` is not 16-byte aligned (e.g. a
// `std::array<uint32_t, 4>` on the stack). `memcpy` lowers to the intended
// unaligned `movdqu` / NEON `st1` with no alignment precondition.
[[gnu::always_inline]] inline void simd_u32x4_store(uint32_t* dst, SimdU32x4 v) noexcept
{
#ifdef __wasm_simd128__
    wasm_v128_store(dst, reinterpret_cast<v128_t>(v));
#else
    __builtin_memcpy(dst, &v, sizeof(v));
#endif
}

// All four mask / constant v128s (lo_mask_v, hi_mask_v, one_v, val_mask) are loop-invariant
// within a window. Callers build them ONCE per window in the outer-w loop and pass them in,
// so the inner-i compute loop has zero v128.const / splat / shl+sub for the masks.
// `neg_mask = -neg` uses GCC vector-ext unary minus which lowers to `i32x4.neg` on WASM.
//
// Helpers write the v128 result directly into the caller-provided 4-lane destination buffer.
[[gnu::always_inline]] inline void store_constantine_packed_digits_x4_localised(uint32_t* dst,
                                                                                const uint32_t* scalar_data_0,
                                                                                const uint32_t* scalar_data_1,
                                                                                const uint32_t* scalar_data_2,
                                                                                const uint32_t* scalar_data_3,
                                                                                uint32_t lo_limb,
                                                                                uint32_t lo_off,
                                                                                SimdU32x4 lo_mask_v,
                                                                                SimdU32x4 one_v,
                                                                                SimdU32x4 val_mask,
                                                                                uint32_t window_bits) noexcept
{
    const SimdU32x4 lo = gather_x4_u32(scalar_data_0, scalar_data_1, scalar_data_2, scalar_data_3, lo_limb);
    const SimdU32x4 raw = (lo >> lo_off) & lo_mask_v;
    const SimdU32x4 neg = (raw >> window_bits) & one_v;
    const SimdU32x4 neg_mask = -neg;
    const SimdU32x4 encode = (raw + one_v) >> 1;
    const SimdU32x4 bucket = ((encode - neg) ^ neg_mask) & val_mask;
    const SimdU32x4 packed = (neg << 31) | bucket;
    simd_u32x4_store(dst, packed);
}

[[gnu::always_inline]] inline void store_constantine_packed_digits_x4_bottom(uint32_t* dst,
                                                                             const uint32_t* scalar_data_0,
                                                                             const uint32_t* scalar_data_1,
                                                                             const uint32_t* scalar_data_2,
                                                                             const uint32_t* scalar_data_3,
                                                                             uint32_t hi_limb,
                                                                             uint32_t lo_bits,
                                                                             SimdU32x4 hi_mask_v,
                                                                             SimdU32x4 one_v,
                                                                             SimdU32x4 val_mask,
                                                                             uint32_t window_bits) noexcept
{
    const SimdU32x4 hi = gather_x4_u32(scalar_data_0, scalar_data_1, scalar_data_2, scalar_data_3, hi_limb);
    const SimdU32x4 raw = (hi & hi_mask_v) << lo_bits;
    const SimdU32x4 neg = (raw >> window_bits) & one_v;
    const SimdU32x4 neg_mask = -neg;
    const SimdU32x4 encode = (raw + one_v) >> 1;
    const SimdU32x4 bucket = ((encode - neg) ^ neg_mask) & val_mask;
    const SimdU32x4 packed = (neg << 31) | bucket;
    simd_u32x4_store(dst, packed);
}

[[gnu::always_inline]] inline void store_constantine_packed_digits_x4_boundary(uint32_t* dst,
                                                                               const uint32_t* scalar_data_0,
                                                                               const uint32_t* scalar_data_1,
                                                                               const uint32_t* scalar_data_2,
                                                                               const uint32_t* scalar_data_3,
                                                                               uint32_t lo_limb,
                                                                               uint32_t hi_limb,
                                                                               uint32_t lo_off,
                                                                               uint32_t lo_bits,
                                                                               SimdU32x4 lo_mask_v,
                                                                               SimdU32x4 hi_mask_v,
                                                                               SimdU32x4 one_v,
                                                                               SimdU32x4 val_mask,
                                                                               uint32_t window_bits) noexcept
{
    const SimdU32x4 lo = gather_x4_u32(scalar_data_0, scalar_data_1, scalar_data_2, scalar_data_3, lo_limb);
    const SimdU32x4 hi = gather_x4_u32(scalar_data_0, scalar_data_1, scalar_data_2, scalar_data_3, hi_limb);
    const SimdU32x4 lo_part = (lo >> lo_off) & lo_mask_v;
    const SimdU32x4 hi_part = (hi & hi_mask_v) << lo_bits;
    const SimdU32x4 raw = lo_part | hi_part;
    const SimdU32x4 neg = (raw >> window_bits) & one_v;
    const SimdU32x4 neg_mask = -neg;
    const SimdU32x4 encode = (raw + one_v) >> 1;
    const SimdU32x4 bucket = ((encode - neg) ^ neg_mask) & val_mask;
    const SimdU32x4 packed = (neg << 31) | bucket;
    simd_u32x4_store(dst, packed);
}

// Path-selector enum used to dispatch on the SIMD specialisation once per window rather
// than once per scalar.
enum class ConstantineSlicePath : uint8_t {
    Localised = 0,
    Bottom = 1,
    Boundary = 2,
};

[[nodiscard]] [[gnu::always_inline]] inline ConstantineSlicePath classify_slice_path_u32(
    const ConstantineSliceParamsU32& sp) noexcept
{
    if (sp.is_bottom_window) {
        return ConstantineSlicePath::Bottom;
    }
    if (sp.slice_localised_to_one_u32) {
        return ConstantineSlicePath::Localised;
    }
    return ConstantineSlicePath::Boundary;
}

} // namespace bb::scalar_multiplication::round_parallel_detail
