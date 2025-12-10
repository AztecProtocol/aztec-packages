#include "barretenberg/vm2/generated/relations/internal_call.hpp"
#include <array>
#include <cassert>
#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>
#include <memory>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/harness/context_helper.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/internal_call_stack_manager.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/internal_call_stack_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;
using namespace bb::avm2::fuzzing;

using bb::avm2::FF;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

using internal_call_rel = bb::avm2::internal_call<FF>;

const uint8_t max_flat_calls = 5;
const uint8_t max_nested_calls = 5;

// Constant instructions:
const auto call_instr =
    bb::avm2::testing::InstructionBuilder(WireOpCode::INTERNALCALL)
        .operand<uint32_t>(10)
        .build(); // TODO(MW): This operand value is ignored here since we don't test mem/addressing here
const auto ret_instr = bb::avm2::testing::InstructionBuilder(WireOpCode::INTERNALRETURN).build();
const auto dummy_instr = bb::avm2::testing::InstructionBuilder(WireOpCode::ADD_8)
                             .operand<uint8_t>(0)
                             .operand<uint8_t>(0)
                             .operand<uint8_t>(0)
                             .build();

struct InternalCallFuzzerInput {
    uint32_t start_pc;
    uint8_t num_flat_calls;
    uint8_t num_nested_calls;
    bool extra_pop;

    std::array<uint32_t, max_flat_calls + max_nested_calls> local_pcs;

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &start_pc, sizeof(start_pc));
        offset += sizeof(start_pc);
        std::memcpy(buffer + offset, &num_flat_calls, sizeof(num_flat_calls));
        offset += sizeof(num_flat_calls);
        std::memcpy(buffer + offset, &num_nested_calls, sizeof(num_nested_calls));
        offset += sizeof(num_nested_calls);
        std::memcpy(buffer + offset, &extra_pop, sizeof(extra_pop));
        offset += sizeof(extra_pop);
        std::memcpy(buffer + offset, &local_pcs[0], sizeof(uint32_t) * local_pcs.size());
    }

    static InternalCallFuzzerInput from_buffer(const uint8_t* buffer)
    {
        InternalCallFuzzerInput input;
        size_t offset = 0;
        std::memcpy(&input.start_pc, buffer + offset, sizeof(input.start_pc));
        offset += sizeof(input.start_pc);
        std::memcpy(&input.num_flat_calls, buffer + offset, sizeof(input.num_flat_calls));
        offset += sizeof(input.num_flat_calls);
        std::memcpy(&input.num_nested_calls, buffer + offset, sizeof(input.num_nested_calls));
        offset += sizeof(input.num_nested_calls);
        std::memcpy(&input.extra_pop, buffer + offset, sizeof(input.extra_pop));
        offset += sizeof(input.extra_pop);
        std::memcpy(&input.local_pcs[0], buffer + offset, sizeof(uint32_t) * input.local_pcs.size());

        return input;
    }
};

// TODO(MW)
// extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed) {}

// NOTE: context->serialize_context_event() causes stack overflow :(
ContextEvent fill_context_event(std::unique_ptr<ContextInterface>& context,
                                InternalCallStackManagerInterface& internal_call_stack_manager)
{
    return {
        .id = context->get_context_id(),
        .pc = context->get_pc(),
        .internal_call_id = internal_call_stack_manager.get_call_id(),
        .internal_call_return_id = internal_call_stack_manager.get_return_call_id(),
        .next_internal_call_id = internal_call_stack_manager.get_next_call_id(),
    };
}

void fuzz_internal_call(std::vector<ExecutionEvent>& ex_events,
                        std::unique_ptr<ContextInterface>& context,
                        InternalCallStackManagerInterface& internal_call_stack_manager,
                        uint32_t loc)
{
    ExecutionEvent ex_event = { .wire_instruction = call_instr,
                                .before_context_event = fill_context_event(context, internal_call_stack_manager) };
    // Execution.execute pre-dispatch:
    context->set_next_pc(context->get_pc() + static_cast<uint32_t>(call_instr.size_in_bytes()));

    // Execution.internal_call(context, loc) - internal_call_stack_manager.push() emits the internal call stack
    // event:
    internal_call_stack_manager.push(context->get_pc(), context->get_next_pc());
    context->set_next_pc(loc);

    // Execution.execute post-dispatch:
    context->set_pc(context->get_next_pc());

    ex_event.after_context_event = fill_context_event(context, internal_call_stack_manager);
    ex_events.push_back(ex_event);
}

