#include "barretenberg/vm2/generated/relations/keccakf1600.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::constraining {
namespace {

using KeccakSimulator = simulation::KeccakF1600;
using BitwiseSimulator = simulation::Bitwise;

using tracegen::BitwiseTraceBuilder;
using tracegen::KeccakF1600TraceBuilder;
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
    TestTraceContainer trace;

    simulation::EventEmitter<simulation::BitwiseEvent> bitwise_event_emitter;
    simulation::EventEmitter<simulation::KeccakF1600Event> keccak_event_emitter;
    BitwiseSimulator bitwise_simulator(bitwise_event_emitter);
    KeccakSimulator keccak_simulator(keccak_event_emitter, bitwise_simulator);

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

    check_relation<keccakf1600_relation>(trace);
}

} // namespace bb::avm2::constraining