#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>

#include "barretenberg/avm_fuzzer/harness/mutation_helper.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/bitwise.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;
using namespace bb::avm2::fuzzing;

using bb::avm2::FF;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

using bitwise_rel = bb::avm2::bitwise<FF>;

// We initialize it here once so it can be shared to other threads.
// We don't use LLVMFuzzerInitialize since (IIUC) it is not thread safe and we want to run this
// with multiple worker threads.
static const TestTraceContainer precomputed_trace = []() {
    TestTraceContainer t;
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_bitwise(t);
    precomputed_builder.process_tag_parameters(t);
    precomputed_builder.process_misc(t, 1 << 18); // Need enough for bitwise trace
    return t;
}();

// Each worker thread gets its own trace, initialized from precomputed_trace
thread_local static TestTraceContainer trace = precomputed_trace;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    // two uint256 + <int>op_type + <int>tag_choice
    size_t minimum_size = 64 + (sizeof(int) * 2);

    if (size < minimum_size) {
        return 0;
    }

    // Fuzzed Data Provider helps with extracting typed data from the raw byte stream.
    FuzzedDataProvider fuzzed_data(data, size);

    MemoryValue a = read_mem_value(fuzzed_data);
    MemoryValue b = read_mem_value(fuzzed_data);

    MemoryValue c = MemoryValue::from_tag(MemoryTag::FF, 0); // Placeholder for result
    int op_id = 0;                                           // For execution trace bitwise_op_id

    int op_type = fuzzed_data.ConsumeIntegralInRange<int>(0, 2);

    // Set up gadgets and event emitters
    DeduplicatingEventEmitter<BitwiseEvent> bitwise_emitter;

    bool bitwise_error = false;

    Bitwise bitwise(bitwise_emitter);
    // Pick and execute operation
    try {
        switch (op_type) {
        case 0: {
            op_id = AVM_BITWISE_AND_OP_ID;
            c = bitwise.and_op(a, b);
            break;
        }
        case 1: {
            op_id = AVM_BITWISE_OR_OP_ID;
            c = bitwise.or_op(a, b);
            break;
        }
        case 2: {
            op_id = AVM_BITWISE_XOR_OP_ID;
            c = bitwise.xor_op(a, b);
            break;
        }
        default:
            return 0;
        }
    } catch (const BitwiseException& e) {
        // Bitwise Errors are recoverable
        bitwise_error = true;
    }

    // info("Fuzz Input: a: ", a.to_string(), ", b: ", b.to_string(), ", op_type: ", op_type);
    // Set execution trace columns
    trace.set(0,
              { {
                  { avm2::Column::execution_mem_tag_reg_0_, static_cast<uint8_t>(a.get_tag()) }, // = ia_tag
                  { avm2::Column::execution_mem_tag_reg_1_, static_cast<uint8_t>(b.get_tag()) }, // = ib_tag
                  { avm2::Column::execution_mem_tag_reg_2_, static_cast<uint8_t>(c.get_tag()) }, // = ic_tag
                  { avm2::Column::execution_register_0_, a.as_ff() },                            // = ia
                  { avm2::Column::execution_register_1_, b.as_ff() },                            // = ib
                  { avm2::Column::execution_register_2_, c.as_ff() },                            // = ic
                  { avm2::Column::execution_sel_exec_dispatch_bitwise, 1 },                      // = sel
                  { avm2::Column::execution_sel_opcode_error, bitwise_error ? 1 : 0 },           // = sel_err
                  { avm2::Column::execution_subtrace_operation_id, op_id },                      // = bitwise_op_id

              } });

    BitwiseTraceBuilder builder;
    builder.process(bitwise_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<bitwise_rel>(trace);
    check_all_interactions<BitwiseTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, bb::avm2::lookup_execution_dispatch_to_bitwise_settings>(trace);

    // Reset the bitwise portion of the trace for the next iteration, bitwise portion begins at row 1 and can maximally
    // create 16 additional rows(for U128). Therefore we reset rows [1, 17] This could be done more optimally by only
    // resetting get_tag_bytes(a.get_tag()) rows.
    for (uint8_t i = 1; i < 17; i++) {
        trace.set(i,
                  { {
                      { avm2::Column::bitwise_op_id, 0 },
                      { avm2::Column::bitwise_start, 0 },
                      { avm2::Column::bitwise_sel_get_ctr, 0 },
                      { avm2::Column::bitwise_last, 0 },
                      { avm2::Column::bitwise_acc_ia, 0 },
                      { avm2::Column::bitwise_acc_ib, 0 },
                      { avm2::Column::bitwise_acc_ic, 0 },
                      { avm2::Column::bitwise_ia_byte, 0 },
                      { avm2::Column::bitwise_ib_byte, 0 },
                      { avm2::Column::bitwise_ic_byte, 0 },
                      { avm2::Column::bitwise_tag_a, 0 },
                      { avm2::Column::bitwise_tag_b, 0 },
                      { avm2::Column::bitwise_tag_c, 0 },
                      { avm2::Column::bitwise_sel_tag_ff_err, 0 },
                      { avm2::Column::bitwise_sel_tag_mismatch_err, 0 },
                      { avm2::Column::bitwise_err, 0 },
                      { avm2::Column::bitwise_tag_a_inv, 0 },
                      { avm2::Column::bitwise_tag_ab_diff_inv, 0 },
                      { avm2::Column::bitwise_ctr, 0 },
                      { avm2::Column::bitwise_ctr_inv, 0 },
                      { avm2::Column::bitwise_ctr_min_one_inv, 0 },
                      { avm2::Column::bitwise_sel, 0 },
                      { avm2::Column::bitwise_tag_a_inv, 0 },
                      { avm2::Column::bitwise_tag_ab_diff_inv, 0 },
                  } });
    }

    return 0;
}
