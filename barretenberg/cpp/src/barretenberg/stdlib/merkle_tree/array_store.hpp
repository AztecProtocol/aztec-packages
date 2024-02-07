#pragma once
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

class ArrayStore {

  public:
    ArrayStore(size_t depth)
    {
        const size_t total_size = 1 << (depth + 1);
        data_.resize(total_size, std::make_pair(false, std::vector<uint8_t>()));
    }
    ~ArrayStore() {}

    void put(size_t level, size_t index, const std::vector<uint8_t>& data)
    {
        const size_t map_index = calculate_index(level, index);
        data_[map_index] = std::make_pair(true, data);
    }
    bool get(size_t level, size_t index, std::vector<uint8_t>& data) const
    {
        const size_t map_index = calculate_index(level, index);
        const std::pair<bool, std::vector<uint8_t>>& slot = data_[map_index];
        if (slot.first) {
            data = slot.second;
        }
        return slot.first;
    }

  private:
    size_t calculate_index(size_t level, size_t index) const { return ((1 << level) - 1) + index; }

  private:
    std::vector<std::pair<bool, std::vector<uint8_t>>> data_;
};
} // namespace bb::stdlib::merkle_tree