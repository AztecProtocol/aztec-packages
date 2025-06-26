#pragma once

#include <algorithm>
#include <cstdint>
#include <memory>
#include <span>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/internal_call_stack_manager.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

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
    virtual bool has_parent() const = 0;

    // Environment.
    virtual const AztecAddress& get_address() const = 0;
    virtual const AztecAddress& get_msg_sender() const = 0;
    virtual const FF& get_transaction_fee() const = 0;
    virtual bool get_is_static() const = 0;
    virtual const GlobalVariables& get_globals() const = 0;

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

    // Events
    virtual ContextEvent serialize_context_event() = 0;
};

// The context for a single nested call.
class BaseContext : public ContextInterface {
  public:
    BaseContext(uint32_t context_id,
                AztecAddress address,
                AztecAddress msg_sender,
                FF transaction_fee,
                bool is_static,
                Gas gas_limit,
                Gas gas_used,
                GlobalVariables globals,
                std::unique_ptr<BytecodeManagerInterface> bytecode,
                std::unique_ptr<MemoryInterface> memory,
                std::unique_ptr<InternalCallStackManagerInterface> internal_call_stack_manager)
        : address(address)
        , msg_sender(msg_sender)
        , transaction_fee(transaction_fee)
        , is_static(is_static)
        , globals(globals)
        , context_id(context_id)
        , gas_used(gas_used)
        , gas_limit(gas_limit)
        , bytecode(std::move(bytecode))
        , memory(std::move(memory))
        , internal_call_stack_manager(std::move(internal_call_stack_manager))
    {}

    // Having getters and setters make it easier to mock the context.
    // Machine state.
    MemoryInterface& get_memory() override { return *memory; }
    BytecodeManagerInterface& get_bytecode_manager() override { return *bytecode; }
    InternalCallStackManagerInterface& get_internal_call_stack_manager() override
    {
        return *internal_call_stack_manager;
    }

    uint32_t get_pc() const override { return pc; }
    void set_pc(uint32_t new_pc) override { pc = new_pc; }
    uint32_t get_next_pc() const override { return next_pc; }
    void set_next_pc(uint32_t new_next_pc) override { next_pc = new_next_pc; }
    bool halted() const override { return has_halted; }
    void halt() override { has_halted = true; }

    uint32_t get_context_id() const override { return context_id; }

    // Environment.
    const AztecAddress& get_address() const override { return address; }
    const AztecAddress& get_msg_sender() const override { return msg_sender; }
    const FF& get_transaction_fee() const override { return transaction_fee; }
    bool get_is_static() const override { return is_static; }
    const GlobalVariables& get_globals() const override { return globals; }

    ContextInterface& get_child_context() override { return *child_context; }
    void set_child_context(std::unique_ptr<ContextInterface> child_ctx) override
    {
        child_context = std::move(child_ctx);
    }

    MemoryAddress get_last_rd_addr() const override { return last_child_rd_addr; }
    void set_last_rd_addr(MemoryAddress rd_addr) override { last_child_rd_addr = rd_addr; }

    uint32_t get_last_rd_size() const override { return last_child_rd_size; }
    void set_last_rd_size(MemoryAddress rd_size) override { last_child_rd_size = rd_size; }

    bool get_last_success() const override { return last_child_success; }
    void set_last_success(bool success) override { last_child_success = success; }

    Gas get_gas_used() const override { return gas_used; }
    Gas get_gas_limit() const override { return gas_limit; }

    Gas gas_left() const override { return gas_limit - gas_used; }

    void set_gas_used(Gas gas_used) override { this->gas_used = gas_used; }

    // Input / Output
    std::vector<FF> get_returndata(uint32_t rd_offset_addr, uint32_t rd_copy_size) override;

  private:
    // Environment.
    AztecAddress address;
    AztecAddress msg_sender;
    FF transaction_fee;
    bool is_static;
    GlobalVariables globals;

    uint32_t context_id;

