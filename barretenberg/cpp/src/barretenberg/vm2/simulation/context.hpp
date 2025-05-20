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
    virtual bool halted() const = 0;
    virtual void halt() = 0;
    virtual uint32_t get_context_id() const = 0;
    virtual uint32_t get_parent_id() const = 0;

    // Environment.
    virtual const AztecAddress& get_address() const = 0;
    virtual const AztecAddress& get_msg_sender() const = 0;
    virtual bool get_is_static() const = 0;

    // Input / Output
    virtual std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t cd_size) const = 0;
    virtual std::vector<FF> get_returndata(uint32_t rd_offset, uint32_t rd_size) = 0;
    virtual ContextInterface& get_child_context() = 0;
    // The child context needs to be accessible by this context in order to access the child
    // memory for returndata. We own it so that it's lifetime is as long as decided by this context
    // (i.e. if it is replaced by another child OR this parent context falls out of scope)
    virtual void set_child_context(std::unique_ptr<ContextInterface> child_ctx) = 0;

    virtual MemoryAddress get_last_rd_offset() const = 0;
    virtual void set_last_rd_offset(MemoryAddress rd_offset) = 0;

    virtual MemoryAddress get_last_rd_size() const = 0;
    virtual void set_last_rd_size(MemoryAddress rd_size) = 0;

    virtual bool get_last_success() const = 0;
    virtual void set_last_success(bool success) = 0;

    // Events
    virtual ContextEvent serialize_context_event() = 0;
};

// The context for a single nested call.
class BaseContext : public ContextInterface {
  public:
    BaseContext(uint32_t context_id,
                AztecAddress address,
                AztecAddress msg_sender,
                bool is_static,
                std::unique_ptr<BytecodeManagerInterface> bytecode,
                std::unique_ptr<MemoryInterface> memory)
        : address(address)
        , msg_sender(msg_sender)
        , is_static(is_static)
        , context_id(context_id)
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
    bool halted() const override { return has_halted; }
    void halt() override { has_halted = true; }

    uint32_t get_context_id() const override { return context_id; }

    // Environment.
    const AztecAddress& get_address() const override { return address; }
    const AztecAddress& get_msg_sender() const override { return msg_sender; }
    bool get_is_static() const override { return is_static; }

    ContextInterface& get_child_context() override { return *child_context; }
    void set_child_context(std::unique_ptr<ContextInterface> child_ctx) override
    {
        child_context = std::move(child_ctx);
    }

    MemoryAddress get_last_rd_offset() const override { return last_child_rd_offset; }
    void set_last_rd_offset(MemoryAddress rd_offset) override { last_child_rd_offset = rd_offset; }

    MemoryAddress get_last_rd_size() const override { return last_child_rd_size; }
    void set_last_rd_size(MemoryAddress rd_size) override { last_child_rd_size = rd_size; }

    bool get_last_success() const override { return last_child_success; }
    void set_last_success(bool success) override { last_child_success = success; }

    // Input / Output
    std::vector<FF> get_returndata(uint32_t rd_offset, uint32_t rd_size) override
    {
        MemoryInterface& child_memory = get_child_context().get_memory();
        uint32_t write_size = std::min(rd_offset + rd_size, last_child_rd_size);

        std::vector<FF> retrieved_returndata;
        retrieved_returndata.reserve(write_size);
        for (uint32_t i = 0; i < write_size; i++) {
            retrieved_returndata.push_back(child_memory.get(get_last_rd_offset() + i));
        }
        retrieved_returndata.resize(rd_size);

        return retrieved_returndata;
    };

  private:
    // Environment.
    AztecAddress address;
    AztecAddress msg_sender;
    bool is_static;

    uint32_t context_id;

    // Machine state.
    uint32_t pc = 0;
    uint32_t next_pc = 0;
    bool has_halted = false;
    std::unique_ptr<BytecodeManagerInterface> bytecode;
    std::unique_ptr<MemoryInterface> memory;

