#pragma once

#include <fuzzer/FuzzedDataProvider.h>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::fuzzing {

/**
 * @brief Read a MemoryValue from the fuzzed data provider.
 *
 * This function consumes 32 bytes from the fuzzer to create a uint256_t value,
 * then selects a random MemoryTag and creates a MemoryValue with that tag,
 * truncating the value to fit the tag if necessary.
 *
 * @param fdp The FuzzedDataProvider to consume data from
 * @return MemoryValue A memory value with a random tag and fuzzed value
 */
bb::avm2::MemoryValue read_mem_value(FuzzedDataProvider& fdp);

} // namespace bb::avm2::fuzzing
