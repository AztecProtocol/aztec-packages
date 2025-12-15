#include "barretenberg/vm2/generated/relations/external_call.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/generated/relations/internal_call.hpp"
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>
#include <memory>
#include <optional>
#include <string>
#include <tuple>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/harness/context_helper.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/gadgets/execution_components.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"
#include "barretenberg/vm2/simulation/interfaces/internal_call_stack_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
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

using external_call_rel = bb::avm2::external_call<FF>;

// TODO(MW):
// const uint8_t max_flat_calls = 5;
// const uint8_t max_nested_calls = 5;
// const uint8_t max_total_calls = max_flat_calls * max_nested_calls;

// Constant instructions:
const auto dummy_instr = bb::avm2::testing::InstructionBuilder(WireOpCode::ADD_8)
                             .operand<uint8_t>(0)
                             .operand<uint8_t>(0)
                             .operand<uint8_t>(0)
                             .build();

struct ExternalCallFuzzerInput {
    uint32_t start_pc = 0;
    AztecAddress contract_address;
    MemoryValue l2_gas = MemoryValue::from<uint32_t>(0);
    MemoryValue da_gas = MemoryValue::from<uint32_t>(0);
    bool is_static;
    // // Number i where we have (INTERNALCALL -> (INTERNALCALL -> INTERNALRETURN) xj -> INTERNALRETURN) xi
    // uint8_t num_flat_calls = 1;
    // // Number j where we have (INTERNALCALL -> (INTERNALCALL -> INTERNALRETURN) xj -> INTERNALRETURN) xi
    // uint8_t num_nested_calls = 0;

    ExternalCallFuzzerInput() = default;

    void print() const
    {
        info("start_pc: ", start_pc);
        info("contract_address: ", contract_address);
        info("l2_gas: ", l2_gas.to_string());
        info("da_gas: ", da_gas.to_string());
        info("is_static: ", is_static);
    }

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &start_pc, sizeof(start_pc));
        offset += sizeof(start_pc);
        std::memcpy(buffer + offset, &contract_address, sizeof(contract_address));
        offset += sizeof(contract_address);
        std::memcpy(buffer + offset, &l2_gas, sizeof(l2_gas));
        offset += sizeof(l2_gas);
        std::memcpy(buffer + offset, &da_gas, sizeof(da_gas));
        offset += sizeof(da_gas);
        std::memcpy(buffer + offset, &is_static, sizeof(is_static));
        offset += sizeof(is_static);
    }

    static ExternalCallFuzzerInput from_buffer(const uint8_t* buffer)
    {
        ExternalCallFuzzerInput input;
        size_t offset = 0;
        std::memcpy(&input.start_pc, buffer + offset, sizeof(input.start_pc));
        offset += sizeof(input.start_pc);
        std::memcpy(&input.contract_address, buffer + offset, sizeof(input.contract_address));
        offset += sizeof(input.contract_address);
        std::memcpy(&input.l2_gas, buffer + offset, sizeof(input.l2_gas));
        offset += sizeof(input.l2_gas);
        std::memcpy(&input.da_gas, buffer + offset, sizeof(input.da_gas));
        offset += sizeof(input.da_gas);
        std::memcpy(&input.is_static, buffer + offset, sizeof(input.is_static));
        offset += sizeof(input.is_static);

        return input;
    }
};

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed)
{
    if (size < sizeof(ExternalCallFuzzerInput)) {
        // Initialize with default input
        ExternalCallFuzzerInput input;
        input.to_buffer(data);
        return sizeof(ExternalCallFuzzerInput);
    }
    std::mt19937 rng(seed);

    // Deserialize current input
    ExternalCallFuzzerInput input = ExternalCallFuzzerInput::from_buffer(data);

    // Choose random mutation
    std::uniform_int_distribution<int> mutation_dist(0, 4);
    int mutation_choice = mutation_dist(rng);

    switch (mutation_choice) {
    case 0: {
        // Modify initial context pc
        std::uniform_int_distribution<uint32_t> start_pc_dist(0, std::numeric_limits<uint32_t>::max());
        input.start_pc = start_pc_dist(rng);
        break;
    }
    case 1: {
        // Modify l2 gas
        // TODO(MW): fuzz tags?
        std::uniform_int_distribution<uint32_t> gas_dist(0, std::numeric_limits<uint32_t>::max());
        input.l2_gas = MemoryValue::from<uint32_t>(gas_dist(rng));
        break;
    }
    case 2: {
        // Modify da gas
        // TODO(MW): fuzz tags?
        std::uniform_int_distribution<uint32_t> gas_dist(0, std::numeric_limits<uint32_t>::max());
        input.da_gas = MemoryValue::from<uint32_t>(gas_dist(rng));
        break;
    }
    case 3: {
        // Modify contract address
        std::uniform_int_distribution<uint64_t> addr_dist(0, std::numeric_limits<uint64_t>::max());
        input.contract_address = FF(addr_dist(rng), addr_dist(rng), addr_dist(rng), addr_dist(rng));
        break;
    }
    case 4: {
        // Toggle is_static
        input.is_static = !input.is_static;
        break;
    }
    default:
        break;
    }
    // Serialize mutated input back to buffer
    input.to_buffer(data);

    if (max_size > sizeof(ExternalCallFuzzerInput)) {
        return sizeof(ExternalCallFuzzerInput);
    }

    return sizeof(ExternalCallFuzzerInput);
}

