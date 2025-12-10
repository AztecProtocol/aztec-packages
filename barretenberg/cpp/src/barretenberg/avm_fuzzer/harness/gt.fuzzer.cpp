#include <cassert>
#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>

#include "barretenberg/avm_fuzzer/harness/mutation_helper.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;
using namespace bb::avm2::fuzzing;

using bb::avm2::FF;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

using gt_rel = bb::avm2::gt<FF>;
using ff_gt_rel = bb::avm2::ff_gt<FF>;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    // two uint256 for memory values
    size_t minimum_size = 64;

    if (size < minimum_size) {
        return 0;
    }

    // Fuzzed Data Provider helps with extracting typed data from the raw byte stream.
    FuzzedDataProvider fuzzed_data(data, size);

    MemoryValue a = read_mem_value(fuzzed_data);
    MemoryValue b = read_mem_value(fuzzed_data);

    if (a.get_tag() != b.get_tag()) {
        // For internal use of greater than, tags should match.
        b = MemoryValue::from_tag_truncating(a.get_tag(), b.as_ff());
    }

    // Set up gadgets and event emitters
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;

    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    GreaterThan greater_than(field_gt, range_check, greater_than_emitter);

    // Execute the greater than operation
    bool result = false;
    try {
        result = greater_than.gt(a, b);
        // info("A: ", a.to_string(), ", B: ", b.to_string(), ", A > B: ", result);
        assert(result == (uint256_t(a.as_ff()) > uint256_t(b.as_ff())));
    } catch (const std::exception& e) {
        // If any exception occurs, we cannot proceed further.
        return 0;
    }

    // Initialize trace container
    auto trace = TestTraceContainer();

    // Process the events to build the trace
    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;

    range_check_builder.process(range_check_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_emitter.dump_events(), trace);
    gt_builder.process(greater_than_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    // Check the relation
    check_relation<gt_rel>(trace);
    check_relation<ff_gt_rel>(trace);
    check_all_interactions<GreaterThanTraceBuilder>(trace);
    check_all_interactions<FieldGreaterThanTraceBuilder>(trace);

    return 0;
}
