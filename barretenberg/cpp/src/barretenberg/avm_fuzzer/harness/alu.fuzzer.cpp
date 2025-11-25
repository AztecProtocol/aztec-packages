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

struct AluFuzzerInput {
    MemoryValue a;
    MemoryValue b;
    MemoryValue c = MemoryValue::from_tag(MemoryTag::FF, 0); // Placeholder for result
    int op_id = 0;                                           // For execution trace alu_op_id

    // Serialize to buffer
    void to_buffer(uint8_t* buffer) const
    {
        auto write_mem_value = [](uint8_t* target, MemoryValue mem_value) {
            serialize::write(target, static_cast<uint8_t>(mem_value.get_tag()));
            FF::serialize_to_buffer(mem_value.as_ff(), target);
        };

        write_mem_value(buffer, a);
        buffer += sizeof(FF) + 1;
        write_mem_value(buffer, b);
        buffer += sizeof(FF) + 1;
        write_mem_value(buffer, c);
        buffer += sizeof(FF) + 1;
        serialize::write(buffer, static_cast<uint16_t>(op_id));
    }

    static AluFuzzerInput from_buffer(const uint8_t* buffer)
    {
        auto read_mem_value = [](const uint8_t* src) -> MemoryValue {
            uint8_t tag = 0;
            serialize::read(src, tag);
            return MemoryValue::from_tag(MemoryTag(tag), FF::serialize_from_buffer(src));
        };

        AluFuzzerInput input;
        input.a = read_mem_value(buffer);
        buffer += sizeof(FF) + 1;
        input.b = read_mem_value(buffer);
        buffer += sizeof(FF) + 1;
        input.c = read_mem_value(buffer);
        buffer += sizeof(FF) + 1;
        uint16_t op_id = 0;
        serialize::read(buffer, op_id);
        input.op_id = op_id;

        return input;
    }
};

} // namespace

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed)
{
    if (size < sizeof(AluFuzzerInput)) {
        // Initialize with default input
        AluFuzzerInput input;
        input.to_buffer(data);
        return sizeof(AluFuzzerInput);
    }

    std::mt19937_64 rng(seed);

    auto op_likes_matched_tags = [](int op_id) -> bool {
        switch (op_id) {
        case AVM_EXEC_OP_ID_ALU_ADD:
        case AVM_EXEC_OP_ID_ALU_SUB:
        case AVM_EXEC_OP_ID_ALU_MUL:
        case AVM_EXEC_OP_ID_ALU_DIV:
        case AVM_EXEC_OP_ID_ALU_FDIV:
        case AVM_EXEC_OP_ID_ALU_EQ:
        case AVM_EXEC_OP_ID_ALU_LT:
        case AVM_EXEC_OP_ID_ALU_LTE:
        case AVM_EXEC_OP_ID_ALU_SHR:
        case AVM_EXEC_OP_ID_ALU_SHL:
            return true;
        case AVM_EXEC_OP_ID_ALU_NOT:
        case AVM_EXEC_OP_ID_ALU_TRUNCATE:
        default:
            return false;
        }
    };

    auto random_mem_value_from_tag = [&rng](MemoryTag tag) -> MemoryValue {
        std::uniform_int_distribution<uint64_t> dist(0, std::numeric_limits<uint64_t>::max());
        // TODO(MW): Use array?
        FF value = FF(dist(rng), dist(rng), dist(rng), dist(rng));
        // Do we want the option of making "invalid tag" values, where the value is out of range for the tag?
        // These aren't currently possible with this function since MemoryValue::from_tag will throw in that case.
        return MemoryValue::from_tag_truncating(MemoryTag(tag), value);
    };

    auto random_mem_value = [&rng, random_mem_value_from_tag]() -> MemoryValue {
        std::uniform_int_distribution<int> dist(0, int(MemoryTag::MAX));
        MemoryTag tag = static_cast<MemoryTag>(dist(rng));
        return random_mem_value_from_tag(tag);
    };

    // Deserialize current input
    AluFuzzerInput input = AluFuzzerInput::from_buffer(data);

    // Choose random ALU operation
    std::uniform_int_distribution<int> dist(0, 11);
    input.op_id = 1 << dist(rng);

    // Choose test case (TODO(MW): what else do we want here?)
    dist = std::uniform_int_distribution<int>(0, 4);
    int choice = dist(rng);

    // Choose random tag and values
    switch (choice) {
    case 0: {
        // Set a
        input.a = random_mem_value();
        break;
    }
    case 1: {
        // Matching tags (if the op's happy path expects them)
        if (op_likes_matched_tags(input.op_id)) {
            input.b = random_mem_value_from_tag(input.a.get_tag());
        } else {
            // We deal with the below ops in TestOneInput
            input.b = random_mem_value();
        }
        break;
    }
    case 2: {
        // Mismatching tags (if the op's happy path expects a match)
        input.b = random_mem_value();
        if (op_likes_matched_tags(input.op_id)) {
            while (input.b.get_tag() == input.a.get_tag()) {
                input.b = random_mem_value();
            }
        }
        break;
    }
    case 3: {
        // Set a = b
        input.a = input.b;
        break;
    }
    case 4: {
        // Swap a and b
        std::swap(input.a, input.b);
        break;
    }
    default:
        break;
    }

    // Serialize mutated input back to buffer
    input.to_buffer(data);

    if (max_size > sizeof(AluFuzzerInput)) {
        return sizeof(AluFuzzerInput);
    }

    return sizeof(AluFuzzerInput);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    if (size < sizeof(AluFuzzerInput)) {
        info("Input size too small");
        return 0;
    }

    AluFuzzerInput input = AluFuzzerInput::from_buffer(data);
    bool error = false; // For execution trace sel_err

    // Set up gadgets and event emitters
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    DeduplicatingEventEmitter<AluEvent> alu_emitter;

    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    GreaterThan greater_than(field_gt, range_check, greater_than_emitter);
    Alu alu(greater_than, field_gt, range_check, alu_emitter);

    // info("Fuzzing ALU with op_id =", input.op_id, ", a_tag =", input.a.to_string(), ", b_tag =",input.b.to_string());

    // Pick and execute operation
    try {
        switch (input.op_id) {
        case AVM_EXEC_OP_ID_ALU_ADD: {
            input.c = alu.add(input.a, input.b);
            assert(input.c == input.a + input.b);
            break;
        }
        case AVM_EXEC_OP_ID_ALU_SUB: {
            input.c = alu.sub(input.a, input.b);
            assert(input.c == input.a - input.b);
            break;
        }
        case AVM_EXEC_OP_ID_ALU_MUL: {
            input.c = alu.mul(input.a, input.b);
            assert(input.c == input.a * input.b);
            break;
        }
        case AVM_EXEC_OP_ID_ALU_DIV: {
            input.c = alu.div(input.a, input.b);
            assert(input.c == input.a / input.b);
            break;
        }
        case AVM_EXEC_OP_ID_ALU_FDIV: {
            input.c = alu.fdiv(input.a, input.b);
            assert(input.c == input.a / input.b);
            break;
        }
        case AVM_EXEC_OP_ID_ALU_EQ: {
            input.c = alu.eq(input.a, input.b);
            assert(input.c == (input.a == input.b ? MemoryValue::from_tag(MemoryTag::U1, 1)
                                                  : MemoryValue::from_tag(MemoryTag::U1, 0)));
            break;
        }
        case AVM_EXEC_OP_ID_ALU_LT: {
            input.c = alu.lt(input.a, input.b);
            assert(input.c == (input.a < input.b ? MemoryValue::from_tag(MemoryTag::U1, 1)
                                                 : MemoryValue::from_tag(MemoryTag::U1, 0)));
            break;
        }
        case AVM_EXEC_OP_ID_ALU_LTE: {
            input.c = alu.lte(input.a, input.b);
            assert(input.c == (input.a <= input.b ? MemoryValue::from_tag(MemoryTag::U1, 1)
                                                  : MemoryValue::from_tag(MemoryTag::U1, 0)));
            break;
        }
        case AVM_EXEC_OP_ID_ALU_NOT: {
            // Reset b since if we error we need it to be zero for the trace
            input.b = MemoryValue::from_tag(MemoryTag::FF, 0);
            input.b = alu.op_not(input.a);
            assert(input.b == ~input.a);
            break;
        }
        case AVM_EXEC_OP_ID_ALU_SHR: {
            input.c = alu.shr(input.a, input.b);
            assert(input.c == (input.a >> input.b));
            break;
        }
        case AVM_EXEC_OP_ID_ALU_SHL: {
            input.c = alu.shl(input.a, input.b);
            assert(input.c == (input.a << input.b));
            break;
        }
        case AVM_EXEC_OP_ID_ALU_TRUNCATE: {
            input.c = alu.truncate(input.a, input.b.get_tag());
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
        if (input.op_id == AVM_EXEC_OP_ID_ALU_TRUNCATE) {
            // For truncate we will test using a CAST
            return TestTraceContainer({ {
                { avm2::Column::execution_register_0_, input.a.as_ff() },                            // = ia
                { avm2::Column::execution_register_1_, input.c.as_ff() },                            // = ic
                { avm2::Column::execution_mem_tag_reg_1_, static_cast<uint8_t>(input.b.get_tag()) }, // = ic_tag
                { avm2::Column::execution_rop_2_, static_cast<uint8_t>(input.b.get_tag()) }, // = truncate to tag
                { avm2::Column::execution_sel_exec_dispatch_cast, 1 },                       // = sel
                { avm2::Column::execution_sel_opcode_error, 0 },                             // = sel_err
            } });
        }
        // Otherwise standard initialization of trace container and execution trace columns
        return TestTraceContainer({ {
            { avm2::Column::execution_mem_tag_reg_0_, static_cast<uint8_t>(input.a.get_tag()) }, // = ia_tag
            { avm2::Column::execution_mem_tag_reg_1_, static_cast<uint8_t>(input.b.get_tag()) }, // = ib_tag
            { avm2::Column::execution_mem_tag_reg_2_, static_cast<uint8_t>(input.c.get_tag()) }, // = ic_tag
            { avm2::Column::execution_register_0_, input.a.as_ff() },                            // = ia
            { avm2::Column::execution_register_1_, input.b.as_ff() },                            // = ib
            { avm2::Column::execution_register_2_, input.c.as_ff() },                            // = ic
            { avm2::Column::execution_sel_exec_dispatch_alu, 1 },                                // = sel
            { avm2::Column::execution_sel_opcode_error, error ? 1 : 0 },                         // = sel_err
            { avm2::Column::execution_subtrace_operation_id, input.op_id },                      // = alu_op_id
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

    if (input.op_id == AVM_EXEC_OP_ID_ALU_TRUNCATE) {
        check_interaction<ExecutionTraceBuilder, bb::avm2::lookup_execution_dispatch_to_cast_settings>(trace);
    } else {
        check_interaction<ExecutionTraceBuilder, bb::avm2::lookup_execution_dispatch_to_alu_settings>(trace);
    }

    return 0;
}
