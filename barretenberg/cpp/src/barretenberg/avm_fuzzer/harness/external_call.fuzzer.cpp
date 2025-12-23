#include "barretenberg/vm2/generated/relations/external_call.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/harness/context_helper.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/execution_components.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;
using namespace bb::avm2::fuzzing;

using bb::avm2::FF;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

using external_call_rel = bb::avm2::external_call<FF>;

const uint8_t max_flat_calls = 3;
const uint8_t max_nested_calls = 2;
const uint8_t max_total_calls = max_flat_calls * max_nested_calls;
// To avoid OOG error:
const uint32_t min_l2_gas = AVM_CALL_BASE_L2_GAS + AVM_RETURN_BASE_L2_GAS;

// Constant instructions:
const auto dummy_instr = bb::avm2::testing::InstructionBuilder(WireOpCode::ADD_8)
                             .operand<uint8_t>(0)
                             .operand<uint8_t>(0)
                             .operand<uint8_t>(0)
                             .build();

struct ExternalCallFuzzerInstance {
    AztecAddress contract_address;
    MemoryValue l2_gas = MemoryValue::from<uint32_t>(min_l2_gas);
    MemoryValue da_gas = MemoryValue::from<uint32_t>(0);
    bool is_static;

    ExternalCallFuzzerInstance() = default;

    void print() const
    {
        info("contract_address: ", contract_address);
        info("l2_gas: ", l2_gas.to_string());
        info("da_gas: ", da_gas.to_string());
        info("is_static: ", is_static);
    }

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &contract_address, sizeof(contract_address));
        offset += sizeof(contract_address);
        std::memcpy(buffer + offset, &l2_gas, sizeof(l2_gas));
        offset += sizeof(l2_gas);
        std::memcpy(buffer + offset, &da_gas, sizeof(da_gas));
        offset += sizeof(da_gas);
        std::memcpy(buffer + offset, &is_static, sizeof(is_static));
        offset += sizeof(is_static);
    }

    static ExternalCallFuzzerInstance from_buffer(const uint8_t* buffer)
    {
        ExternalCallFuzzerInstance input;
        size_t offset = 0;
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

struct ExternalCallFuzzerInput {
    uint32_t start_pc = 0;
    // Number i where we have (CALL/STATICCALL -> (CALL/STATICCALL -> RETURN) xj -> RETURN) xi
    uint8_t num_flat_calls = 1;
    // Number j where we have (CALL/STATICCALL -> (CALL/STATICCALL -> RETURN) xj -> RETURN) xi
    uint8_t num_nested_calls = 0;

    std::array<ExternalCallFuzzerInstance, max_total_calls> call_instances{};

    ExternalCallFuzzerInput() = default;

    void print() const
    {
        info("start_pc: ", start_pc);
        info("num_flat_calls: ", int(num_flat_calls));
        info("num_nested_calls: ", int(num_nested_calls));
        for (size_t i = 0; i < call_instances.size(); i++) {
            info("call_instance ", i, ": ");
            call_instances[i].print();
        }
    }

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &start_pc, sizeof(start_pc));
        offset += sizeof(start_pc);
        std::memcpy(buffer + offset, &num_flat_calls, sizeof(num_flat_calls));
        offset += sizeof(num_flat_calls);
        std::memcpy(buffer + offset, &num_nested_calls, sizeof(num_nested_calls));
        offset += sizeof(num_nested_calls);
        for (const auto& call_instance : call_instances) {
            call_instance.to_buffer(buffer + offset);
            offset += sizeof(ExternalCallFuzzerInstance);
        }
    }

    static ExternalCallFuzzerInput from_buffer(const uint8_t* buffer)
    {
        ExternalCallFuzzerInput input;
        size_t offset = 0;
        std::memcpy(&input.start_pc, buffer + offset, sizeof(input.start_pc));
        offset += sizeof(input.start_pc);
        std::memcpy(&input.num_flat_calls, buffer + offset, sizeof(input.num_flat_calls));
        offset += sizeof(input.num_flat_calls);
        std::memcpy(&input.num_nested_calls, buffer + offset, sizeof(input.num_nested_calls));
        offset += sizeof(input.num_nested_calls);
        for (auto& call_instance : input.call_instances) {
            call_instance = ExternalCallFuzzerInstance::from_buffer(buffer + offset);
            offset += sizeof(ExternalCallFuzzerInstance);
        }

        return input;
    }
};

