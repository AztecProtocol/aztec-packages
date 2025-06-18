#pragma once
#include <cassert>
#include <cstdint>
#include <cstring> // For memset (optional)
#include <vector>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/compiler_hints.hpp"

/**
 * @brief Custom class to handle packed vectors of bits
 * @details The cpp std::vector<bool> does not guarantee memory adjacency of values, and has no fast primitive for
 * clearing all bits in the vector. This is to avoid needing to clear all Pippenger buckets every round
 */
class BitVector {
  public:
    BitVector(size_t num_bits)
        : num_bits_(num_bits)
        , data_((num_bits + 63) / 64, 0)
    {}

    BB_INLINE void set(size_t index, bool value) noexcept
    {
        ASSERT(index < num_bits_);
        const size_t word = index >> 6;
        const size_t bit = index & 63;

        // from bit twiddling hacks
        // http://graphics.stanford.edu/~seander/bithacks.html#ConditionalSetOrClearBitsWithoutBranching
        const uint64_t mask = static_cast<uint64_t>(1) << bit;
        const uint64_t f = -static_cast<uint64_t>(value);
        const uint64_t limb = data_[word];
        data_[word] = (limb & ~mask) | (f & mask);
    }

    BB_INLINE bool get(size_t index) const noexcept
    {
        ASSERT(index < num_bits_);
        const uint64_t word = index >> 6;
        const uint64_t bit = index & 63;
        return ((data_[static_cast<size_t>(word)] >> bit) & 1) == 1;
    }

    void clear()
    {
        // std::fill(data_.begin(), data_.end(), 0);
        // or use raw memset for faster clearing
        std::memset(data_.data(), 0, data_.size() * sizeof(uint64_t));
    }

    size_t size() const { return num_bits_; }

    // Optional: access raw pointer for performance
    uint64_t* raw_data() { return data_.data(); }
    const uint64_t* raw_data() const { return data_.data(); }

  private:
    size_t num_bits_;
    std::vector<uint64_t> data_;
};
