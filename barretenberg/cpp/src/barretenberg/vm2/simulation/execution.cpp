#include "barretenberg/vm2/simulation/execution.hpp"

#include <algorithm>
#include <concepts>
#include <cstdint>
#include <functional>

#include "barretenberg/vm2/common/instruction_spec.hpp"
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

// TODO: This will need to happen in its own gadget in any case.
void Execution::call(ContextInterface& context, MemoryAddress addr)
{
    auto& memory = context.get_memory();

    const auto [contract_address, _] = memory.get(addr);
    std::vector<FF> calldata = {};

    auto nested_context = context_provider.make(contract_address,
                                                /*msg_sender=*/context.get_address(),
                                                /*calldata=*/calldata,
                                                /*is_static=*/false);
    context_stack.push(std::move(nested_context));
}

// TODO: This will need to happen in its own gadget in any case.
void Execution::ret(ContextInterface& context, MemoryAddress ret_offset, MemoryAddress ret_size_offset)
{
    auto& memory = context.get_memory();

    // TODO: check tags and types (only for size, the return data is converted to FF).
    size_t size = static_cast<size_t>(memory.get(ret_size_offset).value);
    auto [values, _] = memory.get_slice(ret_offset, size);

    context_stack.pop();
    std::vector returndata(values.begin(), values.end());
    if (!context_stack.empty()) {
        auto& context = context_stack.current();
        // TODO: We'll need more than just the return data. E.g., the space id, address and size.
        context.set_nested_returndata(std::move(returndata));
    } else {
        top_level_result = {
            .returndata = std::move(returndata),
            .success = true,
        };
    }
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
    auto context = context_provider.make(contract_address, msg_sender, calldata, is_static);
    context_stack.push(std::move(context));
    execution_loop();
    return std::move(top_level_result);
}

void Execution::execution_loop()
{
    while (!context_stack.empty()) {
        auto& context = context_stack.current();

        // This try-catch is here to ignore any unhandled opcodes.
        try {
            auto pc = context.get_pc();
            Instruction instruction = context.get_bytecode_manager().read_instruction(pc);
            context.set_next_pc(pc + instruction.size_in_bytes);
            info("@", pc, " ", instruction.to_string());

            ExecutionOpCode opcode = instruction_info_db.map_wire_opcode_to_execution_opcode(instruction.opcode);
            const InstructionSpec& spec = instruction_info_db.get(opcode); // Unused for now.
            std::vector<Operand> resolved_operands = addressing.resolve(instruction, context.get_memory());

            dispatch_opcode(opcode, resolved_operands);

            events.emit({ .pc = pc,
                          .contract_class_id = context.get_bytecode_manager().get_class_id(),
                          .wire_instruction = std::move(instruction),
                          .instruction_spec = spec,
                          .opcode = opcode,
                          .resolved_operands = std::move(resolved_operands) });

            context.set_pc(context.get_next_pc());
        } catch (const std::exception& e) {
            info("Error: ", e.what());
            // Bah, we are done.
            return;
            // context.set_pc(context.get_next_pc());
            // continue;
        }
    }
}

void Execution::dispatch_opcode(ExecutionOpCode opcode, const std::vector<Operand>& resolved_operands)
{
    switch (opcode) {
    case ExecutionOpCode::ADD:
        call_with_operands(&Execution::add, resolved_operands);
        break;
    case ExecutionOpCode::SET:
        call_with_operands(&Execution::set, resolved_operands);
        break;
    case ExecutionOpCode::MOV:
        call_with_operands(&Execution::mov, resolved_operands);
        break;
    case ExecutionOpCode::CALL:
        call_with_operands(&Execution::call, resolved_operands);
        break;
    case ExecutionOpCode::RETURN:
        call_with_operands(&Execution::ret, resolved_operands);
        break;
    case ExecutionOpCode::JUMP:
        call_with_operands(&Execution::jump, resolved_operands);
        break;
    case ExecutionOpCode::JUMPI:
        call_with_operands(&Execution::jumpi, resolved_operands);
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
                                          const std::vector<Operand>& resolved_operands)
{
    assert(resolved_operands.size() == sizeof...(Ts));
    auto operand_indices = std::make_index_sequence<sizeof...(Ts)>{};
    using types = std::tuple<Ts...>;
    [f, this, &resolved_operands]<std::size_t... Is>(std::index_sequence<Is...>) {
        (this->*f)(context_stack.current(), static_cast<std::tuple_element_t<Is, types>>(resolved_operands[Is])...);
    }(operand_indices);
}

} // namespace bb::avm2::simulation