// NOTE: context->serialize_context_event() causes stack overflow :(
ContextEvent fill_context_event(std::unique_ptr<ContextInterface>& context)
{
    return {
        .id = context->get_context_id(),
        .pc = context->get_pc(),
        .gas_used = context->get_gas_used(),
        .gas_limit = context->get_gas_limit(),
    };
}

void fuzz_call(std::vector<ExecutionEvent>& ex_events,
               GadgetFuzzerContextHelper& helper,
               ExecutionComponentsProvider& execution_components,
               ExternalCallFuzzerInput input)
{
    auto allocated_l2_gas_read = input.l2_gas;
    auto allocated_da_gas_read = input.da_gas;
    auto instr = bb::avm2::testing::InstructionBuilder(input.is_static ? WireOpCode::STATICCALL : WireOpCode::CALL)
                     .operand<uint8_t>(2)
                     .operand<uint8_t>(4)
                     .operand<uint8_t>(6)
                     .operand<uint8_t>(10)
                     .operand<uint8_t>(20)
                     .build();

    auto parent_context =
        helper.make_enqueued_fuzzing_context(input.contract_address, input.contract_address, input.is_static);
    parent_context->set_pc(input.start_pc);
    ExecutionEvent ex_event = { .wire_instruction = instr, .before_context_event = fill_context_event(parent_context) };
    AddressingEvent addressing_event;
    GasEvent gas_event;

    // TODO(MW): Fuzz and set operands?
    // mem.set(call_instr.operands, values);

    // Execution.execute pre - dispatch
    parent_context->set_next_pc(parent_context->get_pc() + static_cast<uint32_t>(instr.size_in_bytes()));
    auto addressing = execution_components.make_addressing(addressing_event);
    addressing->resolve(ex_event.wire_instruction, parent_context->get_memory());
    auto gas_tracker = execution_components.make_gas_tracker(gas_event, ex_event.wire_instruction, *parent_context);

    // Execution.call / static_call
    gas_tracker->consume_gas();
    auto new_gas_limit = gas_tracker->compute_gas_limit_for_call(
        Gas{ allocated_l2_gas_read.as<uint32_t>(), allocated_da_gas_read.as<uint32_t>() });

    auto child_context = helper.make_nested_fuzzing_context(
        input.contract_address, input.contract_address, *parent_context, new_gas_limit);

    // Execution.execute post-dispatch:
    parent_context->set_pc(parent_context->get_next_pc());
    ex_event.inputs = { allocated_l2_gas_read, allocated_da_gas_read, MemoryValue::from<FF>(input.contract_address) };
    ex_event.addressing_event = addressing_event;
    ex_event.gas_event = gas_event;
    ex_event.after_context_event = fill_context_event(parent_context);

    ex_events.push_back(ex_event);

    // Push event from the call itself (via nested child context)
    // Note: we only need the gas_limit in after_context_event, hence filling that rather than .before_context_event
    ExecutionEvent nested_event = { .wire_instruction = dummy_instr,
                                    .after_context_event = fill_context_event(child_context) };

    ex_events.push_back(nested_event);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    if (size < sizeof(ExternalCallFuzzerInput)) {
        return 0;
    }

    ExternalCallFuzzerInput input = ExternalCallFuzzerInput::from_buffer(data);

    // Set up gadgets and event emitters
    GadgetFuzzerContextHelper context_helper;
    InstructionInfoDB instruction_info_db;
    ExecutionComponentsProvider execution_components(context_helper.greater_than, instruction_info_db);
    std::vector<ExecutionEvent> ex_events;

    try {
        // TODO(MW): Multiple + nested calls
        fuzz_call(ex_events, context_helper, execution_components, input);
    } catch (const std::exception& e) {
        // No opcode errors to test here (TODO(MW): correct?)
        return 0;
    }

    TestTraceContainer trace;
    GreaterThanTraceBuilder gt_builder;
    ExecutionTraceBuilder ex_builder;

    ex_builder.process(ex_events, trace);
    gt_builder.process(context_helper.greater_than_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<external_call_rel>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_external_call_call_is_l2_gas_allocated_lt_left_settings,
                      lookup_external_call_call_is_da_gas_allocated_lt_left_settings>(trace);

    return 0;
}
