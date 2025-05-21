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

void Execution::add(ContextInterface& context,
                    OpcodeIOInterface& opcode_io,
                    MemoryAddress a_addr,
                    MemoryAddress b_addr,
                    MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);

    MemoryValue c = alu.add(a, b);
    memory.set(dst_addr, c);

    opcode_io.set_inputs({ a, b });
    opcode_io.set_output(c);
}

// TODO: My dispatch system makes me have a uint8_t tag. Rethink.
void Execution::set(
    ContextInterface& context, OpcodeIOInterface& opcode_io, MemoryAddress dst_addr, uint8_t tag, FF value)
{
    TaggedValue tagged_value = TaggedValue::from_tag(static_cast<ValueTag>(tag), value);
    context.get_memory().set(dst_addr, tagged_value);
    opcode_io.set_output(tagged_value);
}

void Execution::mov(ContextInterface& context,
                    OpcodeIOInterface& opcode_io,
                    MemoryAddress src_addr,
                    MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    auto v = memory.get(src_addr);
    memory.set(dst_addr, v);

    opcode_io.set_inputs({ v });
    opcode_io.set_output(v);
}

void Execution::call(ContextInterface& context,
                     OpcodeIOInterface& opcode_io,
                     MemoryAddress l2_gas_offset,
                     MemoryAddress da_gas_offset,
                     MemoryAddress addr,
                     MemoryAddress cd_offset,
                     MemoryAddress cd_size)
{
    // Emit Snapshot of current context
    emit_context_snapshot(context);

    auto& memory = context.get_memory();

    // TODO(ilyas): How will we tag check these?
    const auto& allocated_l2_gas_read = memory.get(l2_gas_offset);
    const auto& allocated_da_gas_read = memory.get(da_gas_offset);
    const auto& contract_address = memory.get(addr);

    // TODO limit the gas limits based on available gas

    // Cd size and cd offset loads are deferred to (possible) calldatacopy
    auto nested_context = execution_components.make_nested_context(
        contract_address,
        /*msg_sender=*/context.get_address(),
        /*parent_context=*/context,
        /*cd_offset_addr=*/cd_offset,
        /*cd_size_addr=*/cd_size,
        /*is_static=*/false,
        /*gas_limit=*/Gas{ allocated_l2_gas_read.as<uint32_t>(), allocated_da_gas_read.as<uint32_t>() });

    // We recurse. When we return, we'll continue with the current loop and emit the execution event.
    // That event will be out of order, but it will have the right order id. It should be sorted in tracegen.
    auto result = execute_internal(*nested_context);
    opcode_io.set_child_context(std::move(nested_context));
    opcode_io.set_nested_execution_result(result);

    // Set inputs and outputs for the event
    opcode_io.set_inputs({ allocated_l2_gas_read, allocated_da_gas_read, contract_address });
}

void Execution::ret(ContextInterface& context,
                    OpcodeIOInterface& opcode_io,
                    MemoryAddress ret_size_offset,
                    MemoryAddress ret_offset)
{
    auto& memory = context.get_memory();
    auto get_ret_size = memory.get(ret_size_offset);
    // TODO(ilyas): check this is a U32
    auto rd_size = get_ret_size.as<uint32_t>();
    set_execution_result({ .rd_offset = ret_offset, .rd_size = rd_size, .success = true });

    opcode_io.set_inputs({ get_ret_size });
    context.halt();
}

void Execution::revert(ContextInterface& context,
                       OpcodeIOInterface& opcode_io,
                       MemoryAddress rev_size_offset,
                       MemoryAddress rev_offset)
{
    auto& memory = context.get_memory();
    auto get_rev_size = memory.get(rev_size_offset);
    // TODO(ilyas): check this is a U32
    auto rd_size = get_rev_size.as<uint32_t>();
    set_execution_result({ .rd_offset = rev_offset, .rd_size = rd_size, .success = false });

    opcode_io.set_inputs({ get_rev_size });
    context.halt();
}

void Execution::jump(ContextInterface& context, OpcodeIOInterface&, uint32_t loc)
{
    context.set_next_pc(loc);
}

void Execution::jumpi(ContextInterface& context, OpcodeIOInterface& opcode_io, MemoryAddress cond_addr, uint32_t loc)
{
    auto& memory = context.get_memory();

    // TODO: in gadget.
    auto resolved_cond = memory.get(cond_addr);
    if (!resolved_cond.as_ff().is_zero()) {
        context.set_next_pc(loc);
    }

    opcode_io.set_inputs({ resolved_cond });
}

// This context interface is an top-level enqueued one
ExecutionResult Execution::execute(ContextInterface& context)
{
    auto result = execute_internal(context);
    return result;
}

