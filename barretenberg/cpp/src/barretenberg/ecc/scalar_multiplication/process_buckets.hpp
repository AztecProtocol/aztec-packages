// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <cstddef>
#include <cstdint>

namespace bb::scalar_multiplication {
void radix_sort(uint64_t* keys, size_t num_entries, uint32_t shift) noexcept;

void process_buckets(uint64_t* wnaf_entries, size_t num_entries, uint32_t num_bits) noexcept;
} // namespace bb::scalar_multiplication