void fuzz_internal_return(std::vector<ExecutionEvent>& ex_events,
                          std::unique_ptr<ContextInterface>& context,
                          InternalCallStackManagerInterface& internal_call_stack_manager)
{
    // TODO(MW): Case where we do not have a return i.e other exit condition?
    ExecutionEvent ex_event = { .wire_instruction = ret_instr,
                                .before_context_event = fill_context_event(context, internal_call_stack_manager) };
    // Execution.execute pre-dispatch:
    context->set_next_pc(context->get_pc() + static_cast<uint32_t>(ret_instr.size_in_bytes()));

    // Execution.internal_return(context):
    auto next_pc = internal_call_stack_manager.pop();
    context->set_next_pc(next_pc);

    // Execution.execute post-dispatch:
    context->set_pc(context->get_next_pc());
    ex_event.after_context_event = fill_context_event(context, internal_call_stack_manager);
    ex_events.push_back(ex_event);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    if (size < 64) {
        return 0;
    }

    FuzzedDataProvider fuzzed_data(data, size);

    // Set up gadgets and event emitters
    GadgetFuzzerContextHelper context_helper;
    auto context = std::move(context_helper.context);
    auto& internal_call_stack_manager = context->get_internal_call_stack_manager();
    uint32_t test_loc_pc = fuzzed_data.ConsumeIntegral<uint32_t>();
    uint32_t test_start_pc = fuzzed_data.ConsumeIntegral<uint32_t>();
    context->set_pc(test_start_pc);
    // Number i where we have (INTERNALCALL -> (INTERNALCALL -> INTERNALRETURN) xj -> INTERNALRETURN) xi
    auto num_flat_calls = 1;
    // Number j where we have (INTERNALCALL -> (INTERNALCALL -> INTERNALRETURN) xj -> INTERNALRETURN) xi
    auto num_nested_calls = 1;
    // Test case where we attempt to pop off an empty stack (will just return 0, to ensure coverage of case inside
    // gadgets/internal_call_stack_manager.cpp)
    // bool extra_pop = false;

    // TODO(MW): Can also:
    // 1. make_enqueued_context(fuzzed data) via context_helper
    // 2. run Execution::execute on it to emit execution event
    // 3. builder.process(ex_event) & usual interaction checks
    // NOTE: context->serialize_context_event() causes stack overflow :( (also, setting up bytecode so instruction
    // reading works is very involved...)

    // Instead, building an execution event with the relevant internal call fields:
    std::vector<ExecutionEvent> ex_events;

    try {
        for (auto i = 0; i < num_flat_calls; i++) {
            fuzz_internal_call(ex_events, context, internal_call_stack_manager, test_loc_pc);
            for (auto j = 0; j < num_nested_calls; j++) {
                fuzz_internal_call(ex_events, context, internal_call_stack_manager, test_loc_pc);
                fuzz_internal_return(ex_events, context, internal_call_stack_manager);
            }
            fuzz_internal_return(ex_events, context, internal_call_stack_manager);
        }
    } catch (const std::exception& e) {
        // If any exception occurs, we cannot proceed further.
        return 0;
    }

    assert(internal_call_stack_manager.get_current_call_stack().size() == 0);

    // Ideally I would set the final row via a gadget or at least an event, but I'm not sure how these
    // are actually set in the standard flow:
    ex_events.push_back({ .wire_instruction = dummy_instr,
                          .before_context_event = ex_events.at(ex_events.size() - 1).after_context_event });

    TestTraceContainer trace;
    ExecutionTraceBuilder ex_builder;
    InternalCallStackBuilder builder;

    ex_builder.process(ex_events, trace);
    builder.process(context_helper.internal_call_stack_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<internal_call_rel>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_internal_call_push_call_stack_settings,
                      lookup_internal_call_unwind_call_stack_settings>(trace);

    return 0;
}
