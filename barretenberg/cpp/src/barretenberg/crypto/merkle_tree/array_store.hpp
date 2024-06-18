#pragma once
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::crypto::merkle_tree {

/**
 * @brief A very basic 2-d array for use as a backing store for merkle trees.
 * Can store up to 'indices' nodes per row and 'levels' rows.
 */
class ArrayStore {

  public:
    ArrayStore(uint32_t levels, index_t indices = 1024)
        : map_(std::vector<std::vector<std::pair<bool, std::vector<uint8_t>>>>(
              levels + 1,
              std::vector<std::pair<bool, std::vector<uint8_t>>>(
                  indices, std::pair<bool, std::vector<uint8_t>>(false, std::vector<uint8_t>()))))
    {}
    ~ArrayStore() = default;

    ArrayStore() = delete;
    ArrayStore(ArrayStore const& other) = delete;
    ArrayStore(ArrayStore const&& other) = delete;
    ArrayStore& operator=(ArrayStore const& other) = delete;
    ArrayStore& operator=(ArrayStore const&& other) = delete;

    void put(uint32_t level, index_t index, const std::vector<uint8_t>& data)
    {
        map_[level][index] = std::make_pair(true, data);
    }
    bool get(uint32_t level, index_t index, std::vector<uint8_t>& data) const
    {
        const std::pair<bool, std::vector<uint8_t>>& slot = map_[level][index];
        if (slot.first) {
            data = slot.second;
        }
        return slot.first;
    }

  private:
    std::vector<std::vector<std::pair<bool, std::vector<uint8_t>>>> map_;
};
} // namespace bb::crypto::merkle_tree