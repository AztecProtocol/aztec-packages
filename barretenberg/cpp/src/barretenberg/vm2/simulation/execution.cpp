#include "barretenberg/vm2/simulation/execution.hpp"

#include <algorithm>
#include <concepts>
#include <cstdint>
#include <functional>
#include <stdexcept>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/uint1.hpp"
#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/gas_tracker.hpp"

namespace bb::avm2::simulation {
namespace {

class RegisterValidationException : public std::runtime_error {
  public:
    RegisterValidationException(const std::string& message)
        : std::runtime_error(message)
    {}
};

class OpcodeExecutionException : public std::runtime_error {
  public:
    OpcodeExecutionException(const std::string& message)
        : std::runtime_error(message)
    {}
};

} // namespace

void Execution::add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    constexpr auto opcode = ExecutionOpCode::ADD;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });
    try {
        MemoryValue c = alu.add(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluError& e) {
        throw OpcodeExecutionException("Alu add operation failed");
    }
}

void Execution::get_env_var(ContextInterface& context, MemoryAddress dst_addr, uint8_t var_enum)
{
    constexpr auto opcode = ExecutionOpCode::GETENVVAR;
    auto& memory = context.get_memory();
    TaggedValue result;

    EnvironmentVariable env_var = static_cast<EnvironmentVariable>(var_enum);
    switch (env_var) {
    case EnvironmentVariable::ADDRESS:
        result = TaggedValue::from<FF>(context.get_address());
        break;
    case EnvironmentVariable::SENDER:
        result = TaggedValue::from<FF>(context.get_msg_sender());
        break;
    case EnvironmentVariable::TRANSACTIONFEE:
        result = TaggedValue::from<FF>(context.get_transaction_fee());
        break;
    case EnvironmentVariable::CHAINID:
        result = TaggedValue::from<FF>(context.get_globals().chainId);
        break;
    case EnvironmentVariable::VERSION:
        result = TaggedValue::from<FF>(context.get_globals().version);
        break;
    case EnvironmentVariable::BLOCKNUMBER:
        result = TaggedValue::from<uint32_t>(context.get_globals().blockNumber);
        break;
    case EnvironmentVariable::TIMESTAMP:
        result = TaggedValue::from<uint64_t>(context.get_globals().timestamp);
        break;
    case EnvironmentVariable::BASEFEEPERL2GAS:
        result = TaggedValue::from<uint128_t>(context.get_globals().gasFees.feePerL2Gas);
        break;
    case EnvironmentVariable::BASEFEEPERDAGAS:
        result = TaggedValue::from<uint128_t>(context.get_globals().gasFees.feePerDaGas);
        break;
    case EnvironmentVariable::ISSTATICCALL:
        result = TaggedValue::from<uint1_t>(context.get_is_static() ? 1 : 0);
        break;
    case EnvironmentVariable::L2GASLEFT:
        result = TaggedValue::from<uint32_t>(context.gas_left().l2Gas);
        break;
    case EnvironmentVariable::DAGASLEFT:
        result = TaggedValue::from<uint32_t>(context.gas_left().daGas);
        break;
    default:
        throw OpcodeExecutionException("Invalid environment variable enum value");
    }

    memory.set(dst_addr, result);
    set_output(opcode, result);
}

// TODO: My dispatch system makes me have a uint8_t tag. Rethink.
void Execution::set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, FF value)
{
    constexpr auto opcode = ExecutionOpCode::SET;
    TaggedValue tagged_value = TaggedValue::from_tag(static_cast<ValueTag>(tag), value);
    context.get_memory().set(dst_addr, tagged_value);
    set_output(opcode, tagged_value);
}

void Execution::mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr)
{
    constexpr auto opcode = ExecutionOpCode::MOV;
    auto& memory = context.get_memory();
    auto v = memory.get(src_addr);
    memory.set(dst_addr, v);

    set_and_validate_inputs(opcode, { v });
    set_output(opcode, v);
}

void Execution::call(ContextInterface& context,
                     MemoryAddress l2_gas_offset,
                     MemoryAddress da_gas_offset,
                     MemoryAddress addr,
                     MemoryAddress cd_size_offset,
                     MemoryAddress cd_offset)
{
    constexpr auto opcode = ExecutionOpCode::CALL;
    auto& memory = context.get_memory();

    // TODO(ilyas): Consider temporality groups.
    // NOTE: these reads cannot fail due to addressing guarantees.
    const auto& allocated_l2_gas_read = memory.get(l2_gas_offset); // Tag check u32
    const auto& allocated_da_gas_read = memory.get(da_gas_offset); // Tag check u32
    const auto& contract_address = memory.get(addr);               // Tag check FF
    // Cd offset loads are deferred to calldatacopy
    const auto& cd_size = memory.get(cd_size_offset); // Tag check u32

    set_and_validate_inputs(opcode, { allocated_l2_gas_read, allocated_da_gas_read, contract_address, cd_size });

    // Tag Check allocations
    Gas gas_limit = get_gas_tracker().compute_gas_limit_for_call(
        Gas{ allocated_l2_gas_read.as<uint32_t>(), allocated_da_gas_read.as<uint32_t>() });

    // Tag check contract address + cd_size

    auto nested_context = context_provider.make_nested_context(contract_address,
                                                               /*msg_sender=*/context.get_address(),
                                                               /*transaction_fee=*/context.get_transaction_fee(),
                                                               /*parent_context=*/context,
                                                               /*cd_offset_addr=*/cd_offset,
                                                               /*cd_size_addr=*/cd_size.as<uint32_t>(),
                                                               /*is_static=*/false,
                                                               /*gas_limit=*/gas_limit);

    // We do not recurse. This context will be use on the next cycle of execution.
    handle_enter_call(context, std::move(nested_context));
}

void Execution::cd_copy(ContextInterface& context,
                        MemoryAddress cd_size_offset,
                        MemoryAddress cd_offset,
                        MemoryAddress dst_addr)
{
    constexpr auto opcode = ExecutionOpCode::CALLDATACOPY;
    auto& memory = context.get_memory();
    auto cd_copy_size = memory.get(cd_size_offset); // Tag check u32
    auto cd_offset_read = memory.get(cd_offset);    // Tag check u32
    set_and_validate_inputs(opcode, { cd_copy_size, cd_offset_read });

    get_gas_tracker().consume_dynamic_gas({ .l2Gas = cd_copy_size.as<uint32_t>(), .daGas = 0 });

    try {
        data_copy.cd_copy(context, cd_copy_size.as<uint32_t>(), cd_offset_read.as<uint32_t>(), dst_addr);
    } catch (const std::exception& e) {
        throw OpcodeExecutionException("cd copy failed: " + std::string(e.what()));
    }
}

void Execution::rd_copy(ContextInterface& context,
                        MemoryAddress rd_size_offset,
                        MemoryAddress rd_offset,
                        MemoryAddress dst_addr)
{
    constexpr auto opcode = ExecutionOpCode::RETURNDATACOPY;
    auto& memory = context.get_memory();
    auto rd_copy_size = memory.get(rd_size_offset); // Tag check u32
    auto rd_offset_read = memory.get(rd_offset);    // Tag check u32
    set_and_validate_inputs(opcode, { rd_copy_size, rd_offset_read });

    get_gas_tracker().consume_dynamic_gas({ .l2Gas = rd_copy_size.as<uint32_t>(), .daGas = 0 });

    try {
        data_copy.rd_copy(context, rd_copy_size.as<uint32_t>(), rd_offset_read.as<uint32_t>(), dst_addr);
    } catch (const std::exception& e) {
        throw OpcodeExecutionException("rd copy failed: " + std::string(e.what()));
    }
}

void Execution::rd_size(ContextInterface& context, MemoryAddress dst_addr)
{
    constexpr auto opcode = ExecutionOpCode::RETURNDATASIZE;
    auto& memory = context.get_memory();
    // This is safe because the last_rd_size is tag checked on ret/revert to be U32
    MemoryValue rd_size = MemoryValue::from<uint32_t>(context.get_last_rd_size());
    memory.set(dst_addr, rd_size);
    set_output(opcode, rd_size);
}

