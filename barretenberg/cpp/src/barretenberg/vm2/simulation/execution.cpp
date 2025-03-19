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

namespace bb::avm2::simulation {

void Execution::add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    alu.add(context, a_addr, b_addr, dst_addr);
}

// TODO: My dispatch system makes me have a uint8_t tag. Rethink.
void Execution::set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, MemoryValue value)
{
    context.get_memory().set(dst_addr, std::move(value), static_cast<MemoryTag>(tag));
}

void Execution::mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    auto [value, tag] = memory.get(src_addr);
    memory.set(dst_addr, value, tag);
}

void Execution::call(ContextInterface& context, MemoryAddress addr)
{
    auto& memory = context.get_memory();

    const auto [contract_address, _] = memory.get(addr);
    std::vector<FF> calldata = {};

    // TODO: make_nested
    auto nested_context = execution_components.make_context(contract_address,
                                                            /*msg_sender=*/context.get_address(),
                                                            /*calldata=*/calldata,
                                                            /*is_static=*/false);

    // TODO: Do we want to snapshot into the context stack here?

    // We recurse. When we return, we'll continue with the current loop and emit the execution event.
    // That event will be out of order, but it will have the right order id. It should be sorted in tracegen.
    auto result = execute_internal(*nested_context);

    // TODO: do more things with the result.
    context.set_nested_returndata(std::move(result.returndata));
}

void Execution::ret(ContextInterface& context, MemoryAddress ret_offset, MemoryAddress ret_size_offset)
{
    auto& memory = context.get_memory();

    // TODO: check tags and types (only for size, the return data is converted to FF).
    uint32_t size = static_cast<uint32_t>(memory.get(ret_size_offset).value);
    auto [values, _] = memory.get_slice(ret_offset, size);

    // TODO: do the right thing
    std::vector returndata(values.begin(), values.end());
    context.set_nested_returndata(std::move(returndata));
    context.halt();
}

void Execution::jump(ContextInterface& context, uint32_t loc)
{
    context.set_next_pc(loc);
}

void Execution::jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc)
{
    auto& memory = context.get_memory();

    // TODO: in gadget.
    auto resolved_cond = memory.get(cond_addr);
    if (!resolved_cond.value.is_zero()) {
        context.set_next_pc(loc);
    }
}

ExecutionResult Execution::execute(AztecAddress contract_address,
                                   std::span<const FF> calldata,
                                   AztecAddress msg_sender,
                                   bool is_static)
{
    // WARNING: make_context actually tries to fetch the bytecode! Maybe shouldn't be here because if this fails
    // it will fail the parent and not the child context.
    auto context = execution_components.make_context(contract_address, msg_sender, calldata, is_static);
    auto result = execute_internal(*context);
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
            ex_event.pc = pc;
            ex_event.bytecode_id = context.get_bytecode_manager().get_bytecode_id();

            // We try to fetch an instruction.
            // WARNING: the bytecode has already been fetched in make_context. Maybe it is wrong and should be here.
            // But then we have no way to know the bytecode id when constructing the manager.
            Instruction instruction = context.get_bytecode_manager().read_instruction(pc);
            ex_event.wire_instruction = instruction;

            // Go from a wire instruction to an execution opcode.
            const WireInstructionSpec& wire_spec = instruction_info_db.get(instruction.opcode);
            context.set_next_pc(pc + wire_spec.size_in_bytes);
            info("@", pc, " ", instruction.to_string());
            ExecutionOpCode opcode = wire_spec.exec_opcode;
            ex_event.opcode = opcode;

            // Resolve the operands.
            auto addressing = execution_components.make_addressing(ex_event.addressing_event);
            std::vector<Operand> resolved_operands = addressing->resolve(instruction, context.get_memory());
            ex_event.resolved_operands = resolved_operands;

            // BEFORE OPCODE
            // auto old_context_event = context.get_context_event();

            // Execute the opcode.
            dispatch_opcode(opcode, context, resolved_operands);

            // auto new_context_event = context.get_context_event();

            // Move on to the next pc.
            context.set_pc(context.get_next_pc());
        } catch (const std::exception& e) {
            info("Error: ", e.what());
            // Bah, we are done (for now).
            // TODO: we eventually want this to just set and handle exceptional halt.
            return {
                .success = true,
            };
        }

        events.emit(std::move(ex_event));
    }

    // FIXME: Should return an ExecutionResult.
    return {
        .success = true,
    };
}

void Execution::dispatch_opcode(ExecutionOpCode opcode,
                                ContextInterface& context,
                                const std::vector<Operand>& resolved_operands)
{
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
    default:
        // TODO: should be caught by parsing.
        throw std::runtime_error("Unknown opcode");
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
    using types = std::tuple<Ts...>;
    [f, this, &context, &resolved_operands]<std::size_t... Is>(std::index_sequence<Is...>) {
        (this->*f)(context, static_cast<std::tuple_element_t<Is, types>>(resolved_operands[Is])...);
    }(operand_indices);
}

} // namespace bb::avm2::simulation
