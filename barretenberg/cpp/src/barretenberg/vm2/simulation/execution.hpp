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
// #include "barretenberg/vm2/simulation/context_stack.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

struct ExecutionResult {
    uint32_t returndata_src_addr;
    uint32_t returndata_size_addr;
    bool success;
    // uint32_t gas_used;
};

class ExecutionInterface {
  public:
    virtual ~ExecutionInterface() = default;
    // Returns the top-level execution result.
    virtual ExecutionResult execute(AztecAddress contract_address,
                                    std::span<const FF> calldata,
                                    AztecAddress msg_sender,
                                    bool is_static) = 0;
    virtual ContextInterface& get_current_context() = 0;
};

// In charge of executing a single enqueued call.
class Execution : public ExecutionInterface {
  public:
    Execution(AluInterface& alu,
              AddressingInterface& addressing,
              ContextProviderInterface& context_provider,
              // ContextSnapshotsInterface& context_snapshots,
              const InstructionInfoDBInterface& instruction_info_db,
              EventEmitterInterface<ExecutionEvent>& event_emitter)
        : context_provider(context_provider)
        // , context_snapshots(context_snapshots)
        , instruction_info_db(instruction_info_db)
        , alu(alu)
        , addressing(addressing)
        , events(event_emitter)
    {}

    ExecutionResult execute(AztecAddress contract_address,
                            std::span<const FF> calldata,
                            AztecAddress msg_sender,
                            bool is_static) override;

    ExecutionResult execute_internal(ContextInterface& context);

    ContextInterface& get_current_context() override { return *current_context; }

    // Opcode handlers. The order of the operands matters and should be the same as the wire format.
    void add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, MemoryValue value);
    void mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void jump(ContextInterface& context, uint32_t loc);
    void jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc);
    void call(ContextInterface& context, MemoryAddress addr);
    void cd_copy(ContextInterface& context,
                 MemoryAddress cd_offset_addr,
                 MemoryAddress copy_size_addr,
                 MemoryAddress dst_addr);
    void ret(ContextInterface& context, MemoryAddress ret_offset, MemoryAddress ret_size_offset);
    void rd_size(ContextInterface& context, MemoryAddress dst_offset);
    void rd_copy(ContextInterface& context,
                 MemoryAddress rd_offset_addr,
                 MemoryAddress copy_size_addr,
                 MemoryAddress dst_offset);

  private:
    void execution_loop(ContextInterface& context);
    void dispatch_opcode(ExecutionOpCode opcode, const std::vector<Operand>& resolved_operands);
    template <typename... Ts>
    void call_with_operands(void (Execution::*f)(ContextInterface&, Ts...),
                            const std::vector<Operand>& resolved_operands);
    std::vector<Operand> resolve_operands(const Instruction& instruction, const ExecInstructionSpec& spec);

    std::unique_ptr<ContextInterface> current_context; // Yuck?
    ContextProviderInterface& context_provider;
    // ContextSnapshotsInterface& context_snapshots;
    const InstructionInfoDBInterface& instruction_info_db;
    ExecutionResult execution_result;

    AluInterface& alu;
    AddressingInterface& addressing;
    EventEmitterInterface<ExecutionEvent>& events;
};

} // namespace bb::avm2::simulation
