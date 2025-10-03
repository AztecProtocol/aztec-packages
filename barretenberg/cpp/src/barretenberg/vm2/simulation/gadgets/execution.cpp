#include "barretenberg/vm2/simulation/gadgets/execution.hpp"

#include <algorithm>
#include <concepts>
#include <cstdint>
#include <functional>
#include <stdexcept>
#include <string>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/common/uint1.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/addressing.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/gas_tracker.hpp"

namespace bb::avm2::simulation {

void Execution::add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::add");
    constexpr auto opcode = ExecutionOpCode::ADD;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.add(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu add operation failed");
    }
}

void Execution::sub(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::sub");
    constexpr auto opcode = ExecutionOpCode::SUB;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.sub(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu sub operation failed");
    }
}

void Execution::mul(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::mul");
    constexpr auto opcode = ExecutionOpCode::MUL;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.mul(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu mul operation failed");
    }
}

void Execution::div(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::div");
    constexpr auto opcode = ExecutionOpCode::DIV;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.div(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu div operation failed");
    }
}

void Execution::fdiv(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::fdiv");
    constexpr auto opcode = ExecutionOpCode::FDIV;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.fdiv(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu fdiv operation failed");
    }
}

void Execution::eq(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::eq");
    constexpr auto opcode = ExecutionOpCode::EQ;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.eq(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu eq operation failed");
    }
}

void Execution::lt(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::lt");
    constexpr auto opcode = ExecutionOpCode::LT;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.lt(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu lt operation failed");
    }
}

void Execution::lte(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::lte");
    constexpr auto opcode = ExecutionOpCode::LT;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.lte(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu lte operation failed");
    }
}

void Execution::op_not(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::op_not");
    constexpr auto opcode = ExecutionOpCode::NOT;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(src_addr);
    set_and_validate_inputs(opcode, { a });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue b = alu.op_not(a);
        memory.set(dst_addr, b);
        set_output(opcode, b);
    } catch (AluException& e) {
        throw OpcodeExecutionException("Alu not operation failed");
    }
}

void Execution::shl(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress c_addr)
{
    BB_BENCH_NAME("Execution::shl");
    constexpr auto opcode = ExecutionOpCode::SHL;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.shl(a, b);
        memory.set(c_addr, c);
        set_output(opcode, c);
    } catch (const AluException& e) {
        throw OpcodeExecutionException("SHL Exception: " + std::string(e.what()));
    }
}

void Execution::shr(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress c_addr)
{
    BB_BENCH_NAME("Execution::shr");
    constexpr auto opcode = ExecutionOpCode::SHR;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    get_gas_tracker().consume_gas();

    try {
        MemoryValue c = alu.shr(a, b);
        memory.set(c_addr, c);
        set_output(opcode, c);
    } catch (const AluException& e) {
        throw OpcodeExecutionException("SHR Exception: " + std::string(e.what()));
    }
}

void Execution::cast(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr, uint8_t dst_tag)
{
    BB_BENCH_NAME("Execution::cast");
    constexpr auto opcode = ExecutionOpCode::CAST;
    auto& memory = context.get_memory();
    auto val = memory.get(src_addr);
    set_and_validate_inputs(opcode, { val });

    get_gas_tracker().consume_gas();
    MemoryValue truncated = alu.truncate(val.as_ff(), static_cast<MemoryTag>(dst_tag));
    memory.set(dst_addr, truncated);
    set_output(opcode, truncated);
}

void Execution::get_env_var(ContextInterface& context, MemoryAddress dst_addr, uint8_t var_enum)
{
    BB_BENCH_NAME("Execution::get_env_var");
    constexpr auto opcode = ExecutionOpCode::GETENVVAR;
    auto& memory = context.get_memory();

    get_gas_tracker().consume_gas();

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
void Execution::set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, const FF& value)
{
    BB_BENCH_NAME("Execution::set");
    get_gas_tracker().consume_gas();

    constexpr auto opcode = ExecutionOpCode::SET;
    MemoryValue truncated = alu.truncate(value, static_cast<MemoryTag>(tag));
    context.get_memory().set(dst_addr, truncated);
    set_output(opcode, truncated);
}

void Execution::mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::mov");
    constexpr auto opcode = ExecutionOpCode::MOV;
    auto& memory = context.get_memory();
    auto v = memory.get(src_addr);
    set_and_validate_inputs(opcode, { v });

    get_gas_tracker().consume_gas();

    memory.set(dst_addr, v);
    set_output(opcode, v);
}

void Execution::call(ContextInterface& context,
                     MemoryAddress l2_gas_offset,
                     MemoryAddress da_gas_offset,
                     MemoryAddress addr,
                     MemoryAddress cd_size_offset,
                     MemoryAddress cd_offset)
{
    BB_BENCH_NAME("Execution::call");
    constexpr auto opcode = ExecutionOpCode::CALL;
    auto& memory = context.get_memory();

    // NOTE: these reads cannot fail due to addressing guarantees.
    const auto& allocated_l2_gas_read = memory.get(l2_gas_offset);
    const auto& allocated_da_gas_read = memory.get(da_gas_offset);
    const auto& contract_address = memory.get(addr);
    // Cd offset loads are deferred to calldatacopy
    const auto& cd_size = memory.get(cd_size_offset);

    set_and_validate_inputs(opcode, { allocated_l2_gas_read, allocated_da_gas_read, contract_address, cd_size });

    get_gas_tracker().consume_gas(); // Base gas.
    Gas gas_limit = get_gas_tracker().compute_gas_limit_for_call(
        Gas{ allocated_l2_gas_read.as<uint32_t>(), allocated_da_gas_read.as<uint32_t>() });

    // Tag check contract address + cd_size
    auto nested_context = context_provider.make_nested_context(contract_address,
                                                               /*msg_sender=*/context.get_address(),
                                                               /*transaction_fee=*/context.get_transaction_fee(),
                                                               /*parent_context=*/context,
                                                               /*cd_offset_address=*/cd_offset,
                                                               /*cd_size=*/cd_size.as<uint32_t>(),
                                                               /*is_static=*/context.get_is_static(),
                                                               /*gas_limit=*/gas_limit,
                                                               /*side_effect_states=*/context.get_side_effect_states(),
                                                               /*phase=*/context.get_phase());

    // We do not recurse. This context will be use on the next cycle of execution.
    handle_enter_call(context, std::move(nested_context));
}

void Execution::static_call(ContextInterface& context,
                            MemoryAddress l2_gas_offset,
                            MemoryAddress da_gas_offset,
                            MemoryAddress addr,
                            MemoryAddress cd_size_offset,
                            MemoryAddress cd_offset)
{
    BB_BENCH_NAME("Execution::static_call");
    constexpr auto opcode = ExecutionOpCode::CALL;
    auto& memory = context.get_memory();

    // NOTE: these reads cannot fail due to addressing guarantees.
    const auto& allocated_l2_gas_read = memory.get(l2_gas_offset);
    const auto& allocated_da_gas_read = memory.get(da_gas_offset);
    const auto& contract_address = memory.get(addr);
    // Cd offset loads are deferred to calldatacopy
    const auto& cd_size = memory.get(cd_size_offset);

    set_and_validate_inputs(opcode, { allocated_l2_gas_read, allocated_da_gas_read, contract_address, cd_size });

    get_gas_tracker().consume_gas(); // Base gas.
    Gas gas_limit = get_gas_tracker().compute_gas_limit_for_call(
        Gas{ allocated_l2_gas_read.as<uint32_t>(), allocated_da_gas_read.as<uint32_t>() });

    // Tag check contract address + cd_size
    auto nested_context = context_provider.make_nested_context(contract_address,
                                                               /*msg_sender=*/context.get_address(),
                                                               /*transaction_fee=*/context.get_transaction_fee(),
                                                               /*parent_context=*/context,
                                                               /*cd_offset_address=*/cd_offset,
                                                               /*cd_size=*/cd_size.as<uint32_t>(),
                                                               /*is_static=*/true,
                                                               /*gas_limit=*/gas_limit,
                                                               /*side_effect_states=*/context.get_side_effect_states(),
                                                               /*phase=*/context.get_phase());

    // We do not recurse. This context will be use on the next cycle of execution.
    handle_enter_call(context, std::move(nested_context));
}

void Execution::cd_copy(ContextInterface& context,
                        MemoryAddress cd_size_offset,
                        MemoryAddress cd_offset,
                        MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::cd_copy");
    constexpr auto opcode = ExecutionOpCode::CALLDATACOPY;
    auto& memory = context.get_memory();
    auto cd_copy_size = memory.get(cd_size_offset); // Tag check u32
    auto cd_offset_read = memory.get(cd_offset);    // Tag check u32
    set_and_validate_inputs(opcode, { cd_copy_size, cd_offset_read });

    get_gas_tracker().consume_gas({ .l2Gas = cd_copy_size.as<uint32_t>(), .daGas = 0 });

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
    BB_BENCH_NAME("Execution::rd_copy");
    constexpr auto opcode = ExecutionOpCode::RETURNDATACOPY;
    auto& memory = context.get_memory();
    auto rd_copy_size = memory.get(rd_size_offset); // Tag check u32
    auto rd_offset_read = memory.get(rd_offset);    // Tag check u32
    set_and_validate_inputs(opcode, { rd_copy_size, rd_offset_read });

    get_gas_tracker().consume_gas({ .l2Gas = rd_copy_size.as<uint32_t>(), .daGas = 0 });

    try {
        data_copy.rd_copy(context, rd_copy_size.as<uint32_t>(), rd_offset_read.as<uint32_t>(), dst_addr);
    } catch (const std::exception& e) {
        throw OpcodeExecutionException("rd copy failed: " + std::string(e.what()));
    }
}

void Execution::rd_size(ContextInterface& context, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::rd_size");
    constexpr auto opcode = ExecutionOpCode::RETURNDATASIZE;
    auto& memory = context.get_memory();

    get_gas_tracker().consume_gas();

    // This is safe because the last_rd_size is tag checked on ret/revert to be U32
    MemoryValue rd_size = MemoryValue::from<uint32_t>(context.get_last_rd_size());
    memory.set(dst_addr, rd_size);
    set_output(opcode, rd_size);
}

void Execution::ret(ContextInterface& context, MemoryAddress ret_size_offset, MemoryAddress ret_offset)
{
    BB_BENCH_NAME("Execution::ret");
    constexpr auto opcode = ExecutionOpCode::RETURN;
    auto& memory = context.get_memory();
    auto rd_size = memory.get(ret_size_offset);
    set_and_validate_inputs(opcode, { rd_size });

    get_gas_tracker().consume_gas();

    set_execution_result({ .rd_offset = ret_offset,
                           .rd_size = rd_size.as<uint32_t>(),
                           .gas_used = context.get_gas_used(),
                           .side_effect_states = context.get_side_effect_states(),
                           .success = true });

    context.halt();
}

void Execution::revert(ContextInterface& context, MemoryAddress rev_size_offset, MemoryAddress rev_offset)
{
    BB_BENCH_NAME("Execution::revert");
    constexpr auto opcode = ExecutionOpCode::REVERT;
    auto& memory = context.get_memory();
    auto rev_size = memory.get(rev_size_offset);
    set_and_validate_inputs(opcode, { rev_size });

    get_gas_tracker().consume_gas();

    set_execution_result({ .rd_offset = rev_offset,
                           .rd_size = rev_size.as<uint32_t>(),
                           .gas_used = context.get_gas_used(),
                           .side_effect_states = context.get_side_effect_states(),
                           .success = false });

    context.halt();
}

void Execution::jump(ContextInterface& context, uint32_t loc)
{
    BB_BENCH_NAME("Execution::jump");
    get_gas_tracker().consume_gas();

    context.set_next_pc(loc);
}

void Execution::jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc)
{
    BB_BENCH_NAME("Execution::jumpi");
    constexpr auto opcode = ExecutionOpCode::JUMPI;
    auto& memory = context.get_memory();

    auto resolved_cond = memory.get(cond_addr);
    set_and_validate_inputs(opcode, { resolved_cond });

    get_gas_tracker().consume_gas();

    if (resolved_cond.as<uint1_t>().value() == 1) {
        context.set_next_pc(loc);
    }
}

void Execution::internal_call(ContextInterface& context, uint32_t loc)
{
    BB_BENCH_NAME("Execution::internal_call");
    get_gas_tracker().consume_gas();

    auto& internal_call_stack_manager = context.get_internal_call_stack_manager();
    // The next pc is pushed onto the internal call stack. This will become return_pc later.
    internal_call_stack_manager.push(context.get_next_pc());
    context.set_next_pc(loc);
}

void Execution::internal_return(ContextInterface& context)
{
    BB_BENCH_NAME("Execution::internal_return");
    get_gas_tracker().consume_gas();

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
    BB_BENCH_NAME("Execution::keccak_permutation");
    get_gas_tracker().consume_gas();

    try {
        keccakf1600.permutation(context.get_memory(), dst_addr, src_addr);
    } catch (const KeccakF1600Exception& e) {
        throw OpcodeExecutionException("Keccak permutation failed: " + std::string(e.what()));
    }
}

void Execution::debug_log(ContextInterface& context,
                          MemoryAddress level_offset,
                          MemoryAddress message_offset,
                          MemoryAddress fields_offset,
                          MemoryAddress fields_size_offset,
                          uint16_t message_size)
{
    BB_BENCH_NAME("Execution::debug_log");
    get_gas_tracker().consume_gas();

    debug_log_component.debug_log(context.get_memory(),
                                  context.get_address(),
                                  level_offset,
                                  message_offset,
                                  message_size,
                                  fields_offset,
                                  fields_size_offset);
}

void Execution::success_copy(ContextInterface& context, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::success_copy");
    constexpr auto opcode = ExecutionOpCode::SUCCESSCOPY;
    auto& memory = context.get_memory();

    get_gas_tracker().consume_gas();

    MemoryValue success = MemoryValue::from<uint1_t>(context.get_last_success());
    memory.set(dst_addr, success);
    set_output(opcode, success);
}

