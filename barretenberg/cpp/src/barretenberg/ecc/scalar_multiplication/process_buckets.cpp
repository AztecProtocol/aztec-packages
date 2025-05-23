// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "process_buckets.hpp"

#include <array>

namespace bb::scalar_multiplication {

// NOLINTNEXTLINE(misc-no-recursion) recursion is fine here, max recursion depth is 8 (64 bit int / 8 bits per call)
void radix_sort(uint64_t* keys, const size_t num_entries, const uint32_t shift) noexcept
{
    constexpr size_t num_bits = 8;
    constexpr size_t num_buckets = 1UL << num_bits;
    constexpr uint32_t mask = static_cast<uint32_t>(num_buckets) - 1U;
    std::array<uint32_t, num_buckets> bucket_counts{};

    for (size_t i = 0; i < num_entries; ++i) {
        bucket_counts[(keys[i] >> shift) & mask]++;
    }

    std::array<uint32_t, num_buckets + 1> offsets;
    std::array<uint32_t, num_buckets + 1> offsets_copy;
    offsets[0] = 0;

    for (size_t i = 0; i < num_buckets - 1; ++i) {
        bucket_counts[i + 1] += bucket_counts[i];
    }
    for (size_t i = 1; i < num_buckets + 1; ++i) {
        offsets[i] = bucket_counts[i - 1];
    }
    for (size_t i = 0; i < num_buckets + 1; ++i) {
        offsets_copy[i] = offsets[i];
    }
    uint64_t* start = &keys[0];

    for (size_t i = 0; i < num_buckets; ++i) {
        uint64_t* bucket_start = &keys[offsets[i]];
        const uint64_t* bucket_end = &keys[offsets_copy[i + 1]];
        while (bucket_start != bucket_end) {
            for (uint64_t* it = bucket_start; it < bucket_end; ++it) {
                const size_t value = (*it >> shift) & mask;
                const uint64_t offset = offsets[value]++;
                std::iter_swap(it, start + offset);
            }
            bucket_start = &keys[offsets[i]];
        }
    }
    if (shift > 0) {
        for (size_t i = 0; i < num_buckets; ++i) {
            if (offsets_copy[i + 1] - offsets_copy[i] > 1) {
                radix_sort(&keys[offsets_copy[i]], offsets_copy[i + 1] - offsets_copy[i], shift - 8);
            }
        }
    }
}

void process_buckets(uint64_t* wnaf_entries, const size_t num_entries, const uint32_t num_bits) noexcept
{
    const uint32_t bits_per_round = 8;
    const uint32_t base = num_bits & 7;
    const uint32_t total_bits = (base == 0) ? num_bits : num_bits - base + 8;
    const uint32_t shift = total_bits - bits_per_round;

    radix_sort(wnaf_entries, num_entries, shift);
}
} // namespace bb::scalar_multiplication
