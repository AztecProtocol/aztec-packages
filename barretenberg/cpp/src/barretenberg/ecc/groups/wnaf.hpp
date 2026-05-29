// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include <cstdint>

// NOLINTBEGIN(readability-implicit-bool-conversion)

/**
 * @brief Fixed-window non-adjacent form (WNAF) scalar decomposition for elliptic curve scalar multiplication.
 *
 * @details WNAF decomposes a scalar into a sequence of odd signed digits in the range [-(2^w - 1), 2^w - 1],
 * where w = wnaf_bits. Each digit is packed into a uint64_t entry with the following bit layout:
 *
 *     Bit 63                 32   31   30                   0
 *    ┌────────────────────────┬────┬──────────────────────────┐
 *    │      point_index       │sign│     table_index          │
 *    └────────────────────────┴────┴──────────────────────────┘
 *
 *    - table_index (bits 0-30):  abs(digit) >> 1.  Since all digits are odd, the absolute value is always
 *                                2*k + 1 for some k, so table_index = k. This directly indexes a precomputed
 *                                lookup table of odd multiples [1·P, 3·P, 5·P, ...].
 *                                In the Pippenger MSM path, this is the bucket index that determines which
 *                                bucket the point is accumulated into.
 *    - sign (bit 31):           0 = positive digit, 1 = negative digit (negate the point's y-coordinate).
 *    - point_index (bits 32-63): identifies which input point this entry refers to. In single-scalar
 *                                multiplication this is 0. In multi-scalar multiplication (Pippenger),
 *                                this records which of the N input points the entry belongs to, since the
 *                                schedule is later sorted by bucket and the original point ordering is lost.
 *
 * The template `wnaf_round` / `fixed_wnaf` variants shift point_index into bits 32+ internally.
 * The runtime `fixed_wnaf` variant expects the caller to pass point_index pre-shifted.
 */
