// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/public_input_component/public_component_key.hpp"
#include <cstdint>
namespace bb {

/**
 * @brief A DataBus column
 *
 */
struct BusVector {

    // A default value added to every databus column to ensure read gates exist. Set to 0 so that the commitment to a
    // databus column containing only the default entry is the point at infinity, matching the default commitment used
    // in DataBusDepot. This makes the default commitment independent of the databus polynomial offset.
    static constexpr bb::fr DEFAULT_VALUE = 0;

    /**
     * @brief Add an element to the data defining this bus column
     *
     * @param idx Index of the element in the variables vector of a builder
     */
    void append(const uint32_t& idx)
    {
        data.emplace_back(idx);
        read_counts.emplace_back(0);
    }

    size_t size() const { return data.size(); }

    const uint32_t& operator[](size_t idx) const
    {
        BB_ASSERT_LT(idx, size());
        return data[idx];
    }

    const uint32_t& get_read_count(size_t idx) const
    {
        BB_ASSERT_LT(idx, read_counts.size());
        return read_counts[idx];
    }

    void increment_read_count(size_t idx)
    {
        BB_ASSERT_LT(idx, read_counts.size());
        read_counts[idx]++;
    }

  private:
    std::vector<uint32_t> read_counts; // count of reads at each index into data
    std::vector<uint32_t> data;        // variable indices corresponding to data in this bus vector
};

/**
 * @brief The DataBus; facilitates storage of public circuit input/output
 * @details The DataBus is designed to facilitate efficient transfer of large amounts of public data between circuits.
 * It is expected that only a small subset of the data being passed needs to be used in any single circuit, thus we
 * provide a read mechanism (implemented through a Builder) that results in prover work proportional to only the data
 * that is used. (The prover must still commit to all data in each bus vector but we do not need to hash all data
 * in-circuit as we would with public inputs).
 *
 */
constexpr size_t NUM_BUS_COLUMNS = MAX_APPS_PER_KERNEL + /*kernel calldata*/ 1 + /*kernel returndata*/ 1;

using DataBus = std::array<BusVector, NUM_BUS_COLUMNS>;
enum class BusId : uint8_t {
    KERNEL_CALLDATA = 0,
    APP_CALLDATA = 1,
    RETURNDATA = MAX_APPS_PER_KERNEL + 1,
};
static_assert(static_cast<size_t>(BusId::RETURNDATA) == NUM_BUS_COLUMNS - 1, "BusId enum must match DataBus layout");

} // namespace bb
