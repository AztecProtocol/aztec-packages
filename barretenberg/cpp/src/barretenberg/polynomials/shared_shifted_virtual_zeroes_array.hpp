#pragma once

#include "barretenberg/common/assert.hpp"
#include <cstddef>
#include <memory>

// Shared pointer array of a type (in our case, a field) that is
// conceptually filled with 0's until 'virtual_size_', but with actual memory usage
// proportional to 'size'.
// As well, there is a 'shift_' member that can be used when we want to share the underlying array.
// Everything is public as this is intended to be wrapped by another class, namely Polynomial
// The name is a mouthful, but again as an internal bundling of details it is intended to be wrapped by
// something more ergonomic.
template <typename T> struct SharedShiftedVirtualZeroesArray {
    // Method to set the value at a specific index
    void set(size_t index, const T& value)
    {
        ASSERT(index < size_);
        backing_memory_.get()[index] = value;
    }

    // Method to get the value at a specific index
    T get(size_t index) const
    {
        ASSERT(index < virtual_size_);
        if (index + shift_ < size_) {
            return backing_memory_.get()[index];
        }
        return T{}; // Return default element when index is out of the actual filled size
    }

    // Method to get the memory-backed size such that we can set index 0..size()-1.
    size_t size() const { return size_ - shift_; }
    // Method to get virtual size such that we can get index 0..virtual_size()-1.
    size_t virtual_size() const { return virtual_size_ - shift_; };

    T* data() { return backing_memory_.get(); }
    const T* data() const { return backing_memory_.get(); }

    // MEMBERS:
    // The actual size of the array allocation
    size_t size_ = 0;
    // The logical size of the vector, indices size_ to virtual_size - 1 return T{} when indexed.
    // This is really mainly used for a debug check that we never index >= virtual_size_;
    size_t virtual_size_ = 0;
    // An offset into the array, used to implement shifted polynomials.
    size_t shift_ = 0;

    // The memory
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    std::shared_ptr<T[]> backing_memory_;
};