namespace bb::wnaf {
constexpr size_t SCALAR_BITS = 127;

#define WNAF_SIZE(x) ((bb::wnaf::SCALAR_BITS + (x) - 1) / (x)) // NOLINT(cppcoreguidelines-macro-usage)

/**
 * @brief Extract a window of `bits` consecutive bits starting at `bit_position` from a 128-bit scalar.
 *
 * @tparam bits The number of bits in the window (0 returns 0).
 * @tparam bit_position The starting bit index within the 128-bit scalar.
 * @param scalar Pointer to a 128-bit scalar stored as two consecutive uint64_t limbs (little-endian word order).
 * @return The integer value of the extracted bit window.
 *
 * @details We determine which 64-bit limb(s) the window touches by computing
 *   lo_limb_idx = bit_position / 64  and  hi_limb_idx = (bit_position + bits - 1) / 64.
 * For the low limb, we right-shift by (bit_position % 64) to align the desired bits to position 0.
 * If the window fits entirely within one limb (lo_limb_idx == hi_limb_idx), we simply mask off `bits` bits.
 * Otherwise, the window straddles two limbs: we left-shift the high limb by (64 - bit_position % 64) to place
 * its contributing bits adjacent to the low limb's bits, OR them together, and then mask to `bits` bits.
 */

template <size_t bits, size_t bit_position> inline uint64_t get_wnaf_bits_const(const uint64_t* scalar) noexcept
{
    if constexpr (bits == 0) {
        return 0ULL;
    } else {
        constexpr size_t lo_limb_idx = bit_position / 64;
        constexpr size_t hi_limb_idx = (bit_position + bits - 1) / 64;
        constexpr uint64_t lo_shift = bit_position & 63UL;
        constexpr uint64_t bit_mask = (1UL << static_cast<uint64_t>(bits)) - 1UL;

        uint64_t lo = (scalar[lo_limb_idx] >> lo_shift);
        if constexpr (lo_limb_idx == hi_limb_idx) {
            return lo & bit_mask;
        } else {
            constexpr uint64_t hi_shift = 64UL - (bit_position & 63UL);
            uint64_t hi = ((scalar[hi_limb_idx] << (hi_shift)));
            return (lo | hi) & bit_mask;
        }
    }
}

/**
 * @brief A variant of the previous function that the bit position and number of bits are provided at runtime.
 *
 * @param scalar Pointer to a 128-bit scalar stored as two consecutive uint64_t limbs (little-endian word order).
 * @param bits The number of bits in the window (0 returns 0).
 * @param bit_position The starting bit index within the 128-bit scalar.
 * @return The integer value of the extracted bit window.
 */
inline uint64_t get_wnaf_bits(const uint64_t* scalar, const uint64_t bits, const uint64_t bit_position) noexcept
{
    const auto lo_limb_idx = static_cast<size_t>(bit_position >> 6);
    const auto hi_limb_idx = static_cast<size_t>((bit_position + bits - 1) >> 6);
    const uint64_t lo_shift = bit_position & 63UL;
    const uint64_t bit_mask = (1UL << static_cast<uint64_t>(bits)) - 1UL;
    const bool spans_limbs = (lo_limb_idx != hi_limb_idx);

    const uint64_t lo = scalar[lo_limb_idx] >> lo_shift;
    // spans_limbs is true only when bit_position is not aligned to a limb boundary, so lo_shift > 0
    // and 64 - lo_shift ∈ [1, 63]. (If lo_shift were 0, 64 - lo_shift = 64 would be UB on uint64_t.)
    const uint64_t hi = spans_limbs ? (scalar[hi_limb_idx] << (64UL - lo_shift)) : 0UL;

    return (lo | hi) & bit_mask;
}

/**
 * @brief Recursive WNAF round for a fixed 127-bit scalar (SCALAR_BITS).
 *
 * @details Processes one window per recursive call, using compile-time unrolling via `round_i`.
 * Uses the runtime `get_wnaf_bits` for bit extraction. The WNAF output array is interleaved:
 * entry for round `r` is stored at index `(wnaf_entries - r) << log2(num_points)`, so that
 * entries for the same round across different points are contiguous for cache locality.
 * Each entry packs: bits [0..30] = lookup table index, bit 31 = sign, bits [32..63] = point_index.
 */
template <size_t num_points, size_t wnaf_bits, size_t round_i>
inline void wnaf_round(uint64_t* scalar, uint64_t* wnaf, const uint64_t point_index, const uint64_t previous) noexcept
{
    constexpr size_t wnaf_entries = (SCALAR_BITS + wnaf_bits - 1) / wnaf_bits;
    constexpr auto log2_num_points = static_cast<size_t>(numeric::get_msb(static_cast<uint32_t>(num_points)));

    if constexpr (round_i < wnaf_entries - 1) {
        uint64_t slice = get_wnaf_bits(scalar, wnaf_bits, round_i * wnaf_bits);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[(wnaf_entries - round_i) << log2_num_points] =
            ((((previous - (predicate << wnaf_bits)) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
            (point_index << 32UL);
        wnaf_round<num_points, wnaf_bits, round_i + 1>(scalar, wnaf, point_index, slice + predicate);
    } else {
        constexpr size_t final_bits = SCALAR_BITS - (SCALAR_BITS / wnaf_bits) * wnaf_bits;
        uint64_t slice = get_wnaf_bits(scalar, final_bits, (wnaf_entries - 1) * wnaf_bits);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[num_points] =
            ((((previous - (predicate << wnaf_bits)) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
            (point_index << 32UL);
        wnaf[0] = ((slice + predicate) >> 1UL) | (point_index << 32UL);
    }
}

/**
 * @brief Recursive WNAF round for an arbitrary-width scalar.
 *
 * @details Same algorithm as the SCALAR_BITS overload above, but parametrized by `scalar_bits` so it can
 * handle scalars of any bit width (e.g., after an endomorphism split produces shorter scalars).
 * Uses the compile-time `get_wnaf_bits_const` for bit extraction since all parameters are template constants.
 * Correctly handles the edge case where `scalar_bits` is an exact multiple of `wnaf_bits` (the final
 * window is a full `wnaf_bits` wide rather than the remainder).
 */
template <size_t scalar_bits, size_t num_points, size_t wnaf_bits, size_t round_i>
inline void wnaf_round(uint64_t* scalar, uint64_t* wnaf, const uint64_t point_index, const uint64_t previous) noexcept
{
    constexpr size_t wnaf_entries = (scalar_bits + wnaf_bits - 1) / wnaf_bits;
    constexpr auto log2_num_points = static_cast<uint64_t>(numeric::get_msb(static_cast<uint32_t>(num_points)));

    if constexpr (round_i < wnaf_entries - 1) {
        uint64_t slice = get_wnaf_bits_const<wnaf_bits, round_i * wnaf_bits>(scalar);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[(wnaf_entries - round_i) << log2_num_points] =
            ((((previous - (predicate << wnaf_bits)) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
            (point_index << 32UL);
        wnaf_round<scalar_bits, num_points, wnaf_bits, round_i + 1>(scalar, wnaf, point_index, slice + predicate);
    } else {
        constexpr size_t final_bits = ((scalar_bits / wnaf_bits) * wnaf_bits == scalar_bits)
                                          ? wnaf_bits
                                          : scalar_bits - (scalar_bits / wnaf_bits) * wnaf_bits;
        uint64_t slice = get_wnaf_bits_const<final_bits, (wnaf_entries - 1) * wnaf_bits>(scalar);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[num_points] =
            ((((previous - (predicate << wnaf_bits)) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
            (point_index << 32UL);
        wnaf[0] = ((slice + predicate) >> 1UL) | (point_index << 32UL);
    }
}

template <size_t num_points, size_t wnaf_bits>
inline void fixed_wnaf(uint64_t* scalar, uint64_t* wnaf, bool& skew_map, const size_t point_index) noexcept
{
    skew_map = ((scalar[0] & 1) == 0);
    uint64_t previous = get_wnaf_bits_const<wnaf_bits, 0>(scalar) + static_cast<uint64_t>(skew_map);
    wnaf_round<num_points, wnaf_bits, 1UL>(scalar, wnaf, point_index, previous);
}

template <size_t num_bits, size_t num_points, size_t wnaf_bits>
inline void fixed_wnaf(uint64_t* scalar, uint64_t* wnaf, bool& skew_map, const size_t point_index) noexcept
{
    skew_map = ((scalar[0] & 1) == 0);
    uint64_t previous = get_wnaf_bits_const<wnaf_bits, 0>(scalar) + static_cast<uint64_t>(skew_map);
    wnaf_round<num_bits, num_points, wnaf_bits, 1UL>(scalar, wnaf, point_index, previous);
}

} // namespace bb::wnaf

// NOLINTEND(readability-implicit-bool-conversion)
