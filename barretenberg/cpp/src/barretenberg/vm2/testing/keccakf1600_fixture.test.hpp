#pragma once

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include <vector>

namespace bb::avm2::testing {

using tracegen::TestTraceContainer;

// Helper function to simulate and generate a trace of a list of Keccakf1600 permutations.
void generate_keccak_trace(TestTraceContainer& trace,
                           const std::vector<MemoryAddress>& dst_addresses,
                           const std::vector<MemoryAddress>& src_addresses);

// Helper function to simulate and generate a trace with a tag error at a specific relative offset from src_address.
// error_offset is the offset from src_address where the tag error should occur.
void generate_keccak_trace_with_tag_error(TestTraceContainer& trace,
                                          MemoryAddress dst_address,
                                          MemoryAddress src_address,
                                          size_t error_offset,
                                          MemoryTag error_tag);

} // namespace bb::avm2::testing
