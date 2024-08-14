#pragma once

#include "barretenberg/common/assert.hpp"
#include <cstddef>
#include <memory>

/**
 * @brief A shared pointer array template that represents a virtual array filled with zeros up to `virtual_size_`,
 * but with actual memory usage proportional to the region between `start_` and `end_`.
 *
 * This structure is designed to optimize memory usage by only allocating memory for a specific subrange
 * of the array. The `start_` and `end_` members define the range of indices that are backed by actual memory.
 * The rest of the indices, up to `virtual_size_`, are conceptually filled with zero values.
 *
 * The class allows for sharing the underlying array with potential offset adjustments, making it possible
 * to represent shifted arrays where the actual memory-backed range starts from a non-zero index.
 * It is designed to be wrapped by another class, namely `Polynomial`, and is not intended to be used directly.
 *
 * @tparam T The type of the elements in the array.
 */
template <typename T> struct SharedShiftedVirtualZeroesArray {

    /**
     * @brief Sets the value at the specified index.
     *
     * @param index The index at which the value should be set.
     * @param value The value to set.
     * @throws Fails in assert mode if the index is not within the memory-backed range [start_, end_).
     */
    void set(size_t index, const T& value)
    {
        ASSERT(static_cast<std::ptrdiff_t>(index) >= start_ && index < end_);
        data()[index] = value;
    }

    /**
     * @brief Retrieves the value at the specified index.
     *
     * @param index The index from which to retrieve the value.
     * @return The value at the specified index, or a default value (e.g. a field zero) of T if the index is outside the
     * memory-backed range.
     * @throws Fails in assert mode if the index is greater than or equal to `virtual_size_`.
     */
    T get(size_t index) const
    {
        ASSERT(index < virtual_size_);
        if (static_cast<std::ptrdiff_t>(index) >= start_ && index < end_) {
            return data()[index];
        }
        return T{}; // Return default element when index is out of the actual filled size
    }

    /**
     * @brief Returns a pointer to the underlying memory array, adjusted by `start_`.
     * NOTE: we can only index data in [start_index, start_index + size_)
     *
     * @return A pointer to the beginning of the memory-backed range.
     */
    T* data() { return backing_memory_.get() - start_; }
    const T* data() const { return backing_memory_.get() - start_; }
    size_t size() const { return static_cast<size_t>(static_cast<std::ptrdiff_t>(end_) - start_); }
    // Getter for consistency with size();
    size_t virtual_size() const { return virtual_size_; }

    // MEMBERS:
    /**
     * @brief The starting index of the memory-backed range.
     *
     * Represents the first index in the array that is backed by actual memory.
     * Negative values are used to represent shifts in the underlying array when sharing memory.
     */
    std::ptrdiff_t start_ = 0;

    /**
     * @brief The ending index of the memory-backed range.
     *
     * Represents the first index after `start_` that is not backed by actual memory.
     */
    size_t end_ = 0;

    /**
     * @brief The total logical size of the array.
     *
     * This is the size of the array as it would appear to a user, including both the memory-backed
     * range and the conceptual zero-filled range beyond `end_`.
     */
    size_t virtual_size_ = 0;

    /**
     * @brief Shared pointer to the underlying memory array.
     *
     * The memory is allocated for the range [start_, end_). It is shared across instances to allow
     * for efficient memory use when arrays are shifted or otherwise manipulated.
     */
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    std::shared_ptr<T[]> backing_memory_;
};