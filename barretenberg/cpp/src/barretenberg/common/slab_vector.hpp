// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <vector>

#ifdef __wasm__
namespace bb {
#include "barretenberg/common/slab_allocator.hpp"
/**
 * @brief A vector that uses the slab allocator.
 */
template <typename T> using SlabVector = std::vector<T, bb::ContainerSlabAllocator<T>>;
} // namespace bb
#else
#include "barretenberg/common/file_backed_allocator.hpp"
namespace bb {
template <typename T> using SlabVector = std::vector<T, bb::SlabOrFileBackedAllocator<T>>;
} // namespace bb
#endif // __wasm__