    // Machine state.
    uint32_t pc = 0;
    uint32_t next_pc = 0;
    bool has_halted = false;
    Gas gas_used;
    Gas gas_limit;
    std::unique_ptr<BytecodeManagerInterface> bytecode;
    std::unique_ptr<MemoryInterface> memory;
    std::unique_ptr<InternalCallStackManagerInterface> internal_call_stack_manager;

    // Output
    std::unique_ptr<ContextInterface> child_context = nullptr;
    MemoryAddress last_child_rd_addr = 0;
    MemoryAddress last_child_rd_size = 0;
    bool last_child_success = false;
};

// TODO(ilyas): move to cpp file
class EnqueuedCallContext : public BaseContext {
  public:
    EnqueuedCallContext(uint32_t context_id,
                        AztecAddress address,
                        AztecAddress msg_sender,
                        FF transaction_fee,
                        bool is_static,
                        Gas gas_limit,
                        Gas gas_used,
                        GlobalVariables globals,
                        std::unique_ptr<BytecodeManagerInterface> bytecode,
                        std::unique_ptr<MemoryInterface> memory,
                        std::unique_ptr<InternalCallStackManagerInterface> internal_call_stack_manager,
                        std::span<const FF> calldata)
        : BaseContext(context_id,
                      address,
                      msg_sender,
                      transaction_fee,
                      is_static,
                      gas_limit,
                      gas_used,
                      globals,
                      std::move(bytecode),
                      std::move(memory),
                      std::move(internal_call_stack_manager))
        , calldata(calldata.begin(), calldata.end())
    {}

    uint32_t get_parent_id() const override { return 0; } // No parent context for the top-level context.
    bool has_parent() const override { return false; }
    // Event Emitting
    ContextEvent serialize_context_event() override;

    // Input / Output
    std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t cd_copy_size) const override;

    Gas get_parent_gas_used() const override { return Gas{}; }
    Gas get_parent_gas_limit() const override { return Gas{}; }

    MemoryAddress get_parent_cd_addr() const override { return 0; }
    uint32_t get_parent_cd_size() const override { return static_cast<uint32_t>(calldata.size()); }

  private:
    std::vector<FF> calldata;
};

// Parameters for a nested call need to be changed
class NestedContext : public BaseContext {
  public:
    NestedContext(uint32_t context_id,
                  AztecAddress address,
                  AztecAddress msg_sender,
                  FF transaction_fee,
                  bool is_static,
                  Gas gas_limit,
                  GlobalVariables globals,
                  std::unique_ptr<BytecodeManagerInterface> bytecode,
                  std::unique_ptr<MemoryInterface> memory,
                  std::unique_ptr<InternalCallStackManagerInterface> internal_call_stack_manager,
                  ContextInterface& parent_context,
                  MemoryAddress cd_offset_address, /* This is a direct mem address */
                  MemoryAddress cd_size)
        : BaseContext(context_id,
                      address,
                      msg_sender,
                      transaction_fee,
                      is_static,
                      gas_limit,
                      Gas{ 0, 0 },
                      globals,
                      std::move(bytecode),
                      std::move(memory),
                      std::move(internal_call_stack_manager))
        , parent_cd_addr(cd_offset_address)
        , parent_cd_size(cd_size)
        , parent_context(parent_context)
    {}

    uint32_t get_parent_id() const override { return parent_context.get_context_id(); }
    bool has_parent() const override { return false; }

    Gas get_parent_gas_used() const override { return parent_context.get_gas_used(); }
    Gas get_parent_gas_limit() const override { return parent_context.get_gas_limit(); }

    // Event Emitting
    ContextEvent serialize_context_event() override;

    // Input / Output
    std::vector<FF> get_calldata(uint32_t cd_offset_addr, uint32_t cd_copy_size) const override;

    MemoryAddress get_parent_cd_addr() const override { return parent_cd_addr; }
    uint32_t get_parent_cd_size() const override { return parent_cd_size; }

  private:
    // These are direct addresses to look up into the parent context during calldata copying
    MemoryAddress parent_cd_addr;
    MemoryAddress parent_cd_size;

    ContextInterface& parent_context;
};

} // namespace bb::avm2::simulation
