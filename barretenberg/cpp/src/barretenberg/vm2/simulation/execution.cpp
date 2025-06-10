#include "barretenberg/vm2/simulation/execution.hpp"

#include <algorithm>
#include <concepts>
#include <cstdint>
#include <functional>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/gas_tracker.hpp"

namespace bb::avm2::simulation {

void Execution::add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_inputs({ a, b });

    MemoryValue c = alu.add(a, b);
    memory.set(dst_addr, c);
    set_output(c);
}

// TODO: My dispatch system makes me have a uint8_t tag. Rethink.
void Execution::set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, FF value)
{
    TaggedValue tagged_value = TaggedValue::from_tag(static_cast<ValueTag>(tag), value);
    context.get_memory().set(dst_addr, tagged_value);
    set_output(tagged_value);
}

void Execution::mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    auto v = memory.get(src_addr);
    memory.set(dst_addr, v);

    set_inputs({ v });
    set_output(v);
}

void Execution::call(ContextInterface& context,
                     MemoryAddress l2_gas_offset,
                     MemoryAddress da_gas_offset,
                     MemoryAddress addr,
                     MemoryAddress cd_offset,
                     MemoryAddress cd_size)
{
    auto& memory = context.get_memory();

    // TODO(ilyas): Consider temporality groups.
    // NOTE: these reads cannot fail due to addressing guarantees.
    const auto& allocated_l2_gas_read = memory.get(l2_gas_offset);
    const auto& allocated_da_gas_read = memory.get(da_gas_offset);
    const auto& contract_address = memory.get(addr);
    set_inputs({ allocated_l2_gas_read, allocated_da_gas_read, contract_address });

    // TODO(ilyas): How will we tag check these? We are just throwing right now on the first tag mismatch.
    Gas gas_limit = get_gas_tracker().compute_gas_limit_for_call(
        Gas{ allocated_l2_gas_read.as<uint32_t>(), allocated_da_gas_read.as<uint32_t>() });

    // Cd size and cd offset loads are deferred to (possible) calldatacopy
    auto nested_context = context_provider.make_nested_context(contract_address,
                                                               /*msg_sender=*/context.get_address(),
                                                               /*parent_context=*/context,
                                                               /*cd_offset_addr=*/cd_offset,
                                                               /*cd_size_addr=*/cd_size,
                                                               /*is_static=*/false,
                                                               /*gas_limit=*/gas_limit);

    // We do not recurse. This context will be use on the next cycle of execution.
    handle_enter_call(context, std::move(nested_context));
}

void Execution::ret(ContextInterface& context, MemoryAddress ret_size_offset, MemoryAddress ret_offset)
{
    auto& memory = context.get_memory();
    auto get_ret_size = memory.get(ret_size_offset);
    set_inputs({ get_ret_size });
    // TODO(ilyas): check this is a U32
    auto rd_size = get_ret_size.as<uint32_t>();
    set_execution_result(
        { .rd_offset = ret_offset, .rd_size = rd_size, .gas_used = context.get_gas_used(), .success = true });

    context.halt();
}

void Execution::revert(ContextInterface& context, MemoryAddress rev_size_offset, MemoryAddress rev_offset)
{
    auto& memory = context.get_memory();
    auto get_rev_size = memory.get(rev_size_offset);
    set_inputs({ get_rev_size });
    // TODO(ilyas): check this is a U32
    auto rd_size = get_rev_size.as<uint32_t>();
    set_execution_result(
        { .rd_offset = rev_offset, .rd_size = rd_size, .gas_used = context.get_gas_used(), .success = false });

    context.halt();
}

void Execution::jump(ContextInterface& context, uint32_t loc)
{
    context.set_next_pc(loc);
}

void Execution::jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc)
{
    auto& memory = context.get_memory();

    auto resolved_cond = memory.get(cond_addr);
    set_inputs({ resolved_cond });
    if (!resolved_cond.as_ff().is_zero()) {
        context.set_next_pc(loc);
    }
}

