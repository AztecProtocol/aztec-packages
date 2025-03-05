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
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
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
    virtual uint32_t get_context_id() = 0;
    virtual uint32_t get_parent_id() = 0;
    virtual bool is_halted() = 0;
    virtual void halt() = 0;

    // Environment.
    virtual const AztecAddress& get_address() const = 0;
    virtual const AztecAddress& get_msg_sender() const = 0;
    virtual bool get_is_static() const = 0;

    // Input / Output
    // Getters
    virtual std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t size) = 0;
    virtual std::vector<FF> get_returndata(uint32_t rd_offset, uint32_t size) = 0;
    virtual std::pair<uint32_t, uint32_t> get_calldata_info() = 0;
    virtual std::pair<uint32_t, uint32_t> get_returndata_info() = 0;
    virtual bool get_nested_ctx_success() = 0;
    // Setters
    virtual void set_nested_ctx_success(bool success) = 0;

    // Event emitting
    virtual void emit_ctx_stack_event() = 0;
    // This is used if we want to emit the event (reserving it's correct place in the event queue)
    // but we want to come back and update it later.
    virtual void reserve_context_event() = 0;
    virtual ContextEvent* get_last_context_event() = 0;
    virtual void emit_current_context() = 0;

    // Child/Parent access
    virtual void absorb_child_context(std::unique_ptr<ContextInterface> child) = 0;
};

class BaseContext : public ContextInterface {
  public:
    BaseContext(uint32_t context_id,
                AztecAddress address,
                AztecAddress msg_sender,
                bool is_static,
                std::unique_ptr<BytecodeManagerInterface> bytecode,
                std::unique_ptr<MemoryInterface> memory,
                StableEventEmitterInterface<ContextEvent>& events,
                EventEmitterInterface<ContextStackEvent>& ctx_stack_events)
        : context_id(context_id)
        , address(address)
        , msg_sender(msg_sender)
        , is_static(is_static)
        , bytecode(std::move(bytecode))
        , memory(std::move(memory))
        , events(events)
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
    uint32_t get_context_id() override { return context_id; }
    bool is_halted() override { return halt_execution; }
    void halt() override { halt_execution = true; }

    // Environment Getters
    const AztecAddress& get_address() const override { return address; }
    const AztecAddress& get_msg_sender() const override { return msg_sender; }
    bool get_is_static() const override { return is_static; }
    bool get_nested_ctx_success() override { return false; }
    void set_nested_ctx_success(bool success) override { nested_ctx_success = success; }

    // Event emitting
    void emit_ctx_stack_event() override;
    void reserve_context_event() override;
    ContextEvent* get_last_context_event() override { return last_context_event; }
    void emit_current_context() override;

    void absorb_child_context(std::unique_ptr<ContextInterface> child) override { child_context = std::move(child); }

    // Child TODO: MOve to private
    std::unique_ptr<ContextInterface> child_context;

  private:
    // New stuff
    uint32_t context_id;
    uint32_t pc = 0;
    uint32_t next_pc = 0;

    // Environment.
    AztecAddress address;
    AztecAddress msg_sender;
    bool is_static;

    // Machine state.
    std::unique_ptr<BytecodeManagerInterface> bytecode;
    std::unique_ptr<MemoryInterface> memory;
    bool halt_execution = false;

    // Event
    ContextEvent serialize_context();
    ContextStackEvent snapshot_context();
    StableEventEmitterInterface<ContextEvent>& events;
    EventEmitterInterface<ContextStackEvent>& ctx_stack_events;
    ContextEvent* last_context_event = nullptr;

    // Success
    bool nested_ctx_success = false;
};

class EnqueuedCallContext : public BaseContext {
  public:
    EnqueuedCallContext(uint32_t context_id,
                        AztecAddress address,
                        AztecAddress msg_sender,
                        bool is_static,
                        std::unique_ptr<BytecodeManagerInterface> bytecode,
                        std::unique_ptr<MemoryInterface> memory,
                        std::span<const FF> calldata,
                        StableEventEmitterInterface<ContextEvent>& events,
                        EventEmitterInterface<ContextStackEvent>& ctx_stack_events)
        : BaseContext(context_id,
                      address,
                      msg_sender,
                      is_static,
                      std::move(bytecode),
                      std::move(memory),
                      events,
                      ctx_stack_events)
        , calldata(calldata.begin(), calldata.end())
    {}

