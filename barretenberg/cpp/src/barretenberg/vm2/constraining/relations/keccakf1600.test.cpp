#include "barretenberg/vm2/generated/relations/keccakf1600.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::constraining {
namespace {

using KeccakSimulator = simulation::KeccakF1600;
using BitwiseSimulator = simulation::Bitwise;
using RangeCheckSimulator = simulation::RangeCheck;
using simulation::EventEmitter;
using tracegen::BitwiseTraceBuilder;
using tracegen::KeccakF1600TraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;

using keccakf1600_relation = bb::avm2::keccakf1600<FF>;
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

} // namespace

TEST(KeccakF1600ConstrainingTest, EmptyRow)
{
    check_relation<keccakf1600_relation>(testing::empty_trace());
}

// Positive test with simulation and trace generation and checking interactions.
TEST(KeccakF1600ConstrainingTest, withSimulationAndTraceGenInteractions)
{
    KeccakF1600TraceBuilder keccak_builder;
    BitwiseTraceBuilder bitwise_builder;
    RangeCheckTraceBuilder range_check_builder;
    TestTraceContainer trace;

    EventEmitter<simulation::BitwiseEvent> bitwise_event_emitter;
    EventEmitter<simulation::KeccakF1600Event> keccak_event_emitter;
    EventEmitter<simulation::RangeCheckEvent> range_check_event_emitter;
    RangeCheckSimulator range_check_simulator(range_check_event_emitter);
    BitwiseSimulator bitwise_simulator(bitwise_event_emitter);
    KeccakSimulator keccak_simulator(keccak_event_emitter, bitwise_simulator, range_check_simulator);

    simulation::KeccakF1600State input_state;

    // Fill input_state with arbitrarily chosen test vector: state[i][j] = 2^32 * i + j
    for (size_t i = 0; i < 5; ++i) {
        for (size_t j = 0; j < 5; ++j) {
            input_state[i][j] = (static_cast<uint64_t>(i) << 32) + j;
        }
    }

    keccak_simulator.permutation(input_state);

    keccak_builder.process(keccak_event_emitter.dump_events(), trace);
    bitwise_builder.process(bitwise_event_emitter.dump_events(), trace);
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    // Theta XOR values
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_01::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_02::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_03::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_row_0::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_11::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_12::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_13::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_row_1::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_21::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_22::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_23::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_row_2::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_31::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_32::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_33::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_row_3::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_41::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_42::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_43::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_xor_row_4::Settings>().process(trace);
    // Theta XOR combined and final values
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_combined_xor_0::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_combined_xor_1::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_combined_xor_2::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_combined_xor_3::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_combined_xor_4::Settings>().process(trace);
    // State Theta final values
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_00::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_01::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_02::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_03::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_04::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_10::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_11::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_12::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_13::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_14::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_20::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_21::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_22::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_23::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_24::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_30::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_31::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_32::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_33::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_34::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_40::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_41::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_42::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_43::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_state_theta_44::Settings>().process(trace);
    // Range check on some state theta limbs
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_01::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_02::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_03::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_04::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_10::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_11::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_12::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_13::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_14::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_20::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_21::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_22::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_23::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_24::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_30::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_34::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_40::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_41::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_42::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_43::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<lookup_theta_limb_range_44::Settings>().process(trace);

    // Check relations
    check_relation<keccakf1600_relation>(trace);
}

} // namespace bb::avm2::constraining