// FIXME: unconstrained!
void Execution::calldata_copy(ContextInterface& context,
                              MemoryAddress copy_size_offset,
                              MemoryAddress cd_start_offset,
                              MemoryAddress dst_offset)
{
    // FIXME: this is a fake implementation to make gas tests and lookups work.
    auto& memory = context.get_memory();
    auto copy_size = memory.get(copy_size_offset);
    auto cd_start = memory.get(cd_start_offset);
    // FIXME: each input need to be set separately.
    set_inputs({ copy_size, cd_start });
    uint32_t copy_size_u32 = copy_size.as<uint32_t>();
    uint32_t cd_start_u32 = cd_start.as<uint32_t>();

    get_gas_tracker().consume_dynamic_gas({ .l2Gas = copy_size_u32, .daGas = 0 });
    for (uint32_t i = 0; i < copy_size_u32; ++i) {
        const MemoryValue& value = memory.get(cd_start_u32 + i);
        memory.set(dst_offset + i, value);
    }
}

// This context interface is a top-level enqueued one.
// NOTE: For the moment this trace is not returning the context back.
ExecutionResult Execution::execute(std::unique_ptr<ContextInterface> enqueued_call_context)
{
    external_call_stack.push(std::move(enqueued_call_context));

    while (!external_call_stack.empty()) {
        // We fix the context at this point. Even if the opcode changes the stack
        // we'll always use this in the loop.
        auto& context = *external_call_stack.top();

        // We'll be filling in the event as we go. And we always emit at the end.
        ExecutionEvent ex_event;

        // We'll be filling this with gas data as we go.
        init_gas_tracker(context);

        try {
            // State before doing anything.
            ex_event.before_context_event = context.serialize_context_event();
            ex_event.next_context_id = context_provider.get_next_context_id();

            // Basic pc and bytecode setup.
            auto pc = context.get_pc();
            ex_event.bytecode_id = context.get_bytecode_manager().get_bytecode_id();

            //// Temporality group 1 starts ////

            // We try to fetch an instruction.
            ex_event.error = ExecutionError::INSTRUCTION_FETCHING; // Set preemptively.
            Instruction instruction = context.get_bytecode_manager().read_instruction(pc);
            ex_event.wire_instruction = instruction;
            debug("@", pc, " ", instruction.to_string());
            context.set_next_pc(pc + static_cast<uint32_t>(instruction.size_in_bytes()));

            //// Temporality group 2 starts ////

            // Gas checking may throw OOG.
            ex_event.error = ExecutionError::GAS;           // Set preemptively.
            get_gas_tracker().set_instruction(instruction); // This accesses specs, consider changing.
            get_gas_tracker().consume_base_gas();

            //// Temporality group 3 starts ////

            // Resolve the operands.
            ex_event.error = ExecutionError::ADDRESSING; // Set preemptively.
            auto addressing = execution_components.make_addressing(ex_event.addressing_event);
            std::vector<Operand> resolved_operands = addressing->resolve(instruction, context.get_memory());
            ex_event.resolved_operands = resolved_operands;

            //// Temporality group 4+ starts (to be defined) ////

            // Execute the opcode.
            ex_event.error = ExecutionError::DISPATCHING; // Set preemptively.
            dispatch_opcode(instruction.get_exec_opcode(), context, resolved_operands);

            // If we made it this far, there was no error.
            ex_event.error = ExecutionError::NONE;
        } catch (const std::exception& e) {
            info("Exceptional halt: ", e.what());
            context.halt();
            set_execution_result({ .success = false });
        }

        // We always do what follows. "Finally".
        // Move on to the next pc.
        context.set_pc(context.get_next_pc());

        // TODO: we set the inputs and outputs here and into the execution event, but maybe there's a better way
        ex_event.inputs = get_inputs();
        ex_event.output = get_output();

        ex_event.gas_event = finish_gas_tracker();

        // State after the opcode.
        ex_event.after_context_event = context.serialize_context_event();
        // TODO(dbanks12): fix phase. Should come from TX execution and be forwarded to nested calls.
        ex_event.after_context_event.phase = TransactionPhase::APP_LOGIC;
        events.emit(std::move(ex_event));

        // If the context has halted, we need to exit the external call.
        // The external call stack is expected to be popped.
        if (context.halted()) {
            handle_exit_call();
        }
    }

    return get_execution_result();
}