    // Parent Id is always 0 for top level call
    uint32_t get_parent_id() override { return 0; }

    // Input / Output
    // Getters
    std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t size) override;
    std::vector<FF> get_returndata(uint32_t rd_offset, uint32_t size) override;
    std::pair<uint32_t, uint32_t> get_calldata_info() override;
    std::pair<uint32_t, uint32_t> get_returndata_info() override;

  private:
    // Environment.
    std::vector<FF> calldata;
    std::vector<FF> top_level_returndata;
};

class NestedContext : public BaseContext {
  public:
    NestedContext(uint32_t context_id,
                  AztecAddress address,
                  AztecAddress msg_sender,
                  bool is_static,
                  std::unique_ptr<BytecodeManagerInterface> bytecode,
                  std::unique_ptr<MemoryInterface> memory,
                  uint32_t calldata_offset,
                  uint32_t calldata_size_offset,
                  ContextInterface& parent_context,
                  StableEventEmitterInterface<ContextEvent>& events,
                  EventEmitterInterface<ContextStackEvent>& ctx_stack_events)
        : BaseContext(context_id,
                      address,
                      msg_sender,
                      is_static,
                      std::move(bytecode),
                      std::move(memory),
                      events,
                      ctx_stack_events)
        , calldata_offset(calldata_offset)
        , calldata_size_offset(calldata_size_offset)
        , parent_context(parent_context)
    {}

    uint32_t get_parent_id() override { return parent_context.get_context_id(); }

    // Input / Output
    std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t size) override;
    std::vector<FF> get_returndata(uint32_t rd_offset, uint32_t size) override;
    std::pair<uint32_t, uint32_t> get_calldata_info() override;
    std::pair<uint32_t, uint32_t> get_returndata_info() override;

  private:
    uint32_t calldata_offset;
    uint32_t calldata_size_offset;
    uint32_t returndata_offset = 0;
    uint32_t returndata_size = 0;

    ContextInterface& parent_context;
};

class ContextProviderInterface {
  public:
    virtual ~ContextProviderInterface() = default;
    virtual std::unique_ptr<ContextInterface> make_enqueued_call_ctx(AztecAddress address,
                                                                     AztecAddress msg_sender,
                                                                     std::span<const FF> calldata,
                                                                     bool is_static) = 0;
    virtual std::unique_ptr<ContextInterface> make_nested_ctx(ContextInterface& parent,
                                                              AztecAddress address,
                                                              AztecAddress msg_sender,
                                                              uint32_t calldata_offset,
                                                              uint32_t calldata_size,
                                                              bool is_static) = 0;
};

// This is the real thing. If you need a context made out of other objects, use a mock.
class ContextProvider : public ContextProviderInterface {
  public:
    ContextProvider(TxBytecodeManagerInterface& tx_bytecode_manager,
                    EventEmitterInterface<MemoryEvent>& memory_events,
                    StableEventEmitterInterface<ContextEvent>& context_events,
                    EventEmitterInterface<ContextStackEvent>& ctx_stack_events)
        : tx_bytecode_manager(tx_bytecode_manager)
        , memory_events(memory_events)
        , context_events(context_events)
        , ctx_stack_events(ctx_stack_events)
    {}
    std::unique_ptr<ContextInterface> make_enqueued_call_ctx(AztecAddress address,
                                                             AztecAddress msg_sender,
                                                             std::span<const FF> calldata,
                                                             bool is_static) override;
    std::unique_ptr<ContextInterface> make_nested_ctx(ContextInterface& parent,
                                                      AztecAddress address,
                                                      AztecAddress msg_sender,
                                                      uint32_t calldata_offset,
                                                      uint32_t calldata_size,
                                                      bool is_static) override;

  private:
    // TODO: Check if starting from context id 0 is *safe*, since it is also considered default
    uint32_t next_available_context_id = 0;
    TxBytecodeManagerInterface& tx_bytecode_manager;
    EventEmitterInterface<MemoryEvent>& memory_events;
    StableEventEmitterInterface<ContextEvent>& context_events;
    EventEmitterInterface<ContextStackEvent>& ctx_stack_events;
};

} // namespace bb::avm2::simulation
