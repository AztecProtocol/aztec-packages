#include <cassert>
#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/alu.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;

using bb::avm2::FF;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

using alu_rel = bb::avm2::alu<FF>;

namespace {

// Do we want the option of making "invalid tag" values, where the value is out of range for the tag?
// These aren't currently possible with this function since MemoryValue::from_tag will throw in that case.
MemoryValue read_mem_value(FuzzedDataProvider& fdp)
{
    // Grab 32 bytes for a uint256
    uint64_t limb0 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb1 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb2 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb3 = fdp.ConsumeIntegral<uint64_t>();

    uint256_t value = uint256_t(limb0, limb1, limb2, limb3);

    int tag_choice = fdp.ConsumeIntegralInRange<int>(0, 6);
    switch (tag_choice) {
    case 0:
        return MemoryValue::from_tag_truncating(MemoryTag::U1, FF(value));
        break;
    case 1:
        return MemoryValue::from_tag_truncating(MemoryTag::U8, FF(value));
        break;
    case 2:
        return MemoryValue::from_tag_truncating(MemoryTag::U16, FF(value));
        break;
    case 3:
        return MemoryValue::from_tag_truncating(MemoryTag::U32, FF(value));
        break;
    case 4:
        return MemoryValue::from_tag_truncating(MemoryTag::U64, FF(value));
        break;
    case 5:
        return MemoryValue::from_tag_truncating(MemoryTag::U128, FF(value));
        break;
    case 6:
        return MemoryValue::from_tag_truncating(MemoryTag::FF, FF(value));
        break;
    default:
        assert(false && "unreachable");
    }
    // To statisfy compiler
    return MemoryValue::from_tag_truncating(MemoryTag::FF, FF(0));
}

} // namespace

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    // two uint256 + <int>op_type + <int>tag_choice + <int>is_zero
    size_t minimum_size = 64 + (sizeof(int) * 3);

    if (size < minimum_size) {
        return 0;
    }

    // Fuzzed Data Provider helps with extracting typed data from the raw byte stream.
    FuzzedDataProvider fuzzed_data(data, size);

    MemoryValue a = read_mem_value(fuzzed_data);
    MemoryValue b = read_mem_value(fuzzed_data);
    MemoryValue c = MemoryValue::from_tag(MemoryTag::FF, 0); // Placeholder for result
    bool error = false;                                      // For execution trace sel_err
    int op_id = 0;                                           // For execution trace alu_op_id

    int op_type = fuzzed_data.ConsumeIntegralInRange<int>(0, 11);

    // Set up gadgets and event emitters
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    DeduplicatingEventEmitter<AluEvent> alu_emitter;

    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    GreaterThan greater_than(field_gt, range_check, greater_than_emitter);
    Alu alu(greater_than, field_gt, range_check, alu_emitter);

    // info("Fuzzing ALU with op_type =", op_type, ", a_tag =", a.to_string(), ", b_tag =", b.to_string());
    // Pick and execute operation
    try {
        switch (op_type) {
        case 0: {
            op_id = AVM_EXEC_OP_ID_ALU_ADD;
            c = alu.add(a, b);
            assert(c == a + b);
            break;
        }
        case 1: {
            op_id = AVM_EXEC_OP_ID_ALU_SUB;
            c = alu.sub(a, b);
            assert(c == a - b);
            break;
        }
        case 2: {
            op_id = AVM_EXEC_OP_ID_ALU_MUL;
            c = alu.mul(a, b);
            assert(c == a * b);
            break;
        }
        case 3: {
            op_id = AVM_EXEC_OP_ID_ALU_DIV;
            c = alu.div(a, b);
            assert(c == a / b);
            break;
        }
        case 4: {
            op_id = AVM_EXEC_OP_ID_ALU_FDIV;
            c = alu.fdiv(a, b);
            assert(c == a / b);
            break;
        }
        case 5: {
            op_id = AVM_EXEC_OP_ID_ALU_EQ;
            c = alu.eq(a, b);
            assert(c == (a == b ? MemoryValue::from_tag(MemoryTag::U1, 1) : MemoryValue::from_tag(MemoryTag::U1, 0)));
            break;
        }
        case 6: {
            op_id = AVM_EXEC_OP_ID_ALU_LT;
            c = alu.lt(a, b);
            assert(c == (a < b ? MemoryValue::from_tag(MemoryTag::U1, 1) : MemoryValue::from_tag(MemoryTag::U1, 0)));
            break;
        }
        case 7: {
            op_id = AVM_EXEC_OP_ID_ALU_LTE;
            c = alu.lte(a, b);
            assert(c == (a <= b ? MemoryValue::from_tag(MemoryTag::U1, 1) : MemoryValue::from_tag(MemoryTag::U1, 0)));
            break;
        }
        case 8: {
            op_id = AVM_EXEC_OP_ID_ALU_NOT;
            // Reset b since if we error we need it to be zero for the trace
            b = MemoryValue::from_tag(MemoryTag::FF, 0);
            b = alu.op_not(a);
            assert(b == ~a);
            break;
        }
        case 9: {
            op_id = AVM_EXEC_OP_ID_ALU_SHR;
            c = alu.shr(a, b);
            assert(c == (a >> b));
            break;
        }
        case 10: {
            op_id = AVM_EXEC_OP_ID_ALU_SHL;
            c = alu.shl(a, b);
            assert(c == (a << b));
            break;
        }
        case 11: {
            op_id = AVM_EXEC_OP_ID_ALU_TRUNCATE;
            c = alu.truncate(a, b.get_tag());
            break;
        }
        default:
            return 0;
        }
    } catch (const AluException& e) {
        // Expected alu exception (e.g., division by zero), but we should handle it
        error = true;
    }

    TestTraceContainer trace = [&]() {
        if (op_id == AVM_EXEC_OP_ID_ALU_TRUNCATE) {
            // For truncate we will test using a CAST
            return TestTraceContainer({ {
                { avm2::Column::execution_register_0_, a.as_ff() },                            // = ia
                { avm2::Column::execution_register_1_, c.as_ff() },                            // = ic
                { avm2::Column::execution_mem_tag_reg_1_, static_cast<uint8_t>(b.get_tag()) }, // = ic_tag
                { avm2::Column::execution_rop_2_, static_cast<uint8_t>(b.get_tag()) },         // = truncate to tag
                { avm2::Column::execution_sel_exec_dispatch_cast, 1 },                         // = sel
                { avm2::Column::execution_sel_opcode_error, 0 },                               // = sel_err
            } });
        }
        // Otherwise standard initialization of trace container and execution trace columns
        return TestTraceContainer({ {
            { avm2::Column::execution_mem_tag_reg_0_, static_cast<uint8_t>(a.get_tag()) }, // = ia_tag
            { avm2::Column::execution_mem_tag_reg_1_, static_cast<uint8_t>(b.get_tag()) }, // = ib_tag
            { avm2::Column::execution_mem_tag_reg_2_, static_cast<uint8_t>(c.get_tag()) }, // = ic_tag
            { avm2::Column::execution_register_0_, a.as_ff() },                            // = ia
            { avm2::Column::execution_register_1_, b.as_ff() },                            // = ib
            { avm2::Column::execution_register_2_, c.as_ff() },                            // = ic
            { avm2::Column::execution_sel_exec_dispatch_alu, 1 },                          // = sel
            { avm2::Column::execution_sel_opcode_error, error ? 1 : 0 },                   // = sel_err
            { avm2::Column::execution_subtrace_operation_id, op_id },                      // = alu_op_id
        } });
    }();

    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    AluTraceBuilder builder;

    range_check_builder.process(range_check_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_emitter.dump_events(), trace);
    gt_builder.process(greater_than_emitter.dump_events(), trace);
    builder.process(alu_emitter.dump_events(), trace);

    // Precomputed values
    precomputed_builder.process_tag_parameters(trace);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_power_of_2(trace);
    precomputed_builder.process_misc(trace, 256); // Need enough for 8-bit range checks

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<alu_rel>(trace);
    check_all_interactions<AluTraceBuilder>(trace);

    if (op_id == AVM_EXEC_OP_ID_ALU_TRUNCATE) {
        check_interaction<ExecutionTraceBuilder, bb::avm2::lookup_execution_dispatch_to_cast_settings>(trace);
    } else {
        check_interaction<ExecutionTraceBuilder, bb::avm2::lookup_execution_dispatch_to_alu_settings>(trace);
    }

    return 0;
}
