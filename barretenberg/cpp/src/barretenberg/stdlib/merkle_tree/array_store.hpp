#pragma once
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

/**
 * @brief A very basic 2-d array for use as a backing store for merkle trees.
 * Can store up to 'indices' nodes per row and 'levels' rows.
 */
class ArrayStore {

  public:
    ArrayStore(size_t levels, size_t indices = 1024)
        : map_(std::vector<std::vector<std::pair<bool, std::vector<uint8_t>>>>(
              levels + 1,
              std::vector<std::pair<bool, std::vector<uint8_t>>>(
                  indices, std::pair<bool, std::vector<uint8_t>>(false, std::vector<uint8_t>()))))
    {}
    ~ArrayStore() {}

    void put(size_t level, size_t index, const std::vector<uint8_t>& data)
    {
        ASSERT(level >= 0 && level < map_.size());
        ASSERT(index >= 0 && index < map_[level].size());
        map_[level][index] = std::make_pair(true, data);
    }
    bool get(size_t level, size_t index, std::vector<uint8_t>& data) const
    {
        ASSERT(level >= 0 && level < map_.size());
        ASSERT(index >= 0 && index < map_[level].size());
        const std::pair<bool, std::vector<uint8_t>>& slot = map_[level][index];
        if (slot.first) {
            data = slot.second;
        }
        return slot.first;
    }

  private:
    std::vector<std::vector<std::pair<bool, std::vector<uint8_t>>>> map_;
};
} // namespace bb::stdlib::merkle_tree