void Execution::ret(ContextInterface& context, MemoryAddress ret_size_offset, MemoryAddress ret_offset)
{
    constexpr auto opcode = ExecutionOpCode::RETURN;
    auto& memory = context.get_memory();
    auto rd_size = memory.get(ret_size_offset); // Tag check u32
    set_and_validate_inputs(opcode, { rd_size });

    set_execution_result({ .rd_offset = ret_offset,
                           .rd_size = rd_size.as<uint32_t>(),
                           .gas_used = context.get_gas_used(),
                           .success = true });

    context.halt();
}

void Execution::revert(ContextInterface& context, MemoryAddress rev_size_offset, MemoryAddress rev_offset)
{
    constexpr auto opcode = ExecutionOpCode::REVERT;
    auto& memory = context.get_memory();
    auto rev_size = memory.get(rev_size_offset); // Tag check u32
    set_and_validate_inputs(opcode, { rev_size });

    set_execution_result({ .rd_offset = rev_offset,
                           .rd_size = rev_size.as<uint32_t>(),
                           .gas_used = context.get_gas_used(),
                           .success = false });

    context.halt();
}

void Execution::jump(ContextInterface& context, uint32_t loc)
{
    context.set_next_pc(loc);
}

void Execution::jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc)
{
    constexpr auto opcode = ExecutionOpCode::JUMPI;
    auto& memory = context.get_memory();

    auto resolved_cond = memory.get(cond_addr);
    set_and_validate_inputs(opcode, { resolved_cond });

    if (resolved_cond.as<uint1_t>().value() == 1) {
        context.set_next_pc(loc);
    }
}

void Execution::internal_call(ContextInterface& context, uint32_t loc)
{
    auto& internal_call_stack_manager = context.get_internal_call_stack_manager();
    // The next pc is pushed onto the internal call stack. This will become return_pc later.
    internal_call_stack_manager.push(context.get_next_pc());
    context.set_next_pc(loc);
}

void Execution::internal_return(ContextInterface& context)
{
    auto& internal_call_stack_manager = context.get_internal_call_stack_manager();
    try {
        auto next_pc = internal_call_stack_manager.pop();
        context.set_next_pc(next_pc);
    } catch (const std::exception& e) {
        // Re-throw
        throw OpcodeExecutionException("Internal return failed: " + std::string(e.what()));
    }
}

void Execution::keccak_permutation(ContextInterface& context, MemoryAddress dst_addr, MemoryAddress src_addr)
{
    try {
        keccakf1600.permutation(context.get_memory(), dst_addr, src_addr);
    } catch (const KeccakF1600Exception& e) {
        throw OpcodeExecutionException("Keccak permutation failed: " + std::string(e.what()));
    }
}

