// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include <cstdint>
// NOLINTBEGIN(readability-implicit-bool-conversion)
namespace bb::wnaf {
constexpr size_t SCALAR_BITS = 127;

#define WNAF_SIZE(x) ((bb::wnaf::SCALAR_BITS + (x) - 1) / (x)) // NOLINT(cppcoreguidelines-macro-usage)

template <size_t bits, size_t bit_position> inline uint64_t get_wnaf_bits_const(const uint64_t* scalar) noexcept
{
    if constexpr (bits == 0) {
        return 0ULL;
    } else {
        /**
         *  we want to take a 128 bit scalar and shift it down by (bit_position).
         * We then wish to mask out `bits` number of bits.
         * Low limb contains first 64 bits, so we wish to shift this limb by (bit_position mod 64), which is also
         * (bit_position & 63) If we require bits from the high limb, these need to be shifted left, not right. Actual
         * bit position of bit in high limb = `b`. Desired position = 64 - (amount we shifted low limb by) = 64 -
         * (bit_position & 63)
         *
         * So, step 1:
         * get low limb and shift right by (bit_position & 63)
         * get high limb and shift left by (64 - (bit_position & 63))
         *
         */
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

inline uint64_t get_wnaf_bits(const uint64_t* scalar, const uint64_t bits, const uint64_t bit_position) noexcept
{
    /**
     *  we want to take a 128 bit scalar and shift it down by (bit_position).
     * We then wish to mask out `bits` number of bits.
     * Low limb contains first 64 bits, so we wish to shift this limb by (bit_position mod 64), which is also
     * (bit_position & 63) If we require bits from the high limb, these need to be shifted left, not right. Actual bit
     * position of bit in high limb = `b`. Desired position = 64 - (amount we shifted low limb by) = 64 - (bit_position
     * & 63)
     *
     * So, step 1:
     * get low limb and shift right by (bit_position & 63)
     * get high limb and shift left by (64 - (bit_position & 63))
     *
     */
    const auto lo_limb_idx = static_cast<size_t>(bit_position >> 6);
    const auto hi_limb_idx = static_cast<size_t>((bit_position + bits - 1) >> 6);
    const uint64_t lo_shift = bit_position & 63UL;
    const uint64_t bit_mask = (1UL << static_cast<uint64_t>(bits)) - 1UL;

    const uint64_t lo = (scalar[lo_limb_idx] >> lo_shift);
    const uint64_t hi_shift = bit_position ? 64UL - (bit_position & 63UL) : 0;
    const uint64_t hi = ((scalar[hi_limb_idx] << (hi_shift)));
    const uint64_t hi_mask = bit_mask & (0ULL - (lo_limb_idx != hi_limb_idx));

    return (lo & bit_mask) | (hi & hi_mask);
}

/**
 * @brief Performs fixed-window non-adjacent form (WNAF) computation for scalar multiplication.
 *
 * WNAF is a method for representing integers which optimizes the number of non-zero terms, which in turn optimizes
 * the number of point doublings in scalar multiplication, in turn aiding efficiency.
 *
 * @param scalar Pointer to 128-bit scalar for which WNAF is to be computed.
 * @param wnaf Pointer to num_points+1 size array where the computed WNAF will be stored.
 * @param skew_map Reference to a boolean variable which will be set based on the least significant bit of the scalar.
 * @param point_index The index of the point being computed in the context of multiple point multiplication.
 * @param num_points The number of points being computed in parallel.
 * @param wnaf_bits The number of bits to use in each window of the WNAF representation.
 */
inline void fixed_wnaf(const uint64_t* scalar,
                       uint64_t* wnaf,
                       bool& skew_map,
                       const uint64_t point_index,
                       const uint64_t num_points,
                       const size_t wnaf_bits) noexcept
{
    skew_map = ((scalar[0] & 1) == 0);
    uint64_t previous = get_wnaf_bits(scalar, wnaf_bits, 0) + static_cast<uint64_t>(skew_map);
    const size_t wnaf_entries = (SCALAR_BITS + wnaf_bits - 1) / wnaf_bits;

    for (size_t round_i = 1; round_i < wnaf_entries - 1; ++round_i) {
        uint64_t slice = get_wnaf_bits(scalar, wnaf_bits, round_i * wnaf_bits);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[(wnaf_entries - round_i) * num_points] =
            ((((previous - (predicate << (wnaf_bits /*+ 1*/))) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
            (point_index);
        previous = slice + predicate;
    }
    size_t final_bits = SCALAR_BITS - (wnaf_bits * (wnaf_entries - 1));
    uint64_t slice = get_wnaf_bits(scalar, final_bits, (wnaf_entries - 1) * wnaf_bits);
    uint64_t predicate = ((slice & 1UL) == 0UL);

    wnaf[num_points] =
        ((((previous - (predicate << (wnaf_bits /*+ 1*/))) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
        (point_index);
    wnaf[0] = ((slice + predicate) >> 1UL) | (point_index);
}

template <size_t num_points, size_t wnaf_bits, size_t round_i>
inline void wnaf_round(uint64_t* scalar, uint64_t* wnaf, const uint64_t point_index, const uint64_t previous) noexcept
{
    constexpr size_t wnaf_entries = (SCALAR_BITS + wnaf_bits - 1) / wnaf_bits;
    constexpr auto log2_num_points = static_cast<size_t>(numeric::get_msb(static_cast<uint32_t>(num_points)));

    if constexpr (round_i < wnaf_entries - 1) {
        uint64_t slice = get_wnaf_bits(scalar, wnaf_bits, round_i * wnaf_bits);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[(wnaf_entries - round_i) << log2_num_points] =
            ((((previous - (predicate << (wnaf_bits /*+ 1*/))) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
            (point_index << 32UL);
        wnaf_round<num_points, wnaf_bits, round_i + 1>(scalar, wnaf, point_index, slice + predicate);
    } else {
        constexpr size_t final_bits = SCALAR_BITS - (SCALAR_BITS / wnaf_bits) * wnaf_bits;
        uint64_t slice = get_wnaf_bits(scalar, final_bits, (wnaf_entries - 1) * wnaf_bits);
        // uint64_t slice = get_wnaf_bits_const<final_bits, (wnaf_entries - 1) * wnaf_bits>(scalar);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[num_points] =
            ((((previous - (predicate << (wnaf_bits /*+ 1*/))) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
            (point_index << 32UL);
        wnaf[0] = ((slice + predicate) >> 1UL) | (point_index << 32UL);
    }
}

template <size_t scalar_bits, size_t num_points, size_t wnaf_bits, size_t round_i>
inline void wnaf_round(uint64_t* scalar, uint64_t* wnaf, const uint64_t point_index, const uint64_t previous) noexcept
{
    constexpr size_t wnaf_entries = (scalar_bits + wnaf_bits - 1) / wnaf_bits;
    constexpr auto log2_num_points = static_cast<uint64_t>(numeric::get_msb(static_cast<uint32_t>(num_points)));

    if constexpr (round_i < wnaf_entries - 1) {
        uint64_t slice = get_wnaf_bits_const<wnaf_bits, round_i * wnaf_bits>(scalar);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[(wnaf_entries - round_i) << log2_num_points] =
            ((((previous - (predicate << (wnaf_bits /*+ 1*/))) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
            (point_index << 32UL);
        wnaf_round<scalar_bits, num_points, wnaf_bits, round_i + 1>(scalar, wnaf, point_index, slice + predicate);
    } else {
        constexpr size_t final_bits = ((scalar_bits / wnaf_bits) * wnaf_bits == scalar_bits)
                                          ? wnaf_bits
                                          : scalar_bits - (scalar_bits / wnaf_bits) * wnaf_bits;
        uint64_t slice = get_wnaf_bits_const<final_bits, (wnaf_entries - 1) * wnaf_bits>(scalar);
        uint64_t predicate = ((slice & 1UL) == 0UL);
        wnaf[num_points] =
            ((((previous - (predicate << (wnaf_bits /*+ 1*/))) ^ (0UL - predicate)) >> 1UL) | (predicate << 31UL)) |
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
