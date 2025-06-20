// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <cstddef>
#include <cstdint>

namespace bb::scalar_multiplication {
void radix_sort_count_zero_entries(uint64_t* keys,
                                   const size_t num_entries,
                                   const uint32_t shift,
                                   size_t& num_zero_entries,
                                   const uint32_t total_bits,
                                   const uint64_t* start_pointer) noexcept;
size_t process_buckets_count_zero_entries(uint64_t* wnaf_entries,
                                          const size_t num_entries,
                                          const uint32_t num_bits) noexcept;
} // namespace bb::scalar_multiplication