// Mutate a single random call instance
void mutate_call_instance(ExternalCallFuzzerInput& input, std::mt19937 rng)
{
    // Modify a random call instance (using num_events to ensure it's used in a run)
    size_t num_events =
        static_cast<size_t>(input.num_flat_calls) * (input.num_nested_calls == 0 ? 1 : input.num_nested_calls);
    std::uniform_int_distribution<size_t> index_dist(0, num_events == 0 ? 0 : num_events - 1);
    size_t value_idx = index_dist(rng);
    std::uniform_int_distribution<int> inner_mutation_dist(0, 3);
    int inner_mutation_choice = inner_mutation_dist(rng);
    switch (inner_mutation_choice) {
    case 0: {
        // Modify l2 gas (a minimum of min_l2_gas to avoid OOG error)
        std::uniform_int_distribution<uint32_t> gas_dist(min_l2_gas, std::numeric_limits<uint32_t>::max());
        input.call_instances[value_idx].l2_gas = MemoryValue::from<uint32_t>(gas_dist(rng));
        break;
    }
    case 1: {
        // Modify da gas
        std::uniform_int_distribution<uint32_t> gas_dist(0, std::numeric_limits<uint32_t>::max());
        input.call_instances[value_idx].da_gas = MemoryValue::from<uint32_t>(gas_dist(rng));
        break;
    }
    case 2: {
        // Modify contract address
        std::uniform_int_distribution<uint64_t> addr_dist(0, std::numeric_limits<uint64_t>::max());
        input.call_instances[value_idx].contract_address =
            FF(addr_dist(rng), addr_dist(rng), addr_dist(rng), addr_dist(rng));
        break;
    }
    case 3: {
        // Toggle is_static
        input.call_instances[value_idx].is_static = !input.call_instances[value_idx].is_static;
        break;
    }
    default:
        break;
    }
}

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
    std::uniform_int_distribution<int> mutation_dist(0, 3);
    int mutation_choice = mutation_dist(rng);

    switch (mutation_choice) {
    case 0: {
        // Modify number of flat internal calls
        std::uniform_int_distribution<uint8_t> num_flat_calls_dist(1, max_flat_calls);
        input.num_flat_calls = num_flat_calls_dist(rng);
        break;
    }
    case 1: {
        // Modify number of nested internal calls
        std::uniform_int_distribution<uint8_t> num_nested_calls_dist(0, max_nested_calls);
        input.num_nested_calls = num_nested_calls_dist(rng);
        break;
    }
    case 2: {
        // Modify initial context pc
        size_t num_events =
            static_cast<size_t>(input.num_flat_calls) * (input.num_nested_calls == 0 ? 1 : input.num_nested_calls);
        // Creating a large offset to avoid overflow of pc
        const auto& spec = get_wire_instruction_spec();
        size_t instr_sizes_offset =
            num_events * (spec.at(WireOpCode::CALL).size_in_bytes + spec.at(WireOpCode::RETURN).size_in_bytes +
                          dummy_instr.size_in_bytes());
        std::uniform_int_distribution<uint32_t> start_pc_dist(
            0, std::numeric_limits<uint32_t>::max() - uint32_t(instr_sizes_offset));
        input.start_pc = start_pc_dist(rng);
        break;
    }
    case 3: {
        // Modify a random calldata instance
        mutate_call_instance(input, rng);
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
        .parent_id = context->get_parent_id(),
        .pc = context->get_pc(),
        .gas_used = context->get_gas_used(),
        .gas_limit = context->get_gas_limit(),
    };
}

