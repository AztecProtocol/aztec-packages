#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/keccak_memory.hpp"
#include "barretenberg/vm2/generated/relations/keccakf1600.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/keccakf1600_fixture.test.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::KeccakF1600TraceBuilder;
using tracegen::TestTraceContainer;

using keccakf1600_relation = bb::avm2::keccakf1600<AvmFlavorSettings::FF>;
using keccak_memory_relation = bb::avm2::keccak_memory<AvmFlavorSettings::FF>;

TEST(KeccakF1600ConstrainingTest, EmptyRow)
{
    check_relation<keccakf1600_relation>(testing::empty_trace());
}

// Positive test of a single permutation with simulation and trace generation and checking interactions.
TEST(KeccakF1600ConstrainingTest, SinglewithSimulationAndTraceGenInteractions)
{
    TestTraceContainer trace;

    const MemoryAddress src_addr = 0;
    const MemoryAddress dst_addr = 200;

    testing::generate_keccak_trace(trace, { dst_addr }, { src_addr }, /*space_id=*/23);

    check_all_interactions<tracegen::KeccakF1600TraceBuilder>(trace);
    check_relation<keccakf1600_relation>(trace);
    check_relation<keccak_memory_relation>(trace);
}

// Positive test for multiple permutation calls with simulation and trace generation.
// We also check all interactions.
TEST(KeccakF1600ConstrainingTest, MultipleWithSimulationAndTraceGenInteractions)
{
    TestTraceContainer trace;

    constexpr size_t NUM_PERMUTATIONS = 3;

    std::vector<MemoryAddress> src_addresses(NUM_PERMUTATIONS);
    std::vector<MemoryAddress> dst_addresses(NUM_PERMUTATIONS);

    for (size_t k = 0; k < NUM_PERMUTATIONS; ++k) {
        src_addresses.at(k) = static_cast<MemoryAddress>(k * 200);
        dst_addresses.at(k) = static_cast<MemoryAddress>((k * 200) + 1000);
    }

    testing::generate_keccak_trace(trace, dst_addresses, src_addresses, /*space_id=*/79);

    check_all_interactions<tracegen::KeccakF1600TraceBuilder>(trace);
    check_relation<keccakf1600_relation>(trace);
    check_relation<keccak_memory_relation>(trace);
}

// Test tag error handling when a memory value has an incorrect tag.
// We test when the memory tag is not U64 for a read value at index (1, 2).
// We check that the tag_error is 1 for this index (flattened index 7) and that
// we correctly propagate the error to the top.
TEST(KeccakF1600ConstrainingTest, TagErrorHandling)
{
    TestTraceContainer trace;

    const MemoryAddress src_addr = 0;
    const MemoryAddress dst_addr = 200;
    const uint32_t space_id = 79;

    // Position (1,2) in the 5x5 matrix corresponds to index 7 in the flattened array
    const size_t error_offset = 7;              // (1 * 5) + 2 = 7
    const MemoryTag error_tag = MemoryTag::U32; // Using U32 instead of U64 to trigger error

    testing::generate_keccak_trace_with_tag_error(trace, dst_addr, src_addr, error_offset, error_tag, space_id);

    check_all_interactions<tracegen::KeccakF1600TraceBuilder>(trace);
    check_relation<keccakf1600_relation>(trace);
    check_relation<keccak_memory_relation>(trace);
}

// Test slice error handling when the src address is out of bounds.
TEST(KeccakF1600ConstrainingTest, SrcAddressOutOfBounds)
{
    TestTraceContainer trace;

    const MemoryAddress src_addr = AVM_HIGHEST_MEM_ADDRESS;
    const MemoryAddress dst_addr = 456;
    const uint32_t space_id = 23;

    testing::generate_keccak_trace_with_slice_error(trace, dst_addr, src_addr, space_id);

    check_all_interactions<tracegen::KeccakF1600TraceBuilder>(trace);
    check_relation<keccakf1600_relation>(trace);
    check_relation<keccak_memory_relation>(trace);
}

// Test slice error handling when the dst address is out of bounds.
TEST(KeccakF1600ConstrainingTest, DstAddressOutOfBounds)
{
    TestTraceContainer trace;

    const MemoryAddress src_addr = 123;
    const MemoryAddress dst_addr = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 2;
    const uint32_t space_id = 23;

    testing::generate_keccak_trace_with_slice_error(trace, dst_addr, src_addr, space_id);

    check_all_interactions<tracegen::KeccakF1600TraceBuilder>(trace);
    check_relation<keccakf1600_relation>(trace);
    check_relation<keccak_memory_relation>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