void Execution::handle_enter_call(ContextInterface& parent_context, std::unique_ptr<ContextInterface> child_context)
{
    ctx_stack_events.emit({ .id = parent_context.get_context_id(),
                            .parent_id = parent_context.get_parent_id(),
                            .entered_context_id = context_provider.get_next_context_id(),
                            .next_pc = parent_context.get_next_pc(),
                            .msg_sender = parent_context.get_msg_sender(),
                            .contract_addr = parent_context.get_address(),
                            .is_static = parent_context.get_is_static(),
                            .parent_gas_used = parent_context.get_parent_gas_used(),
                            .parent_gas_limit = parent_context.get_parent_gas_limit() });

    external_call_stack.push(std::move(child_context));
}

void Execution::handle_exit_call()
{
    // NOTE: the current (child) context should not be modified here, since it was already emitted.
    std::unique_ptr<ContextInterface> child_context = std::move(external_call_stack.top());
    external_call_stack.pop();
    ExecutionResult result = get_execution_result();

    if (!external_call_stack.empty()) {
        auto& parent_context = *external_call_stack.top();
        // was not top level, communicate with parent
        parent_context.set_last_rd_offset(result.rd_offset);
        parent_context.set_last_rd_size(result.rd_size);
        parent_context.set_last_success(result.success);
        parent_context.set_child_context(std::move(child_context));
        // Safe since the nested context gas limit should be clamped to the available gas.
        parent_context.set_gas_used(result.gas_used + parent_context.get_gas_used());
    }
    // Else: was top level. ExecutionResult is already set and that will be returned.
}

void Execution::dispatch_opcode(ExecutionOpCode opcode,
                                ContextInterface& context,
                                const std::vector<Operand>& resolved_operands)
{
    // TODO: consider doing this even before the dispatch.
    inputs = {};
    output = TaggedValue::from<FF>(0);

    debug("Dispatching opcode: ", opcode);
    switch (opcode) {
    case ExecutionOpCode::ADD:
        call_with_operands(&Execution::add, context, resolved_operands);
        break;
    case ExecutionOpCode::SET:
        call_with_operands(&Execution::set, context, resolved_operands);
        break;
    case ExecutionOpCode::MOV:
        call_with_operands(&Execution::mov, context, resolved_operands);
        break;
    case ExecutionOpCode::CALL:
        call_with_operands(&Execution::call, context, resolved_operands);
        break;
    case ExecutionOpCode::RETURN:
        call_with_operands(&Execution::ret, context, resolved_operands);
        break;
    case ExecutionOpCode::JUMP:
        call_with_operands(&Execution::jump, context, resolved_operands);
        break;
    case ExecutionOpCode::JUMPI:
        call_with_operands(&Execution::jumpi, context, resolved_operands);
        break;
    case ExecutionOpCode::CALLDATACOPY:
        call_with_operands(&Execution::calldata_copy, context, resolved_operands);
        break;
    default:
        // TODO: Make this an assertion once all execution opcodes are supported.
        vinfo("Warning: dispatch ignored for unknown execution opcode: ", static_cast<uint32_t>(opcode));
        break;
    }
}

// Some template magic to dispatch the opcode by deducing the number of arguments and types,
// and making the appropriate checks and casts.
template <typename... Ts>
inline void Execution::call_with_operands(void (Execution::*f)(ContextInterface&, Ts...),
                                          ContextInterface& context,
                                          const std::vector<Operand>& resolved_operands)
{
    assert(resolved_operands.size() == sizeof...(Ts));
    auto operand_indices = std::make_index_sequence<sizeof...(Ts)>{};
    [f, this, &context, &resolved_operands]<std::size_t... Is>(std::index_sequence<Is...>) {
        // FIXME(fcarreiro): we go through FF here.
        (this->*f)(context, static_cast<Ts>(resolved_operands.at(Is).as_ff())...);
    }(operand_indices);
}

void Execution::init_gas_tracker(ContextInterface& context)
{
    assert(gas_tracker == nullptr);
    gas_tracker = execution_components.make_gas_tracker(context);
}

GasTrackerInterface& Execution::get_gas_tracker()
{
    assert(gas_tracker != nullptr);
    return *gas_tracker;
}

GasEvent Execution::finish_gas_tracker()
{
    assert(gas_tracker != nullptr);
    GasEvent event = gas_tracker->finish();
    gas_tracker = nullptr;
    return event;
}

} // namespace bb::avm2::simulation
