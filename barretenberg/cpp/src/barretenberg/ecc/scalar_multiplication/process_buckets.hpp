// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <cstddef>
#include <cstdint>

namespace bb::scalar_multiplication {

// Number of bits processed per radix sort pass
constexpr uint32_t RADIX_BITS = 8;

// Mask for extracting bucket index from point schedule entry (lower 32 bits)
constexpr uint64_t BUCKET_INDEX_MASK = 0xffffffff;

/**
 * @brief Recursive MSD radix sort that also counts entries with zero bucket index
 * @details Sorts point schedule entries by their bucket index (lower 32 bits) using most-significant-digit
 *          radix sort. Processes RADIX_BITS bits per recursive call, starting from the most significant byte.
 *          As a side effect, counts entries where bucket_index == 0 (which are skipped during MSM).
 *
 * @param keys Array of point schedule entries to sort in-place (format: point_index << 32 | bucket_index)
 * @param num_entries Number of entries to sort
 * @param shift Current bit position to sort on (starts high, decreases by RADIX_BITS each recursion)
 * @param[out] num_zero_entries Count of entries with bucket_index == 0 (only set at final recursion level)
 * @param bucket_index_bits Number of bits in the bucket index (used to determine recursion depth)
 * @param top_level_keys Pointer to original array start; used to detect top-level call for zero counting
 */
void radix_sort_count_zero_entries(uint64_t* keys,
                                   size_t num_entries,
                                   uint32_t shift,
                                   size_t& num_zero_entries,
                                   uint32_t bucket_index_bits,
                                   const uint64_t* top_level_keys) noexcept;

/**
 * @brief Sort point schedule by bucket index and count zero-bucket entries
 * @details Entry point for radix sort. Sorts entries so that points targeting the same bucket
 *          are contiguous, improving cache locality during bucket accumulation. Also counts
 *          entries with bucket_index == 0, which represent scalar bits that don't contribute
 *          to any bucket in the current Pippenger round.
 *
 * @param point_schedule Array of packed entries (point_index << 32 | bucket_index) to sort in-place
 * @param num_entries Number of entries
 * @param bucket_index_bits Number of bits used for bucket indices (determines sort range)
 * @return Number of entries with bucket_index == 0 (these are at the start after sorting)
 */
size_t sort_point_schedule_and_count_zero_buckets(uint64_t* point_schedule,
                                                  size_t num_entries,
                                                  uint32_t bucket_index_bits) noexcept;

} // namespace bb::scalar_multiplication