    // Output
    std::unique_ptr<ContextInterface> child_context = nullptr;
    MemoryAddress last_child_rd_offset = 0;
    MemoryAddress last_child_rd_size = 0;
    bool last_child_success = false;
};

// TODO(ilyas): flesh these out in the cpp file, these are just temporary
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

    uint32_t get_parent_id() const override { return 0; } // No parent context for the top-level context.
    // Event Emitting
    ContextEvent serialize_context_event() override
    {
        return {
            .id = get_context_id(),
            .parent_id = 0,
            .pc = get_pc(),
            .next_pc = get_next_pc(),
            .msg_sender = get_msg_sender(),
            .contract_addr = get_address(),
            .is_static = get_is_static(),
            .parent_cd_addr = 0,
            .parent_cd_size_addr = 0,
            .last_child_rd_addr = get_last_rd_offset(),
            .last_child_rd_size_addr = get_last_rd_size(),
            .last_child_success = get_last_success(),
        };
    };

    // Input / Output
    std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t cd_size) const override
    {
        // TODO(ilyas): Do we assert to assert cd_size < calldata.size(), otherwise it could trigger a massive write of
        // zeroes. OTOH: this should be caught by an OUT_OF_GAS exception
        std::vector<FF> padded_calldata(cd_size, 0); // Vector of size cd_size filled with zeroes;

        // We first take a slice of the data, the most we can slice is the actual size of the data
        size_t slice_size = std::min(static_cast<size_t>(cd_offset + cd_size), calldata.size());

        for (size_t i = cd_offset; i < slice_size; i++) {
            padded_calldata[i] = calldata[i];
        }
        return padded_calldata;
    };

  private:
    std::vector<FF> calldata;
};

// Parameters for a nested call need to be changed
class NestedContext : public BaseContext {
  public:
    NestedContext(uint32_t context_id,
                  AztecAddress address,
                  AztecAddress msg_sender,
                  bool is_static,
                  std::unique_ptr<BytecodeManagerInterface> bytecode,
                  std::unique_ptr<MemoryInterface> memory,
                  ContextInterface& parent_context,
                  MemoryAddress cd_offset_address, /* This is a direct mem address */
                  MemoryAddress cd_size_address    /* This is a direct mem address */
                  )
        : BaseContext(context_id, address, msg_sender, is_static, std::move(bytecode), std::move(memory))
        , parent_cd_offset(cd_offset_address)
        , parent_cd_size(cd_size_address)
        , parent_context(parent_context)
    {}

    uint32_t get_parent_id() const override { return parent_context.get_context_id(); }

    // Event Emitting
    ContextEvent serialize_context_event() override
    {
        return {
            .id = get_context_id(),
            .parent_id = get_parent_id(),
            .pc = get_pc(),
            .next_pc = get_next_pc(),
            .msg_sender = get_msg_sender(),
            .contract_addr = get_address(),
            .is_static = get_is_static(),
            .parent_cd_addr = parent_cd_offset,
            .parent_cd_size_addr = parent_cd_size,
            .last_child_rd_addr = get_last_rd_offset(),
            .last_child_rd_size_addr = get_last_rd_size(),
            .last_child_success = get_last_success(),
        };
    };

    // Input / Output
    std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t cd_size) const override
    {
        auto get_calldata_size = parent_context.get_memory().get(parent_cd_size);
        // TODO(ilyas): error if tag != U32
        auto calldata_size = get_calldata_size.as<uint32_t>();
        uint32_t read_size = std::min(cd_offset + cd_size, calldata_size);

        std::vector<FF> retrieved_calldata;
        retrieved_calldata.reserve(read_size);
        for (uint32_t i = 0; i < read_size; i++) {
            retrieved_calldata.push_back(parent_context.get_memory().get(parent_cd_offset + i));
        }

        // Pad the calldata
        retrieved_calldata.resize(cd_size, 0);
        return retrieved_calldata;
    };

  private:
    // These are direct addresses to look up into the parent context during calldata copying
    MemoryAddress parent_cd_offset;
    MemoryAddress parent_cd_size;

    ContextInterface& parent_context;
};

} // namespace bb::avm2::simulation
