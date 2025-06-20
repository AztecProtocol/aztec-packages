#include "barretenberg/vm2/testing/keccakf1600_fixture.test.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"

#include <cstdint>
#include <gmock/gmock.h>

namespace bb::avm2::testing {

using MemorySimulator = simulation::Memory;
using KeccakSimulator = simulation::KeccakF1600;
using BitwiseSimulator = simulation::Bitwise;
using RangeCheckSimulator = simulation::RangeCheck;
using ExecutionIdManagerSimulator = simulation::ExecutionIdManager;
using simulation::EventEmitter;
using tracegen::BitwiseTraceBuilder;
using tracegen::KeccakF1600TraceBuilder;
using tracegen::MemoryTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;

void generate_keccak_trace_impl(TestTraceContainer& trace,
                                const std::function<void(MemorySimulator&, size_t)>& memory_init_fn,
                                const std::vector<MemoryAddress>& dst_addresses,
                                const std::vector<MemoryAddress>& src_addresses,
                                bool expect_error,
                                uint32_t space_id)
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
    ExecutionIdManagerSimulator execution_id_manager(1);
    RangeCheckSimulator range_check_simulator(range_check_event_emitter);
    BitwiseSimulator bitwise_simulator(bitwise_event_emitter);
    KeccakSimulator keccak_simulator(
        execution_id_manager, keccak_event_emitter, bitwise_simulator, range_check_simulator);
    MemorySimulator memory_simulator(space_id, range_check_simulator, execution_id_manager, memory_event_emitter);

    for (size_t i = 0; i < src_addresses.size(); i++) {
        memory_init_fn(memory_simulator, i);
        if (expect_error) {
            ASSERT_THROW(keccak_simulator.permutation(memory_simulator, dst_addresses.at(i), src_addresses.at(i)),
                         simulation::KeccakF1600Exception);
        } else {
            keccak_simulator.permutation(memory_simulator, dst_addresses.at(i), src_addresses.at(i));
        }
    }

    const auto keccak_events = keccak_event_emitter.dump_events();

    keccak_builder.process_permutation(keccak_events, trace);
    keccak_builder.process_memory_slices(keccak_events, trace);
    bitwise_builder.process(bitwise_event_emitter.dump_events(), trace);
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);
    memory_builder.process(memory_event_emitter.dump_events(), trace);
    precomputed_builder.process_keccak_round_constants(trace);
    precomputed_builder.process_misc(trace,
                                     3 * AVM_KECCAKF1600_STATE_SIZE * static_cast<uint32_t>(src_addresses.size()));
}

void generate_keccak_trace(TestTraceContainer& trace,
                           const std::vector<MemoryAddress>& dst_addresses,
                           const std::vector<MemoryAddress>& src_addresses,
                           uint32_t space_id)
{
    generate_keccak_trace_impl(
        trace,
        [&](MemorySimulator& memory_simulator, size_t i) {
            // Write in memory first to fill source values in memory.
            // Arbitrary values: 100 * i + j * 2^32 + k
            for (size_t j = 0; j < 5; j++) {
                for (size_t k = 0; k < 5; k++) {
                    memory_simulator.set(src_addresses[i] + static_cast<MemoryAddress>((5 * j) + k),
                                         MemoryValue::from<uint64_t>((static_cast<uint64_t>(j) << 32) + k + (100 * i)));
                }
            }
        },
        dst_addresses,
        src_addresses,
        false,
        space_id);
}

void generate_keccak_trace_with_tag_error(TestTraceContainer& trace,
                                          MemoryAddress dst_address,
                                          MemoryAddress src_address,
                                          size_t error_offset,
                                          MemoryTag error_tag,
                                          uint32_t space_id)
{
    generate_keccak_trace_impl(
        trace,
        [&](MemorySimulator& memory_simulator, size_t) {
            // Write in memory first to fill source values in memory.
            // Arbitrary values: 100 + j * 2^32 + k
            for (size_t j = 0; j < 5; j++) {
                for (size_t k = 0; k < 5; k++) {
                    const size_t idx = (5 * j) + k;
                    if (idx == error_offset) {
                        memory_simulator.set(
                            src_address + static_cast<MemoryAddress>(idx),
                            MemoryValue::from_tag_truncating(error_tag, (static_cast<uint64_t>(j) << 32) + k + 100));
                    } else {
                        memory_simulator.set(src_address + static_cast<MemoryAddress>(idx),
                                             MemoryValue::from<uint64_t>((static_cast<uint64_t>(j) << 32) + k + 100));
                    }
                }
            }
        },
        { dst_address },
        { src_address },
        true,
        space_id);
}

// Helper function to generate a keccak trace with a slice error.
void generate_keccak_trace_with_slice_error(TestTraceContainer& trace,
                                            MemoryAddress dst_address,
                                            MemoryAddress src_address,
                                            uint32_t space_id)
{
    // Precondition for this trace to make sense is that the src or dst slice is out of bounds.
    ASSERT_TRUE(src_address > AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 1 ||
                dst_address > AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 1);

    generate_keccak_trace_impl(
        trace,
        [&]([[maybe_unused]] MemorySimulator& memory_simulator, size_t) {},
        { dst_address },
        { src_address },
        true,
        space_id);
}

} // namespace bb::avm2::testing
