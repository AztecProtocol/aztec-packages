#pragma once

#include <cstdint>
#include <memory>
#include <span>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/bytecode_manager.hpp"
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
    virtual uint32_t get_context_id() = 0;

    // Environment.
    virtual const AztecAddress& get_address() const = 0;
    virtual const AztecAddress& get_msg_sender() const = 0;
    virtual bool get_is_static() const = 0;

    // Input / Output
    virtual std::span<const FF> get_calldata(uint32_t cd_offset, uint32_t size) = 0;
    virtual std::span<const FF> get_returndata(uint32_t rd_offset, uint32_t size) = 0;
    virtual void set_returndata_info(uint32_t offset, uint32_t size) = 0;

    // Temp
    virtual bool is_halted() = 0;
    virtual void halt() = 0;
};

class BaseContext : public ContextInterface {
  public:
    BaseContext(uint32_t context_id,
                AztecAddress address,
                AztecAddress msg_sender,
                bool is_static,
                std::unique_ptr<BytecodeManagerInterface> bytecode,
                std::unique_ptr<MemoryInterface> memory)
        : context_id(context_id)
        , address(address)
        , msg_sender(msg_sender)
        , is_static(is_static)
        , bytecode(std::move(bytecode))
        , memory(std::move(memory))
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

    // Environment Getters
    const AztecAddress& get_address() const override { return address; }
    const AztecAddress& get_msg_sender() const override { return msg_sender; }
    bool get_is_static() const override { return is_static; }

    // Temp
    bool is_halted() override { return halt_execution; }
    void halt() override { halt_execution = true; }

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

    // Temp
    bool halt_execution = false;
};

class EnqueuedCallContext : public BaseContext {
  public:
    EnqueuedCallContext(uint32_t context_id,
                        AztecAddress address,
                        AztecAddress msg_sender,
                        bool is_static,
                        std::unique_ptr<BytecodeManagerInterface> bytecode,
                        std::unique_ptr<MemoryInterface> memory,
                        std::span<const FF> calldata)
        : BaseContext(context_id, address, msg_sender, is_static, std::move(bytecode), std::move(memory))
        , calldata(calldata.begin(), calldata.end())
    {}

    // Input / Output
    std::span<const FF> get_calldata(uint32_t cd_offset, uint32_t size) override
    {
        return { calldata.begin() + cd_offset, calldata.begin() + cd_offset + size };
    }
    std::span<const FF> get_returndata(uint32_t rd_offset, uint32_t size) override
    {
        return { top_level_returndata.begin() + rd_offset, top_level_returndata.begin() + rd_offset + size };
    }
    void set_returndata_info([[maybe_unused]] uint32_t offset, [[maybe_unused]] uint32_t size) override {}

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
                  uint32_t calldata_size_offset)
        : BaseContext(context_id, address, msg_sender, is_static, std::move(bytecode), std::move(memory))
        , calldata_offset(calldata_offset)
        , calldata_size_offset(calldata_size_offset)
    // , parent_memory(parent_memory)
    {}

    // Input / Output
    // this should be against parent memory
    std::span<const FF> get_calldata(uint32_t cd_offset, uint32_t size) override
    {
        // This is the max size of the calldata that can be read.
        auto calldata_size = static_cast<uint32_t>(get_memory().get(calldata_size_offset).value);
        // What happens if cd_offset > calldata_size
        // We only read what we need (or can)
        auto read_size = std::min(size, calldata_size - cd_offset);
        return get_memory().get_slice(calldata_offset + cd_offset, read_size).first;
    }
    // This should be against the child memory
    std::span<const FF> get_returndata(uint32_t rd_offset, uint32_t size) override
    {
        return get_memory().get_slice(returndata_offset + rd_offset, returndata_size + size).first;
    }
    void set_returndata_info(uint32_t offset, uint32_t size) override
    {
        returndata_offset = offset;
        returndata_size = size;
    }

  private:
    uint32_t calldata_offset;
    uint32_t calldata_size_offset;
    uint32_t returndata_offset = 0;
    uint32_t returndata_size = 0;

    // Memory Info - surely i dont need the entire context....just the memory
    // There must be a better way to do this
    // MemoryInterface& parent_memory;
};

class ContextProviderInterface {
  public:
    virtual ~ContextProviderInterface() = default;
    virtual std::unique_ptr<ContextInterface> make_enqueued_call_ctx(AztecAddress address,
                                                                     AztecAddress msg_sender,
                                                                     std::span<const FF> calldata,
                                                                     bool is_static) = 0;
    virtual std::unique_ptr<ContextInterface> make_nested_ctx(AztecAddress address,
                                                              AztecAddress msg_sender,
                                                              uint32_t calldata_offset,
                                                              uint32_t calldata_size,
                                                              bool is_static) = 0;
};

// This is the real thing. If you need a context made out of other objects, use a mock.
class ContextProvider : public ContextProviderInterface {
  public:
    ContextProvider(TxBytecodeManagerInterface& tx_bytecode_manager, EventEmitterInterface<MemoryEvent>& memory_events)
        : tx_bytecode_manager(tx_bytecode_manager)
        , memory_events(memory_events)
    {}
    std::unique_ptr<ContextInterface> make_enqueued_call_ctx(AztecAddress address,
                                                             AztecAddress msg_sender,
                                                             std::span<const FF> calldata,
                                                             bool is_static) override
    {
        // FIXME: doing too much in a "constructor"!
        BytecodeId bytecode_id = tx_bytecode_manager.get_bytecode(address);

        // We can call this in the unique ptr constructor once we take context_id if we take it out of the memory
        // constructor
        uint32_t context_id = next_available_context_id++;

        return std::make_unique<EnqueuedCallContext>(
            context_id,
            address,
            msg_sender,
            is_static,
            std::make_unique<BytecodeManager>(bytecode_id, tx_bytecode_manager),
            std::make_unique<Memory>(context_id, memory_events),
            calldata);
    }

    std::unique_ptr<ContextInterface> make_nested_ctx(AztecAddress address,
                                                      AztecAddress msg_sender,
                                                      uint32_t calldata_offset,
                                                      uint32_t calldata_size,
                                                      bool is_static) override
    {
        // FIXME: doing too much in a "constructor"!
        BytecodeId bytecode_id = tx_bytecode_manager.get_bytecode(address);

        uint32_t context_id = next_available_context_id++;

        return std::make_unique<NestedContext>(context_id,
                                               address,
                                               msg_sender,
                                               is_static,
                                               std::make_unique<BytecodeManager>(bytecode_id, tx_bytecode_manager),
                                               std::make_unique<Memory>(context_id, memory_events),
                                               calldata_offset,
                                               calldata_size);
    }

  private:
    // TODO: Check if starting from context id 0 is *safe*, since it is also considered default
    uint32_t next_available_context_id = 0;
    TxBytecodeManagerInterface& tx_bytecode_manager;
    EventEmitterInterface<MemoryEvent>& memory_events;
};

} // namespace bb::avm2::simulation
