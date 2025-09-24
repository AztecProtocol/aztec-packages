#pragma once

#include <memory>
#include <span>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class MemoryInterface;
class BytecodeManagerInterface;
class InternalCallStackManagerInterface;
struct ContextEvent;

class ContextInterface {
  public:
    virtual ~ContextInterface() = default;

    // Machine state.
    virtual MemoryInterface& get_memory() = 0;
    virtual BytecodeManagerInterface& get_bytecode_manager() = 0;
    virtual InternalCallStackManagerInterface& get_internal_call_stack_manager() = 0;
    virtual uint32_t get_pc() const = 0;
    virtual void set_pc(uint32_t new_pc) = 0;
    virtual uint32_t get_next_pc() const = 0;
    virtual void set_next_pc(uint32_t new_next_pc) = 0;
    virtual bool halted() const = 0;
    virtual void halt() = 0;
    virtual uint32_t get_context_id() const = 0;
    virtual uint32_t get_parent_id() const = 0;
    virtual uint32_t get_last_child_id() const = 0;
    virtual bool has_parent() const = 0;

    // Environment.
    virtual const AztecAddress& get_address() const = 0;
    virtual const AztecAddress& get_msg_sender() const = 0;
    virtual const FF& get_transaction_fee() const = 0;
    virtual bool get_is_static() const = 0;
    virtual SideEffectStates& get_side_effect_states() = 0;
    virtual AppendOnlyTreeSnapshot get_written_public_data_slots_tree_snapshot() = 0;
    virtual void set_side_effect_states(SideEffectStates side_effect_states) = 0;
    virtual const GlobalVariables& get_globals() const = 0;

    virtual TransactionPhase get_phase() const = 0;

    virtual std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t cd_size) const = 0;
    virtual std::vector<FF> get_returndata(uint32_t rd_addr, uint32_t rd_size) = 0;
    virtual ContextInterface& get_child_context() = 0;
    // The child context needs to be accessible by this context in order to access the child
    // memory for returndata. We own it so that it's lifetime is as long as decided by this context
    // (i.e. if it is replaced by another child OR this parent context falls out of scope)
    virtual void set_child_context(std::unique_ptr<ContextInterface> child_ctx) = 0;

    virtual MemoryAddress get_parent_cd_addr() const = 0;
    virtual uint32_t get_parent_cd_size() const = 0;

    virtual MemoryAddress get_last_rd_addr() const = 0;
    virtual void set_last_rd_addr(MemoryAddress rd_addr) = 0;

    virtual uint32_t get_last_rd_size() const = 0;
    virtual void set_last_rd_size(MemoryAddress rd_size) = 0;

    virtual bool get_last_success() const = 0;
    virtual void set_last_success(bool success) = 0;

    virtual Gas get_gas_used() const = 0;
    virtual Gas get_gas_limit() const = 0;
    virtual void set_gas_used(Gas gas_used) = 0;

    virtual Gas get_parent_gas_used() const = 0;
    virtual Gas get_parent_gas_limit() const = 0;

    virtual Gas gas_left() const = 0;

    virtual uint32_t get_checkpoint_id_at_creation() const = 0;

    // Events
    virtual ContextEvent serialize_context_event() = 0;
};

} // namespace bb::avm2::simulation
