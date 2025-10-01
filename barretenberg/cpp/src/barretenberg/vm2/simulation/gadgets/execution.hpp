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
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/addressing.hpp"
#include "barretenberg/vm2/simulation/gadgets/alu.hpp"
#include "barretenberg/vm2/simulation/gadgets/bitwise.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/gadgets/data_copy.hpp"
#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"
#include "barretenberg/vm2/simulation/gadgets/emit_unencrypted_log.hpp"
#include "barretenberg/vm2/simulation/gadgets/execution_components.hpp"
#include "barretenberg/vm2/simulation/gadgets/get_contract_instance.hpp"
#include "barretenberg/vm2/simulation/gadgets/internal_call_stack_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/keccakf1600.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/gadgets/sha256.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/debug_log.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

// In charge of executing a single enqueued call.
class Execution : public ExecutionInterface {
  public:
    Execution(AluInterface& alu,
              BitwiseInterface& bitwise,
              DataCopyInterface& data_copy,
              Poseidon2Interface& poseidon2,
              EccInterface& ecc,
              ToRadixInterface& to_radix,
              Sha256Interface& sha256,
              ExecutionComponentsProviderInterface& execution_components,
              ContextProviderInterface& context_provider,
              const InstructionInfoDBInterface& instruction_info_db,
              ExecutionIdManagerInterface& execution_id_manager,
              EventEmitterInterface<ExecutionEvent>& event_emitter,
              EventEmitterInterface<ContextStackEvent>& ctx_stack_emitter,
              KeccakF1600Interface& keccakf1600,
              GreaterThanInterface& greater_than,
              GetContractInstanceInterface& get_contract_instance_component,
              EmitUnencryptedLogInterface& emit_unencrypted_log_component,
              DebugLoggerInterface& debug_log_component,
              HighLevelMerkleDBInterface& merkle_db)
        : execution_components(execution_components)
        , instruction_info_db(instruction_info_db)
        , alu(alu)
        , bitwise(bitwise)
        , poseidon2(poseidon2)
        , embedded_curve(ecc)
        , to_radix(to_radix)
        , sha256(sha256)
        , context_provider(context_provider)
        , execution_id_manager(execution_id_manager)
        , data_copy(data_copy)
        , keccakf1600(keccakf1600)
        , greater_than(greater_than)
        , get_contract_instance_component(get_contract_instance_component)
        , emit_unencrypted_log_component(emit_unencrypted_log_component)
        , debug_log_component(debug_log_component)
        , merkle_db(merkle_db)
        , events(event_emitter)
        , ctx_stack_events(ctx_stack_emitter)
    {}

    ExecutionResult execute(std::unique_ptr<ContextInterface> enqueued_call_context) override;

    // Opcode handlers. The order of the operands matters and should be the same as the wire format.
    void add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void sub(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void mul(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void div(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void fdiv(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void eq(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void lt(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void lte(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void op_not(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void cast(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr, uint8_t dst_tag);
    void get_env_var(ContextInterface& context, MemoryAddress dst_addr, uint8_t var_enum);
    void set(ContextInterface& context, MemoryAddress dst_addr, uint8_t tag, const FF& value);
    void mov(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void jump(ContextInterface& context, uint32_t loc);
    void jumpi(ContextInterface& context, MemoryAddress cond_addr, uint32_t loc);
    void call(ContextInterface& context,
              MemoryAddress l2_gas_offset,
              MemoryAddress da_gas_offset,
              MemoryAddress addr,
              MemoryAddress cd_size_offset,
              MemoryAddress cd_offset);
    void static_call(ContextInterface& context,
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
                   MemoryAddress level_offset,
                   MemoryAddress message_offset,
                   MemoryAddress fields_offset,
                   MemoryAddress fields_size_offset,
                   uint16_t message_size);
    void and_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void or_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void xor_op(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr);
    void sload(ContextInterface& context, MemoryAddress slot_addr, MemoryAddress dst_addr);
    void sstore(ContextInterface& context, MemoryAddress src_addr, MemoryAddress slot_addr);
    void note_hash_exists(ContextInterface& context,
                          MemoryAddress unique_note_hash_addr,
                          MemoryAddress leaf_index_addr,
                          MemoryAddress dst_addr);
    void nullifier_exists(ContextInterface& context,
                          MemoryAddress nullifier_offset,
                          MemoryAddress address_offset,
                          MemoryAddress exists_offset);
    void emit_nullifier(ContextInterface& context, MemoryAddress nullifier_addr);
    void get_contract_instance(ContextInterface& context,
                               MemoryAddress address_offset,
                               MemoryAddress dst_offset,
                               uint8_t member_enum);
    void emit_note_hash(ContextInterface& context, MemoryAddress note_hash_addr);
    void l1_to_l2_message_exists(ContextInterface& context,
                                 MemoryAddress msg_hash_addr,
                                 MemoryAddress leaf_index_addr,
                                 MemoryAddress dst_addr);
    void poseidon2_permutation(ContextInterface& context, MemoryAddress src_addr, MemoryAddress dst_addr);
    void ecc_add(ContextInterface& context,
                 MemoryAddress p_x_addr,
                 MemoryAddress p_y_addr,
                 MemoryAddress p_inf_addr,
                 MemoryAddress q_x_addr,
                 MemoryAddress q_y_addr,
                 MemoryAddress q_inf_addr,
                 MemoryAddress dst_addr);
    void to_radix_be(ContextInterface& context,
                     MemoryAddress value_addr,
                     MemoryAddress radix_addr,
                     MemoryAddress num_limbs_addr,
                     MemoryAddress is_output_bits_addr,
                     MemoryAddress dst_addr);
    void emit_unencrypted_log(ContextInterface& context, MemoryAddress log_size_offset, MemoryAddress log_offset);
    void send_l2_to_l1_msg(ContextInterface& context, MemoryAddress recipient_addr, MemoryAddress content_addr);
    void sha256_compression(ContextInterface& context,
                            MemoryAddress output_addr,
                            MemoryAddress state_addr,
                            MemoryAddress input_addr);
    void shr(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress c_addr);
    void shl(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress c_addr);

  protected:
    // Only here for testing. TODO(fcarreiro): try to improve.
    virtual GasTrackerInterface& get_gas_tracker() { return *gas_tracker; }

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
    void handle_exceptional_halt(ContextInterface& context);

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
    Poseidon2Interface& poseidon2;
    EccInterface& embedded_curve;
    ToRadixInterface& to_radix;
    Sha256Interface& sha256;
    ContextProviderInterface& context_provider;
    ExecutionIdManagerInterface& execution_id_manager;
    DataCopyInterface& data_copy;
    KeccakF1600Interface& keccakf1600;
    GreaterThanInterface& greater_than;
    GetContractInstanceInterface& get_contract_instance_component;
    EmitUnencryptedLogInterface& emit_unencrypted_log_component;
    DebugLoggerInterface& debug_log_component;
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
