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
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/execution_components.hpp"
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
    // Returns the top-level execution result. TODO: This should only be top level enqueud calls
    virtual ExecutionResult execute(ContextInterface& context) = 0;

    // This feels off, but we need access to the context provider at both the tx and execution level
    // and threading it feels worse.
    virtual ExecutionComponentsProviderInterface& get_provider() = 0;
};

// In charge of executing a single enqueued call.
class Execution : public ExecutionInterface {
  public:
    Execution(AluInterface& alu,
              ExecutionComponentsProviderInterface& execution_components,
              const InstructionInfoDBInterface& instruction_info_db,
              EventEmitterInterface<ExecutionEvent>& event_emitter)
        : execution_components(execution_components)
        , instruction_info_db(instruction_info_db)
        , alu(alu)
        , events(event_emitter)
    {}

    ExecutionResult execute(ContextInterface& enqueued_call_context) override;
    ExecutionComponentsProviderInterface& get_provider() override { return execution_components; };

    // Opcode handlers. The order of the operands matters and should be the same as the wire format.
    void add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, MemoryValue value);
    void mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void jump(ContextInterface& context, uint32_t loc);
    void jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc);
    void call(ContextInterface& context, MemoryAddress addr);
    void ret(ContextInterface& context, MemoryAddress ret_offset, MemoryAddress ret_size_offset);

  private:
    ExecutionResult execute_internal(ContextInterface& context);
    void dispatch_opcode(ExecutionOpCode opcode,
                         ContextInterface& context,
                         const std::vector<Operand>& resolved_operands);
    template <typename... Ts>
    void call_with_operands(void (Execution::*f)(ContextInterface&, Ts...),
                            ContextInterface& context,
                            const std::vector<Operand>& resolved_operands);
    std::vector<Operand> resolve_operands(const Instruction& instruction, const ExecInstructionSpec& spec);

    ExecutionComponentsProviderInterface& execution_components;
    const InstructionInfoDBInterface& instruction_info_db;

    AluInterface& alu;
    EventEmitterInterface<ExecutionEvent>& events;
};

} // namespace bb::avm2::simulation
