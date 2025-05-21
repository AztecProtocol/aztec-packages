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

// Used to pass contextual information to the opcode execution, and to receive outputs from the opcode execution back.
class OpcodeIOInterface {
  public:
    virtual ~OpcodeIOInterface() = default;

    // Inputs to the opcode execution
    virtual GasTrackerInterface& get_gas_tracker() = 0;

    // Outputs of the opcode execution
    virtual void set_child_context(std::unique_ptr<ContextInterface> child_ctx) = 0;
    virtual void set_nested_execution_result(ExecutionResult exec_result) = 0;
    virtual std::unique_ptr<ContextInterface> extract_child_context() = 0;
    virtual std::optional<ExecutionResult> get_nested_execution_result() const = 0;

    virtual void set_inputs(std::vector<TaggedValue> inputs) = 0;
    virtual void set_output(TaggedValue output) = 0;
    virtual const std::vector<TaggedValue>& get_inputs() const = 0;
    virtual const TaggedValue& get_output() const = 0;
};

class OpcodeIO : public OpcodeIOInterface {
  public:
    OpcodeIO(GasTrackerInterface& gas_tracker)
        : gas_tracker(gas_tracker)
    {}

    void set_child_context(std::unique_ptr<ContextInterface> child_ctx) override
    {
        child_context = std::move(child_ctx);
    }
    void set_nested_execution_result(ExecutionResult exec_result) override { nested_execution_result = exec_result; }

    std::unique_ptr<ContextInterface> extract_child_context() override { return std::move(child_context); }
    std::optional<ExecutionResult> get_nested_execution_result() const override { return nested_execution_result; }
    GasTrackerInterface& get_gas_tracker() override { return gas_tracker; }

    // TODO(#13683): This is leaking circuit implementation details. We should have a better way to do this.
    // Setters for inputs and output for gadgets/subtraces. These are used for register allocation.
    void set_inputs(std::vector<TaggedValue> inputs) override { this->inputs = std::move(inputs); }
    void set_output(TaggedValue output) override { this->output = std::move(output); }
    const std::vector<TaggedValue>& get_inputs() const override { return inputs; }
    const TaggedValue& get_output() const override { return output; }

  private:
    GasTrackerInterface& gas_tracker;

    std::unique_ptr<ContextInterface> child_context;
    std::optional<ExecutionResult> nested_execution_result;
    std::vector<TaggedValue> inputs;
    TaggedValue output;
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
    void add(ContextInterface& context,
             OpcodeIOInterface& opcode_io,
             MemoryAddress a_addr,
             MemoryAddress b_addr,
             MemoryAddress dst_addr);
    void set(ContextInterface& context, OpcodeIOInterface& opcode_io, MemoryAddress dst_addr, uint8_t tag, FF value);
    void mov(ContextInterface& context, OpcodeIOInterface& opcode_io, MemoryAddress src_addr, MemoryAddress dst_addr);
    void jump(ContextInterface& context, OpcodeIOInterface& opcode_io, uint32_t loc);
    void jumpi(ContextInterface& context, OpcodeIOInterface& opcode_io, MemoryAddress cond_addr, uint32_t loc);
    void call(ContextInterface& context,
              OpcodeIOInterface& opcode_io,
              MemoryAddress l2_gas_offset,
              MemoryAddress da_gas_offset,
              MemoryAddress addr,
              MemoryAddress cd_offset,
              MemoryAddress cd_size);
    void ret(ContextInterface& context,
             OpcodeIOInterface& opcode_io,
             MemoryAddress ret_size_offset,
             MemoryAddress ret_offset);
    void revert(ContextInterface& context,
                OpcodeIOInterface& opcode_io,
                MemoryAddress rev_size_offset,
                MemoryAddress rev_offset);

  private:
    void set_execution_result(ExecutionResult exec_result) { this->exec_result = exec_result; }
    ExecutionResult get_execution_result() const { return exec_result; }
    ExecutionResult execute_internal(ContextInterface& context);
    void dispatch_opcode(ExecutionOpCode opcode,
                         ContextInterface& context,
                         OpcodeIOInterface& opcode_io,
                         const std::vector<Operand>& resolved_operands);
    template <typename... Ts>
    void call_with_operands(void (Execution::*f)(ContextInterface&, OpcodeIOInterface&, Ts...),
                            ContextInterface& context,
                            OpcodeIOInterface& opcode_io,
                            const std::vector<Operand>& resolved_operands);
    std::vector<Operand> resolve_operands(const Instruction& instruction, const ExecInstructionSpec& spec);

    void emit_context_snapshot(ContextInterface& context);

    void update_context_for_next_opcode(OpcodeIOInterface& opcode_io, ContextInterface& context);

    ExecutionComponentsProviderInterface& execution_components;
    const InstructionInfoDBInterface& instruction_info_db;

    AluInterface& alu;
    EventEmitterInterface<ExecutionEvent>& events;
    EventEmitterInterface<ContextStackEvent>& ctx_stack_events;

    ExecutionResult exec_result;
};

} // namespace bb::avm2::simulation