std::unique_ptr<ContextInterface> fuzz_call(std::vector<ExecutionEvent>& ex_events,
                                            GadgetFuzzerContextHelper& helper,
                                            std::unique_ptr<ContextInterface>& parent_context,
                                            ExecutionComponentsProvider& execution_components,
                                            ExternalCallFuzzerInstance input)
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
        input.contract_address, input.contract_address, *parent_context, input.is_static, new_gas_limit);

    // Execution.execute post-dispatch:
    parent_context->set_pc(parent_context->get_next_pc());
    ex_event.inputs = { allocated_l2_gas_read,
                        allocated_da_gas_read,
                        MemoryValue::from<FF>(input.contract_address),
                        /* cd_size = */ MemoryValue::from<uint32_t>(0) };
    ex_event.addressing_event = addressing_event;
    ex_event.gas_event = gas_event;
    ex_event.after_context_event = fill_context_event(parent_context);

    ex_events.push_back(ex_event);

    // Push event from the call itself (via nested child context)
    // Note: we only need the gas_limit in after_context_event, hence filling that rather than .before_context_event
    ExecutionEvent nested_event = {
        .wire_instruction = dummy_instr,
        .inputs = { MemoryValue::from(FF(0)), MemoryValue::from(FF(0)), MemoryValue::from(FF(0)) },
        .after_context_event = fill_context_event(child_context)
    };

    ex_events.push_back(nested_event);

    return child_context;
}

void fuzz_return(std::vector<ExecutionEvent>& ex_events,
                 std::unique_ptr<ContextInterface>& context,
                 ExecutionComponentsProvider& execution_components)
{
    auto instr = bb::avm2::testing::InstructionBuilder(WireOpCode::RETURN)
                     .operand<uint8_t>(30) // ret_size_offset
                     .operand<uint8_t>(40) // ret_offset
                     .build();

    ExecutionEvent ex_event = { .wire_instruction = instr, .before_context_event = fill_context_event(context) };
    GasEvent gas_event;

    // Execution.execute pre - dispatch
    context->set_next_pc(context->get_pc() + static_cast<uint32_t>(instr.size_in_bytes()));
    auto gas_tracker = execution_components.make_gas_tracker(gas_event, ex_event.wire_instruction, *context);

    // Execution.ret
    gas_tracker->consume_gas();

    // TODO(MW): Mimic set execution result to set gas_used and check w asserts for nested returns:

    // set_execution_result({ .rd_offset = ret_offset,
    //                    .rd_size = rd_size.as<uint32_t>(),
    //                    .gas_used = context.get_gas_used(),
    //                    .success = true,
    //                    .halting_pc = context.get_pc(),
    //                    .halting_message = std::nullopt });

    context->halt();

    // Execution.execute post-dispatch:
    context->set_pc(context->get_next_pc());
    ex_event.inputs = { MemoryValue::from<uint32_t>(10) /* =rd_size, TODO(MW): fuzz? */ };
    ex_event.after_context_event = fill_context_event(context);

    ex_events.push_back(ex_event);
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
    auto context = context_helper.make_enqueued_fuzzing_context();
    context->set_pc(input.start_pc);
    InstructionInfoDB instruction_info_db;
    ExecutionComponentsProvider execution_components(context_helper.greater_than, instruction_info_db);
    std::vector<ExecutionEvent> ex_events;

    try {
        size_t current_call_idx = 0;
        for (auto i = 0; i < input.num_flat_calls; i++) {
            auto child_context = fuzz_call(
                ex_events, context_helper, context, execution_components, input.call_instances[current_call_idx++]);
            if (input.num_nested_calls > 0) {
                fuzz_call(ex_events,
                          context_helper,
                          child_context,
                          execution_components,
                          input.call_instances[current_call_idx++]);
                fuzz_return(ex_events, child_context, execution_components);
                // TODO(MW): Handle exit call for nested?
            }
            fuzz_return(ex_events, context, execution_components);
            // This fuzzer doesn't test beyond the external_call.pil relations/lookups, so we don't need a
            // handle_exit_call() after the top level
        }

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
                      lookup_external_call_is_l2_gas_left_gt_alllocated_settings,
                      lookup_external_call_is_da_gas_left_gt_alllocated_settings>(trace);

    return 0;
}
