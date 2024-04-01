#pragma once

#include <cstdint>
namespace bb {

using namespace bb;

/**
 * @brief A DataBus column
 *
 */
struct BusVector {

    /**
     * @brief Add an element to the data defining this bus column
     *
     * @param idx Index of the element in the variables vector of a builder
     */
    void append(const uint32_t& idx)
    {
        data.emplace_back(idx);
        read_counts.resize(data.size()); // WORKTODO: emplace_back(0)?
    }

    size_t size() const { return data.size(); }

    const uint32_t& operator[](size_t idx) const
    {
        ASSERT(idx < size());
        return data[idx];
    }

    const uint32_t& get_read_count(size_t idx) const
    {
        ASSERT(idx < read_counts.size());
        return read_counts[idx];
    }

    void increment_read_count(size_t idx)
    {
        ASSERT(idx < read_counts.size());
        read_counts[idx]++;
    }

  private:
    std::vector<uint32_t> read_counts; // count of reads at each index into data
    std::vector<uint32_t> data;        // variable indices corresponding to data in this bus vector
};

/**
 * @brief The DataBus; facilitates storage of public circuit input/output
 * @details WORKTODO: explain basic purpose and ideas
 *
 */
struct DataBus {
    BusVector calldata;
    BusVector return_data;
};

} // namespace bb
