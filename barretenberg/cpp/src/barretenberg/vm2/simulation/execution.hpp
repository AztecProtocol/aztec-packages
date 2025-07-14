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
#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/context_provider.hpp"
#include "barretenberg/vm2/simulation/data_copy.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/execution_components.hpp"
#include "barretenberg/vm2/simulation/internal_call_stack_manager.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

struct ExecutionResult {
    MemoryAddress rd_offset;
    MemoryAddress rd_size;
    Gas gas_used;
    bool success;
};

class ExecutionInterface {
  public:
    virtual ~ExecutionInterface() = default;
    // Returns the top-level execution result. TODO: This should only be top level enqueud calls
    virtual ExecutionResult execute(std::unique_ptr<ContextInterface> context) = 0;
};

// In charge of executing a single enqueued call.
class Execution : public ExecutionInterface {
  public:
    Execution(AluInterface& alu,
              BitwiseInterface& bitwise,
              DataCopyInterface& data_copy,
              ExecutionComponentsProviderInterface& execution_components,
              ContextProviderInterface& context_provider,
              const InstructionInfoDBInterface& instruction_info_db,
              ExecutionIdManagerInterface& execution_id_manager,
              EventEmitterInterface<ExecutionEvent>& event_emitter,
              EventEmitterInterface<ContextStackEvent>& ctx_stack_emitter,
              KeccakF1600Interface& keccakf1600,
              HighLevelMerkleDBInterface& merkle_db)
        : execution_components(execution_components)
        , instruction_info_db(instruction_info_db)
        , alu(alu)
        , bitwise(bitwise)
        , context_provider(context_provider)
        , execution_id_manager(execution_id_manager)
        , data_copy(data_copy)
        , keccakf1600(keccakf1600)
        , merkle_db(merkle_db)
        , events(event_emitter)
        , ctx_stack_events(ctx_stack_emitter)
    {}

    ExecutionResult execute(std::unique_ptr<ContextInterface> enqueued_call_context) override;

    // Opcode handlers. The order of the operands matters and should be the same as the wire format.
    void add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void eq(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void lt(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void lte(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void op_not(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void get_env_var(ContextInterface& context, MemoryAddress dst_addr, uint8_t var_enum);
    void set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, FF value);
    void mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void jump(ContextInterface& context, uint32_t loc);
    void jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc);
    void call(ContextInterface& context,
              MemoryAddress l2_gas_offset,
              MemoryAddress da_gas_offset,
              MemoryAddress addr,
              MemoryAddress cd_size_offset,
              MemoryAddress cd_offset);
    void ret(ContextInterface& context, MemoryAddress ret_size_offset, MemoryAddress ret_offset);
    void revert(ContextInterface& context, MemoryAddress rev_size_offset, MemoryAddress rev_offset);
    void cd_copy(ContextInterface& context,
                 MemoryAddress cd_size_offset,
                 MemoryAddress cd_offset,
                 MemoryAddress dst_addr);
    void rd_copy(ContextInterface& context,
                 MemoryAddress rd_size_offset,
                 MemoryAddress rd_offset,
                 MemoryAddress dst_addr);
    void rd_size(ContextInterface& context, MemoryAddress dst_addr);
    void internal_call(ContextInterface& context, uint32_t loc);
    void internal_return(ContextInterface& context);
    void keccak_permutation(ContextInterface& context, MemoryAddress dst_addr, MemoryAddress src_addr);
    void success_copy(ContextInterface& context, MemoryAddress dst_addr);
    void debug_log(ContextInterface& context,
                   MemoryAddress message_offset,
                   MemoryAddress fields_offset,
                   MemoryAddress fields_size_offset,
                   uint16_t message_size,
                   bool is_debug_logging_enabled = debug_logging);
    void and_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void or_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void xor_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void sload(ContextInterface& context, MemoryAddress slot_addr, MemoryAddress dst_addr);
    void sstore(ContextInterface& context, MemoryAddress src_addr, MemoryAddress slot_addr);

  protected:
    // Only here for testing. TODO(fcarreiro): try to improve.
    virtual GasTrackerInterface& get_gas_tracker() { return *gas_tracker; }

  private:
    void set_execution_result(ExecutionResult exec_result) { this->exec_result = exec_result; }
    ExecutionResult get_execution_result() const { return exec_result; }
    void dispatch_opcode(ExecutionOpCode opcode,
                         ContextInterface& context,
                         const std::vector<Operand>& resolved_operands);
    template <typename... Ts>
    void call_with_operands(void (Execution::*f)(ContextInterface&, Ts...),
                            ContextInterface& context,
                            const std::vector<Operand>& resolved_operands);
    std::vector<Operand> resolve_operands(const Instruction& instruction, const ExecInstructionSpec& spec);

    void handle_enter_call(ContextInterface& parent_context, std::unique_ptr<ContextInterface> child_context);
    void handle_exit_call();

    // TODO(#13683): This is leaking circuit implementation details. We should have a better way to do this.
    // Setters for inputs and output for gadgets/subtraces. These are used for register allocation.
    void set_and_validate_inputs(ExecutionOpCode opcode, std::vector<TaggedValue> inputs);
    void set_output(ExecutionOpCode opcode, TaggedValue output);
    const std::vector<TaggedValue>& get_inputs() const { return inputs; }
    const TaggedValue& get_output() const { return output; }

    ExecutionComponentsProviderInterface& execution_components;
    const InstructionInfoDBInterface& instruction_info_db;

    AluInterface& alu;
    BitwiseInterface& bitwise;
    ContextProviderInterface& context_provider;
    ExecutionIdManagerInterface& execution_id_manager;
    DataCopyInterface& data_copy;
    KeccakF1600Interface& keccakf1600;
    HighLevelMerkleDBInterface& merkle_db;

    EventEmitterInterface<ExecutionEvent>& events;
    EventEmitterInterface<ContextStackEvent>& ctx_stack_events;

    ExecutionResult exec_result;

    std::stack<std::unique_ptr<ContextInterface>> external_call_stack;
    std::vector<TaggedValue> inputs;
    TaggedValue output;
    std::unique_ptr<GasTrackerInterface> gas_tracker;
};

} // namespace bb::avm2::simulation