ExecutionResult Execution::execute_internal(ContextInterface& context)
{
    while (!context.halted()) {
        // This allocates an order id for the event.
        auto ex_event = ExecutionEvent::allocate();

        // We'll be filling in the event as we go. And we always emit at the end.
        try {
            // Basic pc and bytecode setup.
            auto pc = context.get_pc();
            ex_event.bytecode_id = context.get_bytecode_manager().get_bytecode_id();

            // We try to fetch an instruction.
            // WARNING: the bytecode has already been fetched in make_context. Maybe it is wrong and should be here.
            // But then we have no way to know the bytecode id when constructing the manager.
            Instruction instruction = context.get_bytecode_manager().read_instruction(pc);
            ex_event.wire_instruction = instruction;

            // Go from a wire instruction to an execution opcode.
            const WireInstructionSpec& wire_spec = instruction_info_db.get(instruction.opcode);
            context.set_next_pc(pc + wire_spec.size_in_bytes);
            debug("@", pc, " ", instruction.to_string());
            ExecutionOpCode opcode = wire_spec.exec_opcode;
            ex_event.opcode = opcode;

            auto addressing = execution_components.make_addressing(ex_event.addressing_event);

            // Change this to use the execution components as provider for DI.
            auto gas_tracker = execution_components.make_gas_tracker(context, instruction);

            // TODO: Consider splitting this into inputs/outputs and have inputs be argument to dispatch and
            // outputs be return value of dispatch.
            OpcodeIO opcode_io(*gas_tracker);

            gas_tracker->consume_base_gas();

            // Resolve the operands.
            std::vector<Operand> resolved_operands = addressing->resolve(instruction, context.get_memory());
            ex_event.resolved_operands = resolved_operands;

            // Execute the opcode.
            dispatch_opcode(opcode, context, opcode_io, resolved_operands);

            // "Emit" the context event
            auto context_event = context.serialize_context_event();
            ex_event.context_event = context_event;
            ex_event.next_context_id = execution_components.get_next_context_id();

            update_context_for_next_opcode(opcode_io, context);

            // TODO: we set the inputs and outputs here and into the execution event, but maybe there's a better way
            ex_event.inputs = opcode_io.get_inputs();
            ex_event.output = opcode_io.get_output();
            ex_event.gas_event = gas_tracker->finish();

            // Move on to the next pc.
            context.set_pc(context.get_next_pc());
        } catch (const std::exception& e) {
            info("Error: ", e.what());
            // Bah, we are done (for now).
            // TODO: we eventually want this to just set and handle exceptional halt.
            throw std::runtime_error("Execution loop error: " + std::string(e.what()));
        }

        events.emit(std::move(ex_event));
    }

    // FIXME: Should return an ExecutionResult.
    return get_execution_result();
}

void Execution::update_context_for_next_opcode(OpcodeIOInterface& opcode_io, ContextInterface& context)
{
    auto child_context = opcode_io.extract_child_context();
    if (child_context) {
        // TODO: do more things based on the result. This happens in the parent context
        // 1) Accept / Reject side effects (e.g. tree state, newly emitted nullifiers, notes, public writes)
        // 2) Set return data information

        // Safe since the gas limit was set to available gas at most.
        context.set_gas_used(context.get_gas_used() + child_context->get_gas_used());
        context.set_child_context(std::move(child_context));
    }

    auto nested_execution_result = opcode_io.get_nested_execution_result();
    if (nested_execution_result) {
        // TODO(ilyas): Look into just having a setter using ExecutionResult, but this gives us more flexibility
        context.set_last_rd_offset(nested_execution_result->rd_offset);
        context.set_last_rd_size(nested_execution_result->rd_size);
        context.set_last_success(nested_execution_result->success);
    }
}

void Execution::dispatch_opcode(ExecutionOpCode opcode,
                                ContextInterface& context,
                                OpcodeIOInterface& opcode_io,
                                const std::vector<Operand>& resolved_operands)
{
    switch (opcode) {
    case ExecutionOpCode::ADD:
        call_with_operands(&Execution::add, context, opcode_io, resolved_operands);
        break;
    case ExecutionOpCode::SET:
        call_with_operands(&Execution::set, context, opcode_io, resolved_operands);
        break;
    case ExecutionOpCode::MOV:
        call_with_operands(&Execution::mov, context, opcode_io, resolved_operands);
        break;
    case ExecutionOpCode::CALL:
        call_with_operands(&Execution::call, context, opcode_io, resolved_operands);
        break;
    case ExecutionOpCode::RETURN:
        call_with_operands(&Execution::ret, context, opcode_io, resolved_operands);
        break;
    case ExecutionOpCode::JUMP:
        call_with_operands(&Execution::jump, context, opcode_io, resolved_operands);
        break;
    case ExecutionOpCode::JUMPI:
        call_with_operands(&Execution::jumpi, context, opcode_io, resolved_operands);
        break;
    default:
        // TODO: should be caught by parsing.
        throw std::runtime_error("Unknown opcode");
    }
}

// Some template magic to dispatch the opcode by deducing the number of arguments and types,
// and making the appropriate checks and casts.
template <typename... Ts>
inline void Execution::call_with_operands(void (Execution::*f)(ContextInterface&, OpcodeIOInterface&, Ts...),
                                          ContextInterface& context,
                                          OpcodeIOInterface& opcode_io,
                                          const std::vector<Operand>& resolved_operands)
{
    assert(resolved_operands.size() == sizeof...(Ts));
    auto operand_indices = std::make_index_sequence<sizeof...(Ts)>{};
    [f, this, &context, &resolved_operands, &opcode_io]<std::size_t... Is>(std::index_sequence<Is...>) {
        // FIXME(fcarreiro): we go through FF here.
        (this->*f)(context, opcode_io, static_cast<Ts>(resolved_operands.at(Is).as_ff())...);
    }(operand_indices);
}

void Execution::emit_context_snapshot(ContextInterface& context)
{
    ctx_stack_events.emit({ .id = context.get_context_id(),
                            .parent_id = context.get_parent_id(),
                            .entered_context_id = execution_components.get_next_context_id(),
                            .next_pc = context.get_next_pc(),
                            .msg_sender = context.get_msg_sender(),
                            .contract_addr = context.get_address(),
                            .is_static = context.get_is_static(),
                            .parent_gas_used = context.get_parent_gas_used(),
                            .parent_gas_limit = context.get_parent_gas_limit() });
};

} // namespace bb::avm2::simulation
