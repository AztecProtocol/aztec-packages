#pragma once

#include <cstdint>
#include <memory>
#include <span>
#include <stack>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/context_stack.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

struct ExecutionResult {
    std::vector<FF> returndata;
    bool success;
};

class ExecutionInterface {
  public:
    virtual ~ExecutionInterface() = default;
    // Returns the top-level execution result.
    virtual ExecutionResult execute(AztecAddress contract_address,
                                    std::span<const FF> calldata,
                                    AztecAddress msg_sender,
                                    bool is_static) = 0;
};

// In charge of executing a single enqueued call.
class Execution : public ExecutionInterface {
  public:
    Execution(AluInterface& alu,
              AddressingInterface& addressing,
              ContextProviderInterface& context_provider,
              ContextStackInterface& context_stack,
              const InstructionInfoDBInterface& instruction_info_db,
              EventEmitterInterface<ExecutionEvent>& event_emitter)
        : context_provider(context_provider)
        , context_stack(context_stack)
        , instruction_info_db(instruction_info_db)
        , alu(alu)
        , addressing(addressing)
        , events(event_emitter)
    {}

    ExecutionResult execute(AztecAddress contract_address,
                            std::span<const FF> calldata,
                            AztecAddress msg_sender,
                            bool is_static) override;

    // Opcode handlers. The order of the operands matters and should be the same as the wire format.
    void add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, MemoryValue value);
    void mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void jump(ContextInterface& context, uint32_t loc);
    void jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc);
    void call(ContextInterface& context, MemoryAddress addr);
    void ret(ContextInterface& context, MemoryAddress ret_offset, MemoryAddress ret_size_offset);

  private:
    void execution_loop();
    void dispatch_opcode(ExecutionOpCode opcode, const std::vector<Operand>& resolved_operands);
    template <typename... Ts>
    void call_with_operands(void (Execution::*f)(ContextInterface&, Ts...),
                            const std::vector<Operand>& resolved_operands);
    std::vector<Operand> resolve_operands(const Instruction& instruction, const InstructionSpec& spec);

    ContextProviderInterface& context_provider;
    ContextStackInterface& context_stack;
    const InstructionInfoDBInterface& instruction_info_db;
    ExecutionResult top_level_result;

    AluInterface& alu;
    AddressingInterface& addressing;
    EventEmitterInterface<ExecutionEvent>& events;
};

} // namespace bb::avm2::simulation