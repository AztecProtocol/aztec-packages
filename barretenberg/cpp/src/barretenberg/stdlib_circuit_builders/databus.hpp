// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib_circuit_builders/public_component_key.hpp"
#include <cstdint>
namespace bb {

// We assume all kernels have space for two return data commitments on their public inputs
constexpr uint32_t NUM_DATABUS_COMMITMENTS = 2;
constexpr uint32_t PROPAGATED_DATABUS_COMMITMENT_SIZE = 8;
constexpr uint32_t PROPAGATED_DATABUS_COMMITMENTS_SIZE = PROPAGATED_DATABUS_COMMITMENT_SIZE * NUM_DATABUS_COMMITMENTS;

/**
 * @brief A DataBus column
 *
 */
struct BusVector {

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1138): A default value added to every databus column to
    // avoid the point at infinity commitment and to ensure the validity of the databus commitment consistency checks.
    static constexpr bb::fr DEFAULT_VALUE = 25;

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
 * @details The DataBus is designed to facilitate efficient transfer of large amounts of public data between circuits.
 * It is expected that only a small subset of the data being passed needs to be used in any single circuit, thus we
 * provide a read mechanism (implemented through a Builder) that results in prover work proportional to only the data
 * that is used. (The prover must still commit to all data in each bus vector but we do not need to hash all data
 * in-circuit as we would with public inputs).
 *
 */
using DataBus = std::array<BusVector, 3>;
enum class BusId { CALLDATA, SECONDARY_CALLDATA, RETURNDATA };

} // namespace bb