void Execution::and_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::and_op");
    constexpr auto opcode = ExecutionOpCode::AND;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    // Dynamic gas consumption for bitwise is dependent on the tag, FF tags are valid here but
    // will result in an exception in the bitwise subtrace.
    get_gas_tracker().consume_gas({ .l2Gas = get_tag_bytes(a.get_tag()), .daGas = 0 });

    try {
        MemoryValue c = bitwise.and_op(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (const BitwiseException& e) {
        throw OpcodeExecutionException("Bitwise AND Exeception");
    }
}

void Execution::or_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::or_op");
    constexpr auto opcode = ExecutionOpCode::OR;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    // Dynamic gas consumption for bitwise is dependent on the tag, FF tags are valid here but
    // will result in an exception in the bitwise subtrace.
    get_gas_tracker().consume_gas({ .l2Gas = get_tag_bytes(a.get_tag()), .daGas = 0 });

    try {
        MemoryValue c = bitwise.or_op(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (const BitwiseException& e) {
        throw OpcodeExecutionException("Bitwise OR Exception");
    }
}

void Execution::xor_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::xor_op");
    constexpr auto opcode = ExecutionOpCode::XOR;
    auto& memory = context.get_memory();
    MemoryValue a = memory.get(a_addr);
    MemoryValue b = memory.get(b_addr);
    set_and_validate_inputs(opcode, { a, b });

    // Dynamic gas consumption for bitwise is dependent on the tag, FF tags are valid here but
    // will result in an exception in the bitwise subtrace.
    get_gas_tracker().consume_gas({ .l2Gas = get_tag_bytes(a.get_tag()), .daGas = 0 });

    try {
        MemoryValue c = bitwise.xor_op(a, b);
        memory.set(dst_addr, c);
        set_output(opcode, c);
    } catch (const BitwiseException& e) {
        throw OpcodeExecutionException("Bitwise XOR Exception");
    }
}

void Execution::sload(ContextInterface& context, MemoryAddress slot_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::sload");
    constexpr auto opcode = ExecutionOpCode::SLOAD;

    auto& memory = context.get_memory();

    auto slot = memory.get(slot_addr);
    set_and_validate_inputs(opcode, { slot });

    get_gas_tracker().consume_gas();

    auto value = MemoryValue::from<FF>(merkle_db.storage_read(context.get_address(), slot.as<FF>()));

    memory.set(dst_addr, value);
    set_output(opcode, value);
}

void Execution::sstore(ContextInterface& context, MemoryAddress src_addr, MemoryAddress slot_addr)
{
    BB_BENCH_NAME("Execution::sstore");
    constexpr auto opcode = ExecutionOpCode::SSTORE;

    auto& memory = context.get_memory();

    auto slot = memory.get(slot_addr);
    auto value = memory.get(src_addr);
    set_and_validate_inputs(opcode, { value, slot });

    bool was_slot_written_before = merkle_db.was_storage_written(context.get_address(), slot.as_ff());
    uint32_t da_gas_factor = static_cast<uint32_t>(!was_slot_written_before);
    get_gas_tracker().consume_gas({ .l2Gas = 0, .daGas = da_gas_factor });

    if (context.get_is_static()) {
        throw OpcodeExecutionException("SSTORE: Cannot write to storage in static context");
    }

    if (!was_slot_written_before &&
        merkle_db.get_tree_state().publicDataTree.counter == MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
        throw OpcodeExecutionException("SSTORE: Maximum number of data writes reached");
    }

    merkle_db.storage_write(context.get_address(), slot.as_ff(), value.as_ff(), false);
}

void Execution::note_hash_exists(ContextInterface& context,
                                 MemoryAddress unique_note_hash_addr,
                                 MemoryAddress leaf_index_addr,
                                 MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::note_hash_exists");
    constexpr auto opcode = ExecutionOpCode::NOTEHASHEXISTS;

    auto& memory = context.get_memory();
    auto unique_note_hash = memory.get(unique_note_hash_addr);
    auto leaf_index = memory.get(leaf_index_addr);
    set_and_validate_inputs(opcode, { unique_note_hash, leaf_index });

    get_gas_tracker().consume_gas();

    uint64_t leaf_index_value = leaf_index.as<uint64_t>();

    bool index_in_range = greater_than.gt(NOTE_HASH_TREE_LEAF_COUNT, leaf_index_value);

    MemoryValue value;

    if (index_in_range) {
        value = MemoryValue::from<uint1_t>(merkle_db.note_hash_exists(leaf_index_value, unique_note_hash.as<FF>()));
    } else {
        value = MemoryValue::from<uint1_t>(0);
    }

    memory.set(dst_addr, value);
    set_output(opcode, value);
}

void Execution::nullifier_exists(ContextInterface& context,
                                 MemoryAddress nullifier_offset,
                                 MemoryAddress address_offset,
                                 MemoryAddress exists_offset)
{
    BB_BENCH_NAME("Execution::nullifier_exists");
    constexpr auto opcode = ExecutionOpCode::NULLIFIEREXISTS;
    auto& memory = context.get_memory();

    auto nullifier = memory.get(nullifier_offset);
    auto address = memory.get(address_offset);
    set_and_validate_inputs(opcode, { nullifier, address });

    get_gas_tracker().consume_gas();

    // Check nullifier existence via MerkleDB
    // (this also tag checks address and nullifier as FFs)
    auto exists = merkle_db.nullifier_exists(address.as_ff(), nullifier.as_ff());

    // Write result to memory
    // (assigns tag u1 to result)
    TaggedValue result = TaggedValue::from<uint1_t>(exists ? 1 : 0);
    memory.set(exists_offset, result);
    set_output(opcode, result);
}

void Execution::emit_nullifier(ContextInterface& context, MemoryAddress nullifier_addr)
{
    BB_BENCH_NAME("Execution::emit_nullifier");
    constexpr auto opcode = ExecutionOpCode::EMITNULLIFIER;

    auto& memory = context.get_memory();
    MemoryValue nullifier = memory.get(nullifier_addr);
    set_and_validate_inputs(opcode, { nullifier });

    get_gas_tracker().consume_gas();

    if (context.get_is_static()) {
        throw OpcodeExecutionException("EMITNULLIFIER: Cannot emit nullifier in static context");
    }

    if (merkle_db.get_tree_state().nullifierTree.counter == MAX_NULLIFIERS_PER_TX) {
        throw OpcodeExecutionException("EMITNULLIFIER: Maximum number of nullifiers reached");
    }

    // Emit nullifier via MerkleDB.
    try {
        merkle_db.nullifier_write(context.get_address(), nullifier.as<FF>());
    } catch (const NullifierCollisionException& e) {
        throw OpcodeExecutionException(format("EMITNULLIFIER: ", e.what()));
    }
}

void Execution::get_contract_instance(ContextInterface& context,
                                      MemoryAddress address_offset,
                                      MemoryAddress dst_offset,
                                      uint8_t member_enum)
{
    BB_BENCH_NAME("Execution::get_contract_instance");
    constexpr auto opcode = ExecutionOpCode::GETCONTRACTINSTANCE;
    auto& memory = context.get_memory();

    // Execution can still handle address memory read and tag checking
    auto address_value = memory.get(address_offset);
    AztecAddress contract_address = address_value.as<AztecAddress>();
    set_and_validate_inputs(opcode, { address_value });

    get_gas_tracker().consume_gas();

    // Call the dedicated opcode component to get the contract instance, validate the enum,
    // handle other errors, and perform the memory writes.
    try {
        get_contract_instance_component.get_contract_instance(memory, contract_address, dst_offset, member_enum);
    } catch (const GetContractInstanceException& e) {
        throw OpcodeExecutionException("GetContractInstance Exception");
    }

    // No `set_output` here since the dedicated component handles memory writes.
}

void Execution::emit_note_hash(ContextInterface& context, MemoryAddress note_hash_addr)
{
    BB_BENCH_NAME("Execution::emit_note_hash");
    constexpr auto opcode = ExecutionOpCode::EMITNOTEHASH;

    auto& memory = context.get_memory();
    auto note_hash = memory.get(note_hash_addr);
    set_and_validate_inputs(opcode, { note_hash });

    get_gas_tracker().consume_gas();

    if (context.get_is_static()) {
        throw OpcodeExecutionException("EMITNOTEHASH: Cannot emit note hash in static context");
    }

    if (merkle_db.get_tree_state().noteHashTree.counter == MAX_NOTE_HASHES_PER_TX) {
        throw OpcodeExecutionException("EMITNOTEHASH: Maximum number of note hashes reached");
    }

    merkle_db.note_hash_write(context.get_address(), note_hash.as<FF>());
}

void Execution::l1_to_l2_message_exists(ContextInterface& context,
                                        MemoryAddress msg_hash_addr,
                                        MemoryAddress leaf_index_addr,
                                        MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::l1_to_l2_message_exists");
    constexpr auto opcode = ExecutionOpCode::L1TOL2MSGEXISTS;

    auto& memory = context.get_memory();
    auto msg_hash = memory.get(msg_hash_addr);
    auto leaf_index = memory.get(leaf_index_addr);
    set_and_validate_inputs(opcode, { msg_hash, leaf_index });

    get_gas_tracker().consume_gas();

    uint64_t leaf_index_value = leaf_index.as<uint64_t>();

    bool index_in_range = greater_than.gt(L1_TO_L2_MSG_TREE_LEAF_COUNT, leaf_index_value);

    MemoryValue value;

    if (index_in_range) {
        value = MemoryValue::from<uint1_t>(merkle_db.l1_to_l2_msg_exists(leaf_index_value, msg_hash.as<FF>()));
    } else {
        value = MemoryValue::from<uint1_t>(0);
    }

    memory.set(dst_addr, value);
    set_output(opcode, value);
}

void Execution::poseidon2_permutation(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::poseidon2_permutation");
    get_gas_tracker().consume_gas();
    try {
        poseidon2.permutation(context.get_memory(), src_addr, dst_addr);
    } catch (const Poseidon2Exception& e) {
        throw OpcodeExecutionException("Poseidon2 permutation failed: " + std::string(e.what()));
    }
}

void Execution::ecc_add(ContextInterface& context,
                        MemoryAddress p_x_addr,
                        MemoryAddress p_y_addr,
                        MemoryAddress p_inf_addr,
                        MemoryAddress q_x_addr,
                        MemoryAddress q_y_addr,
                        MemoryAddress q_inf_addr,
                        MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::ecc_add");
    constexpr auto opcode = ExecutionOpCode::ECADD;
    auto& memory = context.get_memory();

    // Read the points from memory.
    const MemoryValue& p_x = memory.get(p_x_addr);
    const MemoryValue& p_y = memory.get(p_y_addr);
    const MemoryValue& p_inf = memory.get(p_inf_addr);

    const MemoryValue& q_x = memory.get(q_x_addr);
    const MemoryValue& q_y = memory.get(q_y_addr);
    const MemoryValue& q_inf = memory.get(q_inf_addr);

    set_and_validate_inputs(opcode, { p_x, p_y, p_inf, q_x, q_y, q_inf });
    get_gas_tracker().consume_gas();

    // Once inputs are tag checked the conversion to EmbeddedCurvePoint is safe, on curve checks are done in the add
    // method.
    EmbeddedCurvePoint p = EmbeddedCurvePoint(p_x.as_ff(), p_y.as_ff(), p_inf == MemoryValue::from<uint1_t>(1));
    EmbeddedCurvePoint q = EmbeddedCurvePoint(q_x.as_ff(), q_y.as_ff(), q_inf == MemoryValue::from<uint1_t>(1));

    try {
        embedded_curve.add(memory, p, q, dst_addr);
    } catch (const EccException& e) {
        throw OpcodeExecutionException("Embedded curve add failed: " + std::string(e.what()));
    }
}

void Execution::to_radix_be(ContextInterface& context,
                            MemoryAddress value_addr,
                            MemoryAddress radix_addr,
                            MemoryAddress num_limbs_addr,
                            MemoryAddress is_output_bits_addr, // Decides if output is U1 or U8
                            MemoryAddress dst_addr)
{
    BB_BENCH_NAME("Execution::to_radix_be");
    constexpr auto opcode = ExecutionOpCode::TORADIXBE;
    auto& memory = context.get_memory();

    const MemoryValue& value = memory.get(value_addr);                   // Field
    const MemoryValue& radix = memory.get(radix_addr);                   // U32
    const MemoryValue& num_limbs = memory.get(num_limbs_addr);           // U32
    const MemoryValue& is_output_bits = memory.get(is_output_bits_addr); // U1

    // Tag check the inputs
    {
        BB_BENCH_NAME("Execution::to_radix_be::set_and_validate_inputs");
        set_and_validate_inputs(opcode, { value, radix, num_limbs, is_output_bits });
    }

    // The range check for a valid radix (2 <= radix <= 256) is done in the gadget.
    // However, in order to compute the dynamic gas value we need to constrain the radix
    // to be <= 256 since the `get_p_limbs_per_radix` lookup table is only defined for the range [0, 256].
    // This does mean that the <= 256 check is duplicated - this can be optimized later.

    // The dynamic gas factor is the maximum of the num_limbs requested by the opcode and the number of limbs
    // the gadget that the field modulus, p, decomposes into given a radix (num_p_limbs).
    // See to_radix.pil for how these values impact the row count.

    // The lookup table of radix decomposed limbs of the modulus p is defined for radix values [0, 256],
    // so for any radix value greater than 256 we set num_p_limbs to 32 - with
    // the understanding the opcode will fail in the gadget (since the radix is invalid).
    uint32_t radix_value = radix.as<uint32_t>();
    uint32_t num_p_limbs = greater_than.gt(radix.as<uint32_t>(), 256)
                               ? 32
                               : static_cast<uint32_t>(get_p_limbs_per_radix_size(radix_value));

    // Compute the dynamic gas factor - done this way to trigger relevant circuit interactions
    if (greater_than.gt(num_limbs.as<uint32_t>(), num_p_limbs)) {
        get_gas_tracker().consume_gas({ .l2Gas = num_limbs.as<uint32_t>(), .daGas = 0 });
    } else {
        get_gas_tracker().consume_gas({ .l2Gas = num_p_limbs, .daGas = 0 });
    }

    try {
        // Call the gadget to perform the conversion.
        to_radix.to_be_radix(memory,
                             value.as_ff(),
                             radix.as<uint32_t>(),
                             num_limbs.as<uint32_t>(),
                             is_output_bits.as<uint1_t>().value() == 1,
                             dst_addr);
    } catch (const ToRadixException& e) {
        throw OpcodeExecutionException("ToRadixBe gadget failed: " + std::string(e.what()));
    }
}

void Execution::emit_unencrypted_log(ContextInterface& context, MemoryAddress log_size_offset, MemoryAddress log_offset)
{
    BB_BENCH_NAME("Execution::emit_unencrypted_log");
    constexpr auto opcode = ExecutionOpCode::EMITUNENCRYPTEDLOG;
    auto& memory = context.get_memory();

    const MemoryValue& log_size = memory.get(log_size_offset);
    set_and_validate_inputs(opcode, { log_size });
    uint32_t log_size_int = log_size.as<uint32_t>();

    get_gas_tracker().consume_gas({ .l2Gas = log_size_int, .daGas = log_size_int });

    // Call the dedicated opcode component to emit the log
    try {
        emit_unencrypted_log_component.emit_unencrypted_log(
            memory, context, context.get_address(), log_offset, log_size_int);
    } catch (const EmitUnencryptedLogException& e) {
        throw OpcodeExecutionException("EmitUnencryptedLog Exception");
    }
}

void Execution::send_l2_to_l1_msg(ContextInterface& context, MemoryAddress recipient_addr, MemoryAddress content_addr)
{
    BB_BENCH_NAME("Execution::send_l2_to_l1_msg");
    constexpr auto opcode = ExecutionOpCode::SENDL2TOL1MSG;
    auto& memory = context.get_memory();

    const MemoryValue& recipient = memory.get(recipient_addr);
    const MemoryValue& content = memory.get(content_addr);
    set_and_validate_inputs(opcode, { recipient, content });

    get_gas_tracker().consume_gas();

    auto side_effects_states_before = context.get_side_effect_states();

    if (context.get_is_static()) {
        throw OpcodeExecutionException("SENDL2TOL1MSG: Cannot send L2 to L1 message in static context");
    }

    if (side_effects_states_before.numL2ToL1Messages == MAX_L2_TO_L1_MSGS_PER_TX) {
        throw OpcodeExecutionException("SENDL2TOL1MSG: Maximum number of L2 to L1 messages reached");
    }

    // TODO: We don't store the l2 to l1 message in the context since it's not needed until cpp has to generate
    // public inputs.

    side_effects_states_before.numL2ToL1Messages++;
    context.set_side_effect_states(side_effects_states_before);
}

void Execution::sha256_compression(ContextInterface& context,
                                   MemoryAddress output_addr,
                                   MemoryAddress state_addr,
                                   MemoryAddress input_addr)
{
    BB_BENCH_NAME("Execution::sha256_compression");
    get_gas_tracker().consume_gas();

    try {
        sha256.compression(context.get_memory(), state_addr, input_addr, output_addr);
    } catch (const Sha256CompressionException& e) {
        throw OpcodeExecutionException("Sha256 Compression failed: " + std::string(e.what()));
    }
}

// This context interface is a top-level enqueued one.
// NOTE: For the moment this trace is not returning the context back.
ExecutionResult Execution::execute(std::unique_ptr<ContextInterface> enqueued_call_context)
{
    BB_BENCH_NAME("Execution::execute");
    external_call_stack.push(std::move(enqueued_call_context));

    while (!external_call_stack.empty()) {
        // We fix the context at this point. Even if the opcode changes the stack
        // we'll always use this in the loop.
        auto& context = *external_call_stack.top();

        // We'll be filling in the event as we go. And we always emit at the end.
        ExecutionEvent ex_event;

        try {
            // State before doing anything.
            ex_event.before_context_event = context.serialize_context_event();
            ex_event.next_context_id = context_provider.get_next_context_id();
            auto pc = context.get_pc();

            //// Temporality group 1 starts ////

            // We try to get the bytecode id. This can throw if the contract is not deployed or if we have retrieved too
            // many unique class ids. Note: bytecode_id is tracked in context events, not in the top-level execution
            // event. It is already included in the before_context_event (defaulting to 0 on error/not-found).
            context.get_bytecode_manager().get_bytecode_id();

            //// Temporality group 2 starts ////

            // We try to fetch an instruction.
            Instruction instruction = context.get_bytecode_manager().read_instruction(pc);

            ex_event.wire_instruction = instruction;
            debug("@", pc, " ", instruction.to_string());
            context.set_next_pc(pc + static_cast<uint32_t>(instruction.size_in_bytes()));

            //// Temporality group 4 starts ////

            // Resolve the operands.
            auto addressing = execution_components.make_addressing(ex_event.addressing_event);
            std::vector<Operand> resolved_operands = addressing->resolve(instruction, context.get_memory());

            //// Temporality group 5+ starts ////

            gas_tracker = execution_components.make_gas_tracker(ex_event.gas_event, instruction, context);
            dispatch_opcode(instruction.get_exec_opcode(), context, resolved_operands);
        }
        // TODO(fcarreiro): handle this in a better way.
        catch (const BytecodeRetrievalError& e) {
            vinfo("Bytecode retrieval error:: ", e.what());
            ex_event.error = ExecutionError::BYTECODE_RETRIEVAL;
            handle_exceptional_halt(context);
        } catch (const InstructionFetchingError& e) {
            vinfo("Instruction fetching error: ", e.what());
            ex_event.error = ExecutionError::INSTRUCTION_FETCHING;
            handle_exceptional_halt(context);
        } catch (const AddressingException& e) {
            vinfo("Addressing exception: ", e.what());
            ex_event.error = ExecutionError::ADDRESSING;
            handle_exceptional_halt(context);
        } catch (const RegisterValidationException& e) {
            vinfo("Register validation exception: ", e.what());
            ex_event.error = ExecutionError::REGISTER_READ;
            handle_exceptional_halt(context);
        } catch (const OutOfGasException& e) {
            vinfo("Out of gas exception: ", e.what());
            ex_event.error = ExecutionError::GAS;
            handle_exceptional_halt(context);
        } catch (const OpcodeExecutionException& e) {
            vinfo("Opcode execution exception: ", e.what());
            ex_event.error = ExecutionError::OPCODE_EXECUTION;
            handle_exceptional_halt(context);
        } catch (const std::exception& e) {
            // This is a coding error, we should not get here.
            // All exceptions should fall in the above catch blocks.
            info("An unhandled exception occurred: ", e.what());
            throw e;
        }

        // We always do what follows. "Finally".
        // Move on to the next pc.
        context.set_pc(context.get_next_pc());
        execution_id_manager.increment_execution_id();

        // TODO: we set the inputs and outputs here and into the execution event, but maybe there's a better way
        ex_event.inputs = get_inputs();
        ex_event.output = get_output();

        // State after the opcode.
        ex_event.after_context_event = context.serialize_context_event();
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
    ctx_stack_events.emit(
        { .id = parent_context.get_context_id(),
          .parent_id = parent_context.get_parent_id(),
          .entered_context_id = child_context->get_context_id(), // gets the context id of the child!
          .next_pc = parent_context.get_next_pc(),
          .msg_sender = parent_context.get_msg_sender(),
          .contract_addr = parent_context.get_address(),
          .bytecode_id = parent_context.get_bytecode_manager()
                             .get_retrieved_bytecode_id()
                             .value(), // Bytecode should have been retrieved in the parent context if it issued a call.
          .is_static = parent_context.get_is_static(),
          .parent_cd_addr = parent_context.get_parent_cd_addr(),
          .parent_cd_size = parent_context.get_parent_cd_size(),
          .parent_gas_used = parent_context.get_parent_gas_used(),
          .parent_gas_limit = parent_context.get_parent_gas_limit(),
          .tree_states = merkle_db.get_tree_state(),
          .written_public_data_slots_tree_snapshot = parent_context.get_written_public_data_slots_tree_snapshot(),
          .side_effect_states = parent_context.get_side_effect_states() });

    external_call_stack.push(std::move(child_context));
}

void Execution::handle_exit_call()
{
    BB_BENCH_NAME("Execution::handle_exit_call");

    // NOTE: the current (child) context should not be modified here, since it was already emitted.
    std::unique_ptr<ContextInterface> child_context = std::move(external_call_stack.top());
    external_call_stack.pop();
    ExecutionResult result = get_execution_result();

    // We only handle reverting/committing of nested calls. Enqueued calls are handled by TX execution.
    if (!external_call_stack.empty()) {
        // Note: committing or reverting the db here also commits or reverts the
        // tracked nullifiers, public writes dictionary, etc. These structures
        // "listen" to the db changes.
        if (result.success) {
            merkle_db.commit_checkpoint();
        } else {
            merkle_db.revert_checkpoint();
        }

        auto& parent_context = *external_call_stack.top();
        // was not top level, communicate with parent
        parent_context.set_last_rd_addr(result.rd_offset);
        parent_context.set_last_rd_size(result.rd_size);
        parent_context.set_last_success(result.success);
        // Safe since the nested context gas limit should be clamped to the available gas.
        parent_context.set_gas_used(result.gas_used + parent_context.get_gas_used());
        if (result.success) {
            parent_context.set_side_effect_states(result.side_effect_states);
        }
        parent_context.set_child_context(std::move(child_context));

        // TODO(fcarreiro): move somewhere else.
        if (parent_context.get_checkpoint_id_at_creation() != merkle_db.get_checkpoint_id()) {
            throw std::runtime_error(format("Checkpoint id mismatch: ",
                                            parent_context.get_checkpoint_id_at_creation(),
                                            " != ",
                                            merkle_db.get_checkpoint_id(),
                                            " (gone back to the wrong db/context)"));
        }
    }
    // Else: was top level. ExecutionResult is already set and that will be returned.
}

void Execution::handle_exceptional_halt(ContextInterface& context)
{
    context.set_gas_used(context.get_gas_limit()); // Consume all gas.
    context.halt();
    set_execution_result({
        .rd_offset = 0,
        .rd_size = 0,
        .gas_used = context.get_gas_used(),
        .side_effect_states = context.get_side_effect_states(),
        .success = false,
    });
}

void Execution::dispatch_opcode(ExecutionOpCode opcode,
                                ContextInterface& context,
                                const std::vector<Operand>& resolved_operands)
{
    BB_BENCH_NAME("Execution::dispatch_opcode");

    // TODO: consider doing this even before the dispatch.
    inputs = {};
    output = TaggedValue::from<FF>(0);

    debug("Dispatching opcode: ", opcode, " (", static_cast<uint32_t>(opcode), ")");
    switch (opcode) {
    case ExecutionOpCode::ADD:
        call_with_operands(&Execution::add, context, resolved_operands);
        break;
    case ExecutionOpCode::SUB:
        call_with_operands(&Execution::sub, context, resolved_operands);
        break;
    case ExecutionOpCode::MUL:
        call_with_operands(&Execution::mul, context, resolved_operands);
        break;
    case ExecutionOpCode::DIV:
        call_with_operands(&Execution::div, context, resolved_operands);
        break;
    case ExecutionOpCode::FDIV:
        call_with_operands(&Execution::fdiv, context, resolved_operands);
        break;
    case ExecutionOpCode::EQ:
        call_with_operands(&Execution::eq, context, resolved_operands);
        break;
    case ExecutionOpCode::LT:
        call_with_operands(&Execution::lt, context, resolved_operands);
        break;
    case ExecutionOpCode::LTE:
        call_with_operands(&Execution::lte, context, resolved_operands);
        break;
    case ExecutionOpCode::NOT:
        call_with_operands(&Execution::op_not, context, resolved_operands);
        break;
    case ExecutionOpCode::SHL:
        call_with_operands(&Execution::shl, context, resolved_operands);
        break;
    case ExecutionOpCode::SHR:
        call_with_operands(&Execution::shr, context, resolved_operands);
        break;
    case ExecutionOpCode::CAST:
        call_with_operands(&Execution::cast, context, resolved_operands);
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
    case ExecutionOpCode::STATICCALL:
        call_with_operands(&Execution::static_call, context, resolved_operands);
        break;
    case ExecutionOpCode::RETURN:
        call_with_operands(&Execution::ret, context, resolved_operands);
        break;
    case ExecutionOpCode::REVERT:
        call_with_operands(&Execution::revert, context, resolved_operands);
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
    case ExecutionOpCode::DEBUGLOG:
        call_with_operands(&Execution::debug_log, context, resolved_operands);
        break;
    case ExecutionOpCode::AND:
        call_with_operands(&Execution::and_op, context, resolved_operands);
        break;
    case ExecutionOpCode::OR:
        call_with_operands(&Execution::or_op, context, resolved_operands);
        break;
    case ExecutionOpCode::XOR:
        call_with_operands(&Execution::xor_op, context, resolved_operands);
        break;
    case ExecutionOpCode::SLOAD:
        call_with_operands(&Execution::sload, context, resolved_operands);
        break;
    case ExecutionOpCode::SSTORE:
        call_with_operands(&Execution::sstore, context, resolved_operands);
        break;
    case ExecutionOpCode::NOTEHASHEXISTS:
        call_with_operands(&Execution::note_hash_exists, context, resolved_operands);
        break;
    case ExecutionOpCode::NULLIFIEREXISTS:
        call_with_operands(&Execution::nullifier_exists, context, resolved_operands);
        break;
    case ExecutionOpCode::EMITNULLIFIER:
        call_with_operands(&Execution::emit_nullifier, context, resolved_operands);
        break;
    case ExecutionOpCode::GETCONTRACTINSTANCE:
        call_with_operands(&Execution::get_contract_instance, context, resolved_operands);
        break;
    case ExecutionOpCode::EMITNOTEHASH:
        call_with_operands(&Execution::emit_note_hash, context, resolved_operands);
        break;
    case ExecutionOpCode::L1TOL2MSGEXISTS:
        call_with_operands(&Execution::l1_to_l2_message_exists, context, resolved_operands);
        break;
    case ExecutionOpCode::POSEIDON2PERM:
        call_with_operands(&Execution::poseidon2_permutation, context, resolved_operands);
        break;
    case ExecutionOpCode::ECADD:
        call_with_operands(&Execution::ecc_add, context, resolved_operands);
        break;
    case ExecutionOpCode::TORADIXBE:
        call_with_operands(&Execution::to_radix_be, context, resolved_operands);
        break;
    case ExecutionOpCode::EMITUNENCRYPTEDLOG:
        call_with_operands(&Execution::emit_unencrypted_log, context, resolved_operands);
        break;
    case ExecutionOpCode::SENDL2TOL1MSG:
        call_with_operands(&Execution::send_l2_to_l1_msg, context, resolved_operands);
        break;
    case ExecutionOpCode::SHA256COMPRESSION:
        call_with_operands(&Execution::sha256_compression, context, resolved_operands);
        break;
    default:
        // NOTE: Keep this a `std::runtime_error` so that the main loop panics.
        throw std::runtime_error("Tried to dispatch unknown execution opcode: " +
                                 std::to_string(static_cast<uint32_t>(opcode)));
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
        (this->*f)(context, resolved_operands.at(Is).to<std::decay_t<Ts>>()...);
    }(operand_indices);
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
