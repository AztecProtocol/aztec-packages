// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "process_buckets.hpp"

#include <array>

namespace bb::scalar_multiplication {

// NOLINTNEXTLINE(misc-no-recursion) recursion is fine here, max depth is 4 (32-bit bucket index / 8 bits per call)
void radix_sort_count_zero_entries(uint64_t* keys,
                                   const size_t num_entries,
                                   const uint32_t shift,
                                   size_t& num_zero_entries,
                                   const uint32_t bucket_index_bits,
                                   const uint64_t* top_level_keys) noexcept
{
    constexpr size_t NUM_RADIX_BUCKETS = 1UL << RADIX_BITS;
    constexpr uint32_t RADIX_MASK = static_cast<uint32_t>(NUM_RADIX_BUCKETS) - 1U;

    // Step 1: Count entries in each radix bucket
    std::array<uint32_t, NUM_RADIX_BUCKETS> bucket_counts{};
    for (size_t i = 0; i < num_entries; ++i) {
        bucket_counts[(keys[i] >> shift) & RADIX_MASK]++;
    }

    // Step 2: Convert counts to cumulative offsets (prefix sum)
    std::array<uint32_t, NUM_RADIX_BUCKETS + 1> offsets;
    std::array<uint32_t, NUM_RADIX_BUCKETS + 1> offsets_copy;
    offsets[0] = 0;
    for (size_t i = 0; i < NUM_RADIX_BUCKETS - 1; ++i) {
        bucket_counts[i + 1] += bucket_counts[i];
    }

    // Count zero entries only at the final recursion level (shift == 0) and only for the full array
    if ((shift == 0) && (keys == top_level_keys)) {
        num_zero_entries = bucket_counts[0];
    }

    for (size_t i = 1; i < NUM_RADIX_BUCKETS + 1; ++i) {
        offsets[i] = bucket_counts[i - 1];
    }
    for (size_t i = 0; i < NUM_RADIX_BUCKETS + 1; ++i) {
        offsets_copy[i] = offsets[i];
    }

    // Step 3: In-place permutation using cycle sort
    // For each radix bucket, repeatedly swap elements to their correct positions until all elements
    // in that bucket's range belong there. The offsets array tracks the next write position for each bucket.
    uint64_t* start = &keys[0];
    for (size_t i = 0; i < NUM_RADIX_BUCKETS; ++i) {
        uint64_t* bucket_start = &keys[offsets[i]];
        const uint64_t* bucket_end = &keys[offsets_copy[i + 1]];
        while (bucket_start != bucket_end) {
            for (uint64_t* it = bucket_start; it < bucket_end; ++it) {
                const size_t value = (*it >> shift) & RADIX_MASK;
                const uint64_t offset = offsets[value]++;
                std::iter_swap(it, start + offset);
            }
            bucket_start = &keys[offsets[i]];
        }
    }

    // Step 4: Recursively sort each bucket by the next less-significant byte
    if (shift > 0) {
        for (size_t i = 0; i < NUM_RADIX_BUCKETS; ++i) {
            const size_t bucket_size = offsets_copy[i + 1] - offsets_copy[i];
            if (bucket_size > 1) {
                radix_sort_count_zero_entries(
                    &keys[offsets_copy[i]], bucket_size, shift - RADIX_BITS, num_zero_entries, bucket_index_bits, keys);
            }
        }
    }
}

size_t sort_point_schedule_and_count_zero_buckets(uint64_t* point_schedule,
                                                  const size_t num_entries,
                                                  const uint32_t bucket_index_bits) noexcept
{
    if (num_entries == 0) {
        return 0;
    }

    // Round bucket_index_bits up to next multiple of RADIX_BITS for proper MSD radix sort alignment.
    // E.g., if bucket_index_bits=10, we need to start sorting from bit 16 (2 bytes) not bit 10.
    const uint32_t remainder = bucket_index_bits % RADIX_BITS;
    const uint32_t padded_bits = (remainder == 0) ? bucket_index_bits : bucket_index_bits - remainder + RADIX_BITS;
    const uint32_t initial_shift = padded_bits - RADIX_BITS;

    size_t num_zero_entries = 0;
    radix_sort_count_zero_entries(
        point_schedule, num_entries, initial_shift, num_zero_entries, bucket_index_bits, point_schedule);

    // The radix sort counts entries where the least significant BYTE is zero, but we need entries where
    // the entire bucket_index (lower 32 bits) is zero. Verify the first entry after sorting.
    if ((point_schedule[0] & BUCKET_INDEX_MASK) != 0) {
        num_zero_entries = 0;
    }

    return num_zero_entries;
}

} // namespace bb::scalar_multiplication
