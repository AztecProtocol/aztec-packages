#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
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
        ASSERT(index >= start_ && index < end_);
        data()[index - start_] = value;
    }

    /**
     * @brief Retrieves the value at the specified index, or 'zero'. Optimizes for e.g. 256-bit fields
     * by storing a static 0 value, allowing usage of a const reference.
     *
     * @param index The index from which to retrieve the value.
     * @param virtual_padding For the rare case where we explicitly want the 0-returning behavior beyond our usual
     * virtual_size.
     * @return The value at the specified index, or a default value (e.g. a field zero) of T if the index is outside the
     * memory-backed range.
     * @throws Fails in assert mode if the index is greater than or equal to `virtual_size_`.
     */
    const T& get(size_t index, size_t virtual_padding = 0) const
    {
        static const T zero{};
        if (index >= virtual_size_ + virtual_padding) {
            info("BAD GET(): index = ",
                 index,
                 ", virtual_size_ = ",
                 virtual_size_,
                 ", virtual_padding = ",
                 virtual_padding);
        }
        ASSERT(index < virtual_size_ + virtual_padding);
        if (index >= start_ && index < end_) {
            return data()[index - start_];
        }
        return zero; // Return default element when index is out of the actual filled size
    }

    /**
     * @brief Returns a pointer to the underlying memory array.
     * NOTE: This should be used with care, as index 0 corresponds to virtual index `start_`.
     *
     * @return A pointer to the beginning of the memory-backed range.
     */
    T* data() { return backing_memory_.get(); }
    const T* data() const { return backing_memory_.get(); }
    // Our size is end_ - start_. Note that we need to offset end_ when doing a shift to
    // correctly maintain the size.
    size_t size() const { return end_ - start_; }
    // Getter for consistency with size();
    size_t virtual_size() const { return virtual_size_; }

    void increase_virtual_size(const size_t new_virtual_size)
    {
        ASSERT(new_virtual_size >= virtual_size_); // shrinking is not allowed
        virtual_size_ = new_virtual_size;
    }

    T& operator[](size_t index)
    {
        ASSERT(index >= start_ && index < end_);
        return data()[index - start_];
    }
    // get() is more useful, but for completeness with the non-const operator[]
    const T& operator[](size_t index) const
    {
        ASSERT(index >= start_ && index < end_);
        return data()[index - start_];
    }

    // MEMBERS:
    /**
     * @brief The starting index of the memory-backed range.
     *
     * Represents the first index in the array that is backed by actual memory.
     * This is used to represent polynomial shifts by representing the unshfited polynomials
     * with index >= 1 and reducing this by one to divide by x / left shift one.
     * Historically, we used memory padding to represent shifts. This is currently implied by start_ (before which we
     * consider all values 0).
     */
    size_t start_ = 0;

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
     * range and the conceptual zero-filled range beyond `end_` and before `start_` (if a positive value).
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