void Execution::success_copy(ContextInterface& context, MemoryAddress dst_addr)
{
    constexpr auto opcode = ExecutionOpCode::SUCCESSCOPY;

    auto& memory = context.get_memory();
    MemoryValue success = MemoryValue::from<uint1_t>(context.get_last_success());

    memory.set(dst_addr, success);
    set_output(opcode, success);
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
            auto pc = context.get_pc();

            //// Temporality group 1 starts ////

            // We try to get the bytecode id. This can throw if the contract is not deployed.
            ex_event.bytecode_id = context.get_bytecode_manager().get_bytecode_id();

            //// Temporality group 2 starts ////

            // We try to fetch an instruction.
            Instruction instruction = context.get_bytecode_manager().read_instruction(pc);

            ex_event.wire_instruction = instruction;
            debug("@", pc, " ", instruction.to_string());
            context.set_next_pc(pc + static_cast<uint32_t>(instruction.size_in_bytes()));

            //// Temporality group 3 starts ////

            // Gas checking may throw OOG.
            ex_event.error = ExecutionError::GAS_BASE;      // Set preemptively.
            get_gas_tracker().set_instruction(instruction); // This accesses specs, consider changing.
            get_gas_tracker().consume_base_gas();

            //// Temporality group 4 starts ////

            // Resolve the operands.
            auto addressing = execution_components.make_addressing(ex_event.addressing_event);
            std::vector<Operand> resolved_operands = addressing->resolve(instruction, context.get_memory());

            //// Temporality group 5+ starts (to be defined) ////

            // Execute the opcode.
            ex_event.error = ExecutionError::DISPATCHING; // Set preemptively.
            dispatch_opcode(instruction.get_exec_opcode(), context, resolved_operands);

            // If we made it this far, there was no error.
            ex_event.error = ExecutionError::NONE;
        }
        // TODO(fcarreiro): handle this in a better way.
        catch (const BytecodeNotFoundError& e) {
            vinfo("Bytecode not found: ", e.what());
            context.halt();
            ex_event.error = ExecutionError::BYTECODE_NOT_FOUND;
            ex_event.bytecode_id = e.bytecode_id;
            set_execution_result({ .success = false });
        } catch (const InstructionFetchingError& e) {
            vinfo("Instruction fetching error: ", e.what());
            ex_event.error = ExecutionError::INSTRUCTION_FETCHING;
            context.halt();
            set_execution_result({ .success = false });
        } catch (const AddressingException& e) {
            vinfo("Addressing exception: ", e.what());
            ex_event.error = ExecutionError::ADDRESSING;
            context.halt();
            set_execution_result({ .success = false });
        } catch (const RegisterValidationException& e) {
            vinfo("Register validation exception: ", e.what());
            ex_event.error = ExecutionError::REGISTER_READ;
            context.halt();
            set_execution_result({ .success = false });
        } catch (const OpcodeExecutionException& e) {
            vinfo("Opcode execution exception: ", e.what());
            ex_event.error = ExecutionError::OPCODE_EXECUTION;
            context.halt();
            set_execution_result({ .success = false });
        } catch (const std::exception& e) {
            vinfo("Exceptional halt: ", e.what());
            context.halt();
            set_execution_result({ .success = false });
        }

        // We always do what follows. "Finally".
        // Move on to the next pc.
        context.set_pc(context.get_next_pc());
        execution_id_manager.increment_execution_id();

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
        parent_context.set_last_rd_addr(result.rd_offset);
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

    debug("Dispatching opcode: ", opcode, " (", static_cast<uint32_t>(opcode), ")");
    switch (opcode) {
    case ExecutionOpCode::ADD:
        call_with_operands(&Execution::add, context, resolved_operands);
        break;
    case ExecutionOpCode::GETENVVAR:
        call_with_operands(&Execution::get_env_var, context, resolved_operands);
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
        call_with_operands(&Execution::cd_copy, context, resolved_operands);
        break;
    case ExecutionOpCode::RETURNDATACOPY:
        call_with_operands(&Execution::rd_copy, context, resolved_operands);
        break;
    case ExecutionOpCode::INTERNALCALL:
        call_with_operands(&Execution::internal_call, context, resolved_operands);
        break;
    case ExecutionOpCode::INTERNALRETURN:
        call_with_operands(&Execution::internal_return, context, resolved_operands);
        break;
    case ExecutionOpCode::KECCAKF1600:
        call_with_operands(&Execution::keccak_permutation, context, resolved_operands);
        break;
    case ExecutionOpCode::SUCCESSCOPY:
        call_with_operands(&Execution::success_copy, context, resolved_operands);
        break;
    case ExecutionOpCode::RETURNDATASIZE:
        call_with_operands(&Execution::rd_size, context, resolved_operands);
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

// Sets the register inputs and validates the tags.
// The tag information is taken from the instruction info database (exec spec).
void Execution::set_and_validate_inputs(ExecutionOpCode opcode, std::vector<TaggedValue> inputs)
{
    const auto& register_info = instruction_info_db.get(opcode).register_info;
    assert(inputs.size() == register_info.num_inputs());
    this->inputs = std::move(inputs);
    for (size_t i = 0; i < register_info.num_inputs(); i++) {
        if (register_info.expected_tag(i) && register_info.expected_tag(i) != this->inputs.at(i).get_tag()) {
            throw RegisterValidationException(format("Input ",
                                                     i,
                                                     " tag ",
                                                     std::to_string(this->inputs.at(i).get_tag()),
                                                     " does not match expected tag ",
                                                     std::to_string(*register_info.expected_tag(i))));
        }
    }
}

void Execution::set_output(ExecutionOpCode opcode, TaggedValue output)
{
    const auto& register_info = instruction_info_db.get(opcode).register_info;
    (void)register_info; // To please GCC.
    assert(register_info.num_outputs() == 1);
    this->output = std::move(output);
}

} // namespace bb::avm2::simulation
