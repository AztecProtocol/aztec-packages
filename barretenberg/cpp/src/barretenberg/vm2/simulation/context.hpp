#pragma once

#include <cstdint>
#include <memory>
#include <span>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class ContextInterface {
  public:
    virtual ~ContextInterface() = default;

    // Machine state.
    virtual MemoryInterface& get_memory() = 0;
    virtual BytecodeManagerInterface& get_bytecode_manager() = 0;
    virtual uint32_t get_pc() const = 0;
    virtual void set_pc(uint32_t new_pc) = 0;
    virtual uint32_t get_next_pc() const = 0;
    virtual void set_next_pc(uint32_t new_next_pc) = 0;
    virtual void set_nested_returndata(std::vector<FF> return_data) = 0;
    virtual bool halted() const = 0;
    virtual void halt() = 0;

    virtual uint32_t get_context_id() const = 0;

    // Environment.
    virtual const AztecAddress& get_address() const = 0;
    virtual const AztecAddress& get_msg_sender() const = 0;
    virtual std::span<const FF> get_calldata() const = 0;
    virtual bool get_is_static() const = 0;

    // Events
    virtual void emit_context_snapshot() = 0;
    virtual ContextEvent get_current_context() = 0;
};

// The context for a single nested call.
class BaseContext : public ContextInterface {
  public:
    BaseContext(uint32_t context_id,
                AztecAddress address,
                AztecAddress msg_sender,
                std::span<const FF> calldata,
                bool is_static,
                std::unique_ptr<BytecodeManagerInterface> bytecode,
                std::unique_ptr<MemoryInterface> memory,
                EventEmitterInterface<ContextStackEvent>& ctx_stack_events)
        : address(address)
        , msg_sender(msg_sender)
        , calldata(calldata.begin(), calldata.end())
        , is_static(is_static)
        , context_id(context_id)
        , bytecode(std::move(bytecode))
        , memory(std::move(memory))
        , ctx_stack_events(ctx_stack_events)
    {}

    // Having getters and setters make it easier to mock the context.
    // Machine state.
    MemoryInterface& get_memory() override { return *memory; }
    BytecodeManagerInterface& get_bytecode_manager() override { return *bytecode; }
    uint32_t get_pc() const override { return pc; }
    void set_pc(uint32_t new_pc) override { pc = new_pc; }
    uint32_t get_next_pc() const override { return next_pc; }
    void set_next_pc(uint32_t new_next_pc) override { next_pc = new_next_pc; }
    void set_nested_returndata(std::vector<FF> return_data) override { nested_returndata = std::move(return_data); }
    bool halted() const override { return has_halted; }
    void halt() override { has_halted = true; }

    uint32_t get_context_id() const override { return context_id; }

    // Environment.
    const AztecAddress& get_address() const override { return address; }
    const AztecAddress& get_msg_sender() const override { return msg_sender; }
    std::span<const FF> get_calldata() const override { return calldata; }
    bool get_is_static() const override { return is_static; }

    // Event Emitting
    void emit_context_snapshot() override
    {
        ctx_stack_events.emit({ .id = context_id,
                                .next_pc = next_pc,
                                .msg_sender = msg_sender,
                                .contract_addr = address,
                                .is_static = is_static });
    };

    ContextEvent get_current_context() override
    {
        return {
            .id = context_id, .pc = pc, .msg_sender = msg_sender, .contract_addr = address, .is_static = is_static
        };
    };

  private:
    // Environment.
    AztecAddress address;
    AztecAddress msg_sender;
    std::vector<FF> calldata;
    bool is_static;

    uint32_t context_id;

    // Machine state.
    uint32_t pc = 0;
    uint32_t next_pc = 0;
    bool has_halted = false;
    std::vector<FF> nested_returndata;
    std::unique_ptr<BytecodeManagerInterface> bytecode;
    std::unique_ptr<MemoryInterface> memory;

    // Emiiters
    EventEmitterInterface<ContextStackEvent>& ctx_stack_events;
};

// TODO(ilyas): flesh these out in the cpp file, these are just temporary
class EnqueuedCallContext : public BaseContext {
  public:
    EnqueuedCallContext(uint32_t context_id,
                        AztecAddress address,
                        AztecAddress msg_sender,
                        std::span<const FF> calldata,
                        bool is_static,
                        std::unique_ptr<BytecodeManagerInterface> bytecode,
                        std::unique_ptr<MemoryInterface> memory,
                        EventEmitterInterface<ContextStackEvent>& ctx_stack_events)
        : BaseContext(context_id,
                      address,
                      msg_sender,
                      calldata,
                      is_static,
                      std::move(bytecode),
                      std::move(memory),
                      ctx_stack_events)
    {}
};

// Parameters for a nested call need to be changed
class NestedContext : public BaseContext {
  public:
    NestedContext(uint32_t context_id,
                  AztecAddress address,
                  AztecAddress msg_sender,
                  std::span<const FF> calldata,
                  bool is_static,
                  std::unique_ptr<BytecodeManagerInterface> bytecode,
                  std::unique_ptr<MemoryInterface> memory,
                  EventEmitterInterface<ContextStackEvent>& ctx_stack_events)
        : BaseContext(context_id,
                      address,
                      msg_sender,
                      calldata,
                      is_static,
                      std::move(bytecode),
                      std::move(memory),
                      ctx_stack_events)
    {}
};

} // namespace bb::avm2::simulation
