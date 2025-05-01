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
#include "barretenberg/vm2/common/tagged_value.hpp"
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
    MemoryAddress rd_offset;
    MemoryAddress rd_size;
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
              EventEmitterInterface<ExecutionEvent>& event_emitter,
              EventEmitterInterface<ContextStackEvent>& ctx_stack_emitter)
        : execution_components(execution_components)
        , instruction_info_db(instruction_info_db)
        , alu(alu)
        , events(event_emitter)
        , ctx_stack_events(ctx_stack_emitter)
    {}

    ExecutionResult execute(ContextInterface& enqueued_call_context) override;
    ExecutionComponentsProviderInterface& get_provider() override { return execution_components; };

    // Opcode handlers. The order of the operands matters and should be the same as the wire format.
    void add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, FF value);
    void mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void jump(ContextInterface& context, uint32_t loc);
    void jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc);
    void call(ContextInterface& context,
              MemoryAddress l2_gas_offset,
              MemoryAddress da_gas_offset,
              MemoryAddress addr,
              MemoryAddress cd_offset,
              MemoryAddress cd_size);
    void ret(ContextInterface& context, MemoryAddress ret_size_offset, MemoryAddress ret_offset);
    void revert(ContextInterface& context, MemoryAddress rev_size_offset, MemoryAddress rev_offset);

    // TODO(#13683): This is leaking circuit implementation details. We should have a better way to do this.
    // Setters for inputs and output for gadgets/subtraces. These are used for register allocation.
    void set_inputs(std::vector<TaggedValue> inputs) { this->inputs = std::move(inputs); }
    void set_output(TaggedValue output) { this->output = std::move(output); }
    const std::vector<TaggedValue>& get_inputs() const { return inputs; }
    const TaggedValue& get_output() const { return output; }

  private:
    void set_execution_result(ExecutionResult exec_result) { this->exec_result = exec_result; }
    ExecutionResult get_execution_result() const { return exec_result; }
    ExecutionResult execute_internal(ContextInterface& context);
    void dispatch_opcode(ExecutionOpCode opcode,
                         ContextInterface& context,
                         const std::vector<Operand>& resolved_operands);
    template <typename... Ts>
    void call_with_operands(void (Execution::*f)(ContextInterface&, Ts...),
                            ContextInterface& context,
                            const std::vector<Operand>& resolved_operands);
    std::vector<Operand> resolve_operands(const Instruction& instruction, const ExecInstructionSpec& spec);

    void emit_context_snapshot(ContextInterface& context);

    ExecutionComponentsProviderInterface& execution_components;
    const InstructionInfoDBInterface& instruction_info_db;

    AluInterface& alu;
    EventEmitterInterface<ExecutionEvent>& events;
    EventEmitterInterface<ContextStackEvent>& ctx_stack_events;

    ExecutionResult exec_result;

    std::vector<TaggedValue> inputs;
    TaggedValue output;
};

} // namespace bb::avm2::simulation
