// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/file_backed_allocator.hpp"
#include <vector>

namespace bb {
#ifdef __wasm__
/**
 * @brief A vector that uses the slab allocator.
 */
template <typename T> using SlabVector = std::vector<T, bb::ContainerSlabAllocator<T>>;
#else
template <typename T> using SlabVector = std::vector<T, bb::SlabOrFileBackedAllocator<T>>;
#endif // __wasm__
} // namespace bb
