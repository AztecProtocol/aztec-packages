#pragma once
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

class ArrayStore {

  public:
    ArrayStore(size_t levels, size_t indices)
        : map_(std::vector<std::vector<std::pair<bool, std::vector<uint8_t>>>>(
              levels,
              std::vector<std::pair<bool, std::vector<uint8_t>>>(
                  indices, std::pair<bool, std::vector<uint8_t>>(false, std::vector<uint8_t>()))))
    {}
    ~ArrayStore() {}

    void put(size_t level, size_t index, const std::vector<uint8_t>& data)
    {
        map_[level][index] = std::make_pair(true, data);
    }
    bool get(size_t level, size_t index, std::vector<uint8_t>& data) const
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
} // namespace bb::stdlib::merkle_tree