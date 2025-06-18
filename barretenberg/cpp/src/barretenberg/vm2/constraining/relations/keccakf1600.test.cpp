#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/keccak_memory.hpp"
#include "barretenberg/vm2/generated/relations/keccakf1600.hpp"
#include "barretenberg/vm2/generated/relations/lookups_keccakf1600.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/keccakf1600_fixture.test.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::DebugPermutationBuilder;
using tracegen::LookupIntoDynamicTableGeneric;
using tracegen::LookupIntoDynamicTableSequential;
using tracegen::LookupIntoIndexedByClk;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;

using keccakf1600_relation = bb::avm2::keccakf1600<FF>;
using keccak_memory_relation = bb::avm2::keccak_memory<FF>;

// Helper function to check all interactions.
void check_all_interactions(TestTraceContainer& trace)
{
    // Theta XOR values
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_01_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_02_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_03_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_0_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_11_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_12_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_13_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_1_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_21_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_22_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_23_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_2_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_31_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_32_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_33_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_3_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_41_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_42_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_43_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_4_settings>().process(trace);
    // Theta XOR combined and final values
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_0_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_1_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_2_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_3_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_4_settings>().process(trace);
    // State Theta final values
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_00_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_01_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_02_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_03_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_04_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_10_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_11_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_12_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_13_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_14_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_20_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_21_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_22_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_23_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_24_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_30_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_31_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_32_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_33_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_34_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_40_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_41_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_42_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_43_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_44_settings>().process(trace);
    // Range check on some state theta limbs
    // Range checks are de-duplicated and therefore we can't use the interaction builder
    // LookupIntoDynamicTableSequential.
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_01_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_02_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_03_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_04_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_10_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_11_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_12_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_13_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_14_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_20_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_21_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_22_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_23_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_24_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_30_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_31_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_32_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_33_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_34_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_40_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_41_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_42_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_43_range_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_theta_limb_44_range_settings>().process(trace);
    // "pi and" values
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_00_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_01_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_02_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_03_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_04_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_10_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_11_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_12_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_13_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_14_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_20_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_21_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_22_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_23_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_24_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_30_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_31_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_32_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_33_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_34_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_40_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_41_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_42_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_43_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_44_settings>().process(trace);
    // chi values
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_00_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_01_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_02_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_03_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_04_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_10_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_11_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_12_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_13_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_14_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_20_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_21_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_22_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_23_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_24_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_30_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_31_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_32_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_33_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_34_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_40_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_41_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_42_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_43_settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_44_settings>().process(trace);
    // iota_00 value
    LookupIntoDynamicTableSequential<lookup_keccakf1600_state_iota_00_settings>().process(trace);
    // round constants lookup
    LookupIntoIndexedByClk<lookup_keccakf1600_round_cst_settings>().process(trace);
    // Memory slices permutations
    DebugPermutationBuilder<perm_keccakf1600_read_to_slice_settings>().process(trace);
    DebugPermutationBuilder<perm_keccakf1600_write_to_slice_settings>().process(trace);
    // Range check for slice memory ranges.
    // Range checks are de-duplicated and therefore we can't use the interaction builder
    // LookupIntoDynamicTableSequential.
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_src_abs_diff_positive_settings>().process(trace);
    LookupIntoDynamicTableGeneric<lookup_keccakf1600_dst_abs_diff_positive_settings>().process(trace);
    // Keccak slice memory to memory sub-trace
    LookupIntoDynamicTableSequential<lookup_keccak_memory_slice_to_mem_settings>().process(trace);
}

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

    check_all_interactions(trace);
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

    check_all_interactions(trace);
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

    check_all_interactions(trace);
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

    check_all_interactions(trace);
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

    check_all_interactions(trace);
    check_relation<keccakf1600_relation>(trace);
    check_relation<keccak_memory_relation>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
