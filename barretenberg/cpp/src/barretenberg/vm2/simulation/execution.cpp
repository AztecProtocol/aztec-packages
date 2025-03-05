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
// TODO: Add more params for call
void Execution::call(ContextInterface& context, MemoryAddress addr)
{
    auto& memory = context.get_memory();

    const auto [contract_address, _] = memory.get(addr);
    context.reserve_context_event();

    // Create new context.
    auto nested_ctx = context_provider.make_nested_ctx(context,
                                                       contract_address,
                                                       /*msg_sender=*/context.get_address(),
                                                       /*calldata_offset=*/0,
                                                       /*calldata_size=*/0,
                                                       /*is_static=*/false);
    execution_result = execute_internal(*nested_ctx);

    context.get_last_context_event()->nested_ctx_success = execution_result.success;
    context.set_nested_ctx_success(execution_result.success);
    context.absorb_child_context(std::move(nested_ctx));

    // The current context will be updated with the return data info
}

void Execution::cd_copy(ContextInterface& context,
                        MemoryAddress cd_offset_addr,
                        MemoryAddress copy_size_addr,
                        [[maybe_unused]] MemoryAddress dst_addr)
{
    [[maybe_unused]] auto& memory = context.get_memory();
    const auto [cd_offset, addr_tag] = memory.get(cd_offset_addr);
    const auto [copy_size, copy_tag] = memory.get(copy_size_addr);

    // Hmm in nested: this will trigger as many memory events as the length of calldata specified by the call opcode
    // In reality we want to only write a slice of the calldata to the memory
    // slice_length = (calldata_offset + cd_offset_addr)...(calldata_offset + cd_offset_addr + copy_size_addr)
    // Validation to check: copy_size < calldata_size
    // Chop up the calldata, get_calldata may create memory events in the parent context OR a lookup to public inputs
    [[maybe_unused]] auto calldata =
        context.get_calldata(static_cast<uint32_t>(cd_offset), static_cast<uint32_t>(copy_size));

    // Write the modified calldata back to the current context
    // memory.set_slice(dst_addr, calldata);
}

// TODO: This will need to happen in its own gadget in any case.
void Execution::ret([[maybe_unused]] ContextInterface& context, MemoryAddress ret_offset, MemoryAddress ret_size_offset)
{
    execution_result = {
        .returndata_src_addr = ret_offset,
        .returndata_size_addr = ret_size_offset,
        .success = true,
    };

    context.halt();
}

void Execution::rd_size(ContextInterface& context, MemoryAddress dst_offset)
{
    // Writes the stored returndata size to the memory at dst_offset
    auto& memory = context.get_memory();
    // This memory read actually needs to be child_memory_ctx
    auto rd_size = memory.get(dst_offset).value;
    // This memory write is correct (i.e. the current ctx)
    memory.set(dst_offset, rd_size, MemoryTag::U32);
}

void Execution::rd_copy(ContextInterface& context,
                        MemoryAddress rd_offset_addr,
                        MemoryAddress copy_size_addr,
                        [[maybe_unused]] MemoryAddress dst_offset)
{
    auto& memory = context.get_memory();
    const auto [rd_offset, addr_tag] = memory.get(rd_offset_addr);
    const auto [copy_size, size_tag] = memory.get(copy_size_addr);

    // See cd_copy comment
    [[maybe_unused]] auto returndata =
        context.get_returndata(static_cast<uint32_t>(rd_offset), static_cast<uint32_t>(copy_size));
    // memory.set_slice(dst_offset, returndata);
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
    // This is a top-level call
    auto context = context_provider.make_enqueued_call_ctx(contract_address, msg_sender, calldata, is_static);
    execute_internal(*context);
    return std::move(execution_result); // We might want to do unconstrained memory read here to get the return data
}

// This is for a nested call only
ExecutionResult Execution::execute_internal(ContextInterface& context)
{
    execution_loop(context);
    return std::move(execution_result);
}

void Execution::execution_loop(ContextInterface& context)
{
    while (!context.is_halted()) {

        // This try-catch is here to ignore any unhandled opcodes.
        try {
            auto pc = context.get_pc();
            Instruction instruction = context.get_bytecode_manager().read_instruction(pc);
            context.set_next_pc(pc + WIRE_INSTRUCTION_SPEC.at(instruction.opcode).size_in_bytes);
            info("@", pc, " ", instruction.to_string());

            ExecutionOpCode opcode = instruction_info_db.map_wire_opcode_to_execution_opcode(instruction.opcode);
            const ExecInstructionSpec& spec = instruction_info_db.get(opcode); // Unused for now.
            std::vector<Operand> resolved_operands = addressing.resolve(instruction, context.get_memory());

            events.emit({ .pc = pc,
                          .bytecode_id = context.get_bytecode_manager().get_bytecode_id(),
                          .wire_instruction = std::move(instruction),
                          .instruction_spec = spec,
                          .opcode = opcode,
                          .resolved_operands = std::move(resolved_operands) });

            dispatch_opcode(opcode, resolved_operands);

            context.emit_current_context();

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
        (this->*f)(*current_context, static_cast<std::tuple_element_t<Is, types>>(resolved_operands[Is])...);
    }(operand_indices);
}

} // namespace bb::avm2::simulation
