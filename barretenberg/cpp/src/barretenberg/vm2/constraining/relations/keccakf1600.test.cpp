#include <cstddef>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/keccak_memory.hpp"
#include "barretenberg/vm2/generated/relations/keccakf1600.hpp"
#include "barretenberg/vm2/generated/relations/lookups_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::ReturnRef;
using ::testing::StrictMock;

using simulation::MockContext;
using MemorySimulator = simulation::Memory;
using KeccakSimulator = simulation::KeccakF1600;
using BitwiseSimulator = simulation::Bitwise;
using RangeCheckSimulator = simulation::RangeCheck;
using simulation::EventEmitter;
using tracegen::BitwiseTraceBuilder;
using tracegen::KeccakF1600TraceBuilder;
using tracegen::MemoryTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;

using keccakf1600_relation = bb::avm2::keccakf1600<FF>;
using keccak_memory_relation = bb::avm2::keccak_memory<FF>;

// Theta XOR values
using lookup_theta_xor_01 = lookup_keccakf1600_theta_xor_01_relation<FF>;
using lookup_theta_xor_02 = lookup_keccakf1600_theta_xor_02_relation<FF>;
using lookup_theta_xor_03 = lookup_keccakf1600_theta_xor_03_relation<FF>;
using lookup_theta_xor_row_0 = lookup_keccakf1600_theta_xor_row_0_relation<FF>;
using lookup_theta_xor_11 = lookup_keccakf1600_theta_xor_11_relation<FF>;
using lookup_theta_xor_12 = lookup_keccakf1600_theta_xor_12_relation<FF>;
using lookup_theta_xor_13 = lookup_keccakf1600_theta_xor_13_relation<FF>;
using lookup_theta_xor_row_1 = lookup_keccakf1600_theta_xor_row_1_relation<FF>;
using lookup_theta_xor_21 = lookup_keccakf1600_theta_xor_21_relation<FF>;
using lookup_theta_xor_22 = lookup_keccakf1600_theta_xor_22_relation<FF>;
using lookup_theta_xor_23 = lookup_keccakf1600_theta_xor_23_relation<FF>;
using lookup_theta_xor_row_2 = lookup_keccakf1600_theta_xor_row_2_relation<FF>;
using lookup_theta_xor_31 = lookup_keccakf1600_theta_xor_31_relation<FF>;
using lookup_theta_xor_32 = lookup_keccakf1600_theta_xor_32_relation<FF>;
using lookup_theta_xor_33 = lookup_keccakf1600_theta_xor_33_relation<FF>;
using lookup_theta_xor_row_3 = lookup_keccakf1600_theta_xor_row_3_relation<FF>;
using lookup_theta_xor_41 = lookup_keccakf1600_theta_xor_41_relation<FF>;
using lookup_theta_xor_42 = lookup_keccakf1600_theta_xor_42_relation<FF>;
using lookup_theta_xor_43 = lookup_keccakf1600_theta_xor_43_relation<FF>;
using lookup_theta_xor_row_4 = lookup_keccakf1600_theta_xor_row_4_relation<FF>;
// Theta XOR combined and final values
using lookup_theta_combined_xor_0 = lookup_keccakf1600_theta_combined_xor_0_relation<FF>;
using lookup_theta_combined_xor_1 = lookup_keccakf1600_theta_combined_xor_1_relation<FF>;
using lookup_theta_combined_xor_2 = lookup_keccakf1600_theta_combined_xor_2_relation<FF>;
using lookup_theta_combined_xor_3 = lookup_keccakf1600_theta_combined_xor_3_relation<FF>;
using lookup_theta_combined_xor_4 = lookup_keccakf1600_theta_combined_xor_4_relation<FF>;
// State Theta final values
using lookup_state_theta_00 = lookup_keccakf1600_state_theta_00_relation<FF>;
using lookup_state_theta_01 = lookup_keccakf1600_state_theta_01_relation<FF>;
using lookup_state_theta_02 = lookup_keccakf1600_state_theta_02_relation<FF>;
using lookup_state_theta_03 = lookup_keccakf1600_state_theta_03_relation<FF>;
using lookup_state_theta_04 = lookup_keccakf1600_state_theta_04_relation<FF>;
using lookup_state_theta_10 = lookup_keccakf1600_state_theta_10_relation<FF>;
using lookup_state_theta_11 = lookup_keccakf1600_state_theta_11_relation<FF>;
using lookup_state_theta_12 = lookup_keccakf1600_state_theta_12_relation<FF>;
using lookup_state_theta_13 = lookup_keccakf1600_state_theta_13_relation<FF>;
using lookup_state_theta_14 = lookup_keccakf1600_state_theta_14_relation<FF>;
using lookup_state_theta_20 = lookup_keccakf1600_state_theta_20_relation<FF>;
using lookup_state_theta_21 = lookup_keccakf1600_state_theta_21_relation<FF>;
using lookup_state_theta_22 = lookup_keccakf1600_state_theta_22_relation<FF>;
using lookup_state_theta_23 = lookup_keccakf1600_state_theta_23_relation<FF>;
using lookup_state_theta_24 = lookup_keccakf1600_state_theta_24_relation<FF>;
using lookup_state_theta_30 = lookup_keccakf1600_state_theta_30_relation<FF>;
using lookup_state_theta_31 = lookup_keccakf1600_state_theta_31_relation<FF>;
using lookup_state_theta_32 = lookup_keccakf1600_state_theta_32_relation<FF>;
using lookup_state_theta_33 = lookup_keccakf1600_state_theta_33_relation<FF>;
using lookup_state_theta_34 = lookup_keccakf1600_state_theta_34_relation<FF>;
using lookup_state_theta_40 = lookup_keccakf1600_state_theta_40_relation<FF>;
using lookup_state_theta_41 = lookup_keccakf1600_state_theta_41_relation<FF>;
using lookup_state_theta_42 = lookup_keccakf1600_state_theta_42_relation<FF>;
using lookup_state_theta_43 = lookup_keccakf1600_state_theta_43_relation<FF>;
using lookup_state_theta_44 = lookup_keccakf1600_state_theta_44_relation<FF>;
// Range check on some state theta limbs
using lookup_theta_limb_range_01 = lookup_keccakf1600_theta_limb_01_range_relation<FF>;
using lookup_theta_limb_range_02 = lookup_keccakf1600_theta_limb_02_range_relation<FF>;
using lookup_theta_limb_range_03 = lookup_keccakf1600_theta_limb_03_range_relation<FF>;
using lookup_theta_limb_range_04 = lookup_keccakf1600_theta_limb_04_range_relation<FF>;
using lookup_theta_limb_range_10 = lookup_keccakf1600_theta_limb_10_range_relation<FF>;
using lookup_theta_limb_range_11 = lookup_keccakf1600_theta_limb_11_range_relation<FF>;
using lookup_theta_limb_range_12 = lookup_keccakf1600_theta_limb_12_range_relation<FF>;
using lookup_theta_limb_range_13 = lookup_keccakf1600_theta_limb_13_range_relation<FF>;
using lookup_theta_limb_range_14 = lookup_keccakf1600_theta_limb_14_range_relation<FF>;
using lookup_theta_limb_range_20 = lookup_keccakf1600_theta_limb_20_range_relation<FF>;
using lookup_theta_limb_range_21 = lookup_keccakf1600_theta_limb_21_range_relation<FF>;
using lookup_theta_limb_range_22 = lookup_keccakf1600_theta_limb_22_range_relation<FF>;
using lookup_theta_limb_range_23 = lookup_keccakf1600_theta_limb_23_range_relation<FF>;
using lookup_theta_limb_range_24 = lookup_keccakf1600_theta_limb_24_range_relation<FF>;
using lookup_theta_limb_range_30 = lookup_keccakf1600_theta_limb_30_range_relation<FF>;
using lookup_theta_limb_range_34 = lookup_keccakf1600_theta_limb_34_range_relation<FF>;
using lookup_theta_limb_range_40 = lookup_keccakf1600_theta_limb_40_range_relation<FF>;
using lookup_theta_limb_range_41 = lookup_keccakf1600_theta_limb_41_range_relation<FF>;
using lookup_theta_limb_range_42 = lookup_keccakf1600_theta_limb_42_range_relation<FF>;
using lookup_theta_limb_range_43 = lookup_keccakf1600_theta_limb_43_range_relation<FF>;
using lookup_theta_limb_range_44 = lookup_keccakf1600_theta_limb_44_range_relation<FF>;
// "pi and" values
using lookup_state_pi_and_00 = lookup_keccakf1600_state_pi_and_00_relation<FF>;
using lookup_state_pi_and_01 = lookup_keccakf1600_state_pi_and_01_relation<FF>;
using lookup_state_pi_and_02 = lookup_keccakf1600_state_pi_and_02_relation<FF>;
using lookup_state_pi_and_03 = lookup_keccakf1600_state_pi_and_03_relation<FF>;
using lookup_state_pi_and_04 = lookup_keccakf1600_state_pi_and_04_relation<FF>;
using lookup_state_pi_and_10 = lookup_keccakf1600_state_pi_and_10_relation<FF>;
using lookup_state_pi_and_11 = lookup_keccakf1600_state_pi_and_11_relation<FF>;
using lookup_state_pi_and_12 = lookup_keccakf1600_state_pi_and_12_relation<FF>;
using lookup_state_pi_and_13 = lookup_keccakf1600_state_pi_and_13_relation<FF>;
using lookup_state_pi_and_14 = lookup_keccakf1600_state_pi_and_14_relation<FF>;
using lookup_state_pi_and_20 = lookup_keccakf1600_state_pi_and_20_relation<FF>;
using lookup_state_pi_and_21 = lookup_keccakf1600_state_pi_and_21_relation<FF>;
using lookup_state_pi_and_22 = lookup_keccakf1600_state_pi_and_22_relation<FF>;
using lookup_state_pi_and_23 = lookup_keccakf1600_state_pi_and_23_relation<FF>;
using lookup_state_pi_and_24 = lookup_keccakf1600_state_pi_and_24_relation<FF>;
using lookup_state_pi_and_30 = lookup_keccakf1600_state_pi_and_30_relation<FF>;
using lookup_state_pi_and_31 = lookup_keccakf1600_state_pi_and_31_relation<FF>;
using lookup_state_pi_and_32 = lookup_keccakf1600_state_pi_and_32_relation<FF>;
using lookup_state_pi_and_33 = lookup_keccakf1600_state_pi_and_33_relation<FF>;
using lookup_state_pi_and_34 = lookup_keccakf1600_state_pi_and_34_relation<FF>;
using lookup_state_pi_and_40 = lookup_keccakf1600_state_pi_and_40_relation<FF>;
using lookup_state_pi_and_41 = lookup_keccakf1600_state_pi_and_41_relation<FF>;
using lookup_state_pi_and_42 = lookup_keccakf1600_state_pi_and_42_relation<FF>;
using lookup_state_pi_and_43 = lookup_keccakf1600_state_pi_and_43_relation<FF>;
using lookup_state_pi_and_44 = lookup_keccakf1600_state_pi_and_44_relation<FF>;
// chi values
using lookup_state_chi_00 = lookup_keccakf1600_state_chi_00_relation<FF>;
using lookup_state_chi_01 = lookup_keccakf1600_state_chi_01_relation<FF>;
using lookup_state_chi_02 = lookup_keccakf1600_state_chi_02_relation<FF>;
using lookup_state_chi_03 = lookup_keccakf1600_state_chi_03_relation<FF>;
using lookup_state_chi_04 = lookup_keccakf1600_state_chi_04_relation<FF>;
using lookup_state_chi_10 = lookup_keccakf1600_state_chi_10_relation<FF>;
using lookup_state_chi_11 = lookup_keccakf1600_state_chi_11_relation<FF>;
using lookup_state_chi_12 = lookup_keccakf1600_state_chi_12_relation<FF>;
using lookup_state_chi_13 = lookup_keccakf1600_state_chi_13_relation<FF>;
using lookup_state_chi_14 = lookup_keccakf1600_state_chi_14_relation<FF>;
using lookup_state_chi_20 = lookup_keccakf1600_state_chi_20_relation<FF>;
using lookup_state_chi_21 = lookup_keccakf1600_state_chi_21_relation<FF>;
using lookup_state_chi_22 = lookup_keccakf1600_state_chi_22_relation<FF>;
using lookup_state_chi_23 = lookup_keccakf1600_state_chi_23_relation<FF>;
using lookup_state_chi_24 = lookup_keccakf1600_state_chi_24_relation<FF>;
using lookup_state_chi_30 = lookup_keccakf1600_state_chi_30_relation<FF>;
using lookup_state_chi_31 = lookup_keccakf1600_state_chi_31_relation<FF>;
using lookup_state_chi_32 = lookup_keccakf1600_state_chi_32_relation<FF>;
using lookup_state_chi_33 = lookup_keccakf1600_state_chi_33_relation<FF>;
using lookup_state_chi_34 = lookup_keccakf1600_state_chi_34_relation<FF>;
using lookup_state_chi_40 = lookup_keccakf1600_state_chi_40_relation<FF>;
using lookup_state_chi_41 = lookup_keccakf1600_state_chi_41_relation<FF>;
using lookup_state_chi_42 = lookup_keccakf1600_state_chi_42_relation<FF>;
using lookup_state_chi_43 = lookup_keccakf1600_state_chi_43_relation<FF>;
using lookup_state_chi_44 = lookup_keccakf1600_state_chi_44_relation<FF>;
// iota_00 value
using lookup_iota_00 = lookup_keccakf1600_state_iota_00_relation<FF>;
// round constants lookup
using lookup_round_constants = lookup_keccakf1600_round_cst_relation<FF>;
// Memory slices permutations
using perm_read_to_slice = perm_keccakf1600_read_to_slice_relation<FF>;
using perm_write_to_slice = perm_keccakf1600_write_to_slice_relation<FF>;
// Range check for slice memory ranges.
using lookup_keccakf1600_src_abs_diff_positive = lookup_keccakf1600_src_abs_diff_positive_relation<FF>;
using lookup_keccakf1600_dst_abs_diff_positive = lookup_keccakf1600_dst_abs_diff_positive_relation<FF>;
// Keccak slice memory to memory sub-trace
using lookup_slice_to_mem = lookup_keccak_memory_slice_to_mem_relation<FF>;
// Helper function to simulate and generate a trace of a list of Keccakf1600 permutations.
void generate_trace(TestTraceContainer& trace,
                    const std::vector<MemoryAddress>& dst_addresses,
                    const std::vector<MemoryAddress>& src_addresses)
{
    KeccakF1600TraceBuilder keccak_builder;
    BitwiseTraceBuilder bitwise_builder;
    RangeCheckTraceBuilder range_check_builder;
    PrecomputedTraceBuilder precomputed_builder;
    MemoryTraceBuilder memory_builder;

    EventEmitter<simulation::BitwiseEvent> bitwise_event_emitter;
    EventEmitter<simulation::KeccakF1600Event> keccak_event_emitter;
    EventEmitter<simulation::RangeCheckEvent> range_check_event_emitter;
    EventEmitter<simulation::MemoryEvent> memory_event_emitter;
    RangeCheckSimulator range_check_simulator(range_check_event_emitter);
    BitwiseSimulator bitwise_simulator(bitwise_event_emitter);
    KeccakSimulator keccak_simulator(keccak_event_emitter, bitwise_simulator, range_check_simulator);
    MemorySimulator memory_simulator(/*space_id=*/0, range_check_simulator, memory_event_emitter);

    StrictMock<MockContext> context;
    EXPECT_CALL(context, get_memory()).WillRepeatedly(ReturnRef(memory_simulator));

    for (size_t i = 0; i < src_addresses.size(); i++) {
        // Write in memory first to fill source values in memory.
        // Arbitrary values: 100 * i + j * 2^32 + k
        for (size_t j = 0; j < 5; j++) {
            for (size_t k = 0; k < 5; k++) {
                memory_simulator.set(src_addresses[i] + static_cast<MemoryAddress>((5 * j) + k),
                                     MemoryValue::from<uint64_t>((static_cast<uint64_t>(j) << 32) + k + (100 * i)));
            }
        }

        keccak_simulator.permutation(context, dst_addresses.at(i), src_addresses.at(i));
    }

    const auto keccak_events = keccak_event_emitter.dump_events();

    keccak_builder.process_permutation(keccak_events, trace);
    keccak_builder.process_memory_slices(keccak_events, trace);
    bitwise_builder.process(bitwise_event_emitter.dump_events(), trace);
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);
    memory_builder.process(memory_event_emitter.dump_events(), trace);
    precomputed_builder.process_keccak_round_constants(trace);
    precomputed_builder.process_misc(trace, 25 * static_cast<uint32_t>(src_addresses.size()));
}

// Helper function to check all interactions.
void check_all_interactions(TestTraceContainer& trace)
{
    using tracegen::LookupIntoDynamicTableSequential;
    using tracegen::LookupIntoIndexedByClk;
    using tracegen::PermutationBuilder;

    // Theta XOR values
    LookupIntoDynamicTableSequential<lookup_theta_xor_01::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_02::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_03::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_row_0::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_11::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_12::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_13::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_row_1::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_21::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_22::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_23::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_row_2::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_31::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_32::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_33::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_row_3::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_41::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_42::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_43::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_xor_row_4::Settings>().process(trace);
    // Theta XOR combined and final values
    LookupIntoDynamicTableSequential<lookup_theta_combined_xor_0::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_combined_xor_1::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_combined_xor_2::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_combined_xor_3::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_combined_xor_4::Settings>().process(trace);
    // State Theta final values
    LookupIntoDynamicTableSequential<lookup_state_theta_00::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_01::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_02::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_03::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_04::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_10::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_11::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_12::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_13::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_14::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_20::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_21::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_22::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_23::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_24::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_30::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_31::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_32::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_33::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_34::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_40::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_41::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_42::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_43::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_theta_44::Settings>().process(trace);
    // Range check on some state theta limbs
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_01::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_02::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_03::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_04::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_10::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_11::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_12::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_13::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_14::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_20::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_21::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_22::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_23::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_24::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_30::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_34::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_40::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_41::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_42::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_43::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_theta_limb_range_44::Settings>().process(trace);
    // "pi and" values
    LookupIntoDynamicTableSequential<lookup_state_pi_and_00::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_01::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_02::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_03::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_04::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_10::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_11::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_12::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_13::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_14::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_20::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_21::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_22::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_23::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_24::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_30::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_31::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_32::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_33::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_34::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_40::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_41::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_42::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_43::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_pi_and_44::Settings>().process(trace);
    // chi values
    LookupIntoDynamicTableSequential<lookup_state_chi_00::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_01::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_02::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_03::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_04::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_10::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_11::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_12::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_13::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_14::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_20::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_21::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_22::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_23::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_24::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_30::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_31::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_32::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_33::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_34::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_40::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_41::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_42::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_43::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_state_chi_44::Settings>().process(trace);
    // iota_00 value
    LookupIntoDynamicTableSequential<lookup_iota_00::Settings>().process(trace);
    // round constants lookup
    LookupIntoIndexedByClk<lookup_round_constants::Settings>().process(trace);
    // Memory slices permutations
    PermutationBuilder<perm_read_to_slice::Settings>().process(trace);
    PermutationBuilder<perm_write_to_slice::Settings>().process(trace);
    // Range check for slice memory ranges.
    LookupIntoDynamicTableSequential<lookup_keccakf1600_src_abs_diff_positive::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_keccakf1600_dst_abs_diff_positive::Settings>().process(trace);
    // Keccak slice memory to memory sub-trace
    LookupIntoDynamicTableSequential<lookup_slice_to_mem::Settings>().process(trace);
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

    generate_trace(trace, { dst_addr }, { src_addr });

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

    generate_trace(trace, dst_addresses, src_addresses);

    check_all_interactions(trace);
    check_relation<keccakf1600_relation>(trace);
    check_relation<keccak_memory_relation>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
