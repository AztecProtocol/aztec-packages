#include <cassert>
#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;

using bb::avm2::FF;

using range_check_rel = bb::avm2::range_check<FF>;

// We initialize it here once so it can be shared to other threads.
// We don't use LLVMFuzzerInitialize since (IIUC) it is not thread safe and we want to run this
// with multiple worker threads.
static const TestTraceContainer precomputed_trace = []() {
    TestTraceContainer t;
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_sel_range_16(t);
    precomputed_builder.process_sel_range_8(t);
    precomputed_builder.process_power_of_2(t);
    precomputed_builder.process_misc(t, 1 << 16);
    return t;
}();

// Each worker thread gets its own trace, initialized from precomputed_trace
thread_local static TestTraceContainer trace = precomputed_trace;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    // We need at least 17 bytes: 16 bytes for uint128_t value + 1 byte for num_bits
    size_t minimum_size = 17;

    if (size < minimum_size) {
        return 0;
    }

    // Fuzzed Data Provider helps with extracting typed data from the raw byte stream.
    FuzzedDataProvider fuzzed_data(data, size);

    // Read a uint128_t value (16 bytes)
    std::array<uint8_t, 16> value_bytes;
    for (size_t i = 0; i < 16; i++) {
        value_bytes[i] = fuzzed_data.ConsumeIntegral<uint8_t>();
    }
    uint128_t value = 0;
    for (size_t i = 0; i < 16; i++) {
        value |= (static_cast<uint128_t>(value_bytes[i]) << (i * 8));
    }

    // Read num_bits (1-128)
    uint8_t num_bits = fuzzed_data.ConsumeIntegralInRange<uint8_t>(1, 128);

    // Truncate value to fit within num_bits
    if (num_bits < 128) {
        uint128_t mask = (uint128_t(1) << num_bits) - 1;
        value = value & mask;
    }

    // Set up gadget and event emitter
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    RangeCheck range_check(range_check_emitter);

    // Execute the range check operation
    try {
        // info("Asserting range for value: ", value, " with num_bits: ", static_cast<int>(num_bits));
        range_check.assert_range(value, num_bits);
    } catch (const std::exception& e) {
        // If any exception occurs, we cannot proceed further.
        return 0;
    }

    // Process the events to build the trace (using the thread-local trace)
    RangeCheckTraceBuilder range_check_builder;
    range_check_builder.process(range_check_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    // Check the relation
    check_relation<range_check_rel>(trace);
    check_all_interactions<RangeCheckTraceBuilder>(trace);

    return 0;
}
