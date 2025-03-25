#pragma once

#include <algorithm>
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
    virtual bool get_is_static() const = 0;

    // Input / Output
    virtual std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t cd_size) const = 0;
    virtual std::vector<FF> get_returndata(uint32_t rd_offset, uint32_t rd_size) const = 0;

    // Events
    virtual ContextEvent get_current_context() = 0;
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
    void set_nested_returndata(std::vector<FF> return_data) override { nested_returndata = std::move(return_data); }
    bool halted() const override { return has_halted; }
    void halt() override { has_halted = true; }

    uint32_t get_context_id() const override { return context_id; }

    // Environment.
    const AztecAddress& get_address() const override { return address; }
    const AztecAddress& get_msg_sender() const override { return msg_sender; }
    bool get_is_static() const override { return is_static; }

    // Event Emitting
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
    bool is_static;

    uint32_t context_id;

    // Machine state.
    uint32_t pc = 0;
    uint32_t next_pc = 0;
    bool has_halted = false;
    std::vector<FF> nested_returndata;
    std::unique_ptr<BytecodeManagerInterface> bytecode;
    std::unique_ptr<MemoryInterface> memory;
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

    // Input / Output
    std::vector<FF> get_calldata(uint32_t cd_offset, uint32_t cd_size) const override
    {
        // TODO(ilyas): Do we assert to assert cd_size < calldata.size(), otherwise it could trigger a massive write of
        // zeroes. OTOH: this should be caught by an OUT_OF_GAS exception

        // Creates vector of length cd_size filled with zeroes
        std::vector<FF> padded_calldata(cd_size, 0);
        // We first take a slice of the calldata, the most we can slice is the actual size of the calldata
        size_t slice_size = std::min(static_cast<size_t>(cd_offset + cd_size), calldata.size());

        for (size_t i = cd_offset; i < slice_size; i++) {
            padded_calldata[i] = calldata[i];
        }

        return padded_calldata;
    };

    std::vector<FF> get_returndata(uint32_t rd_offset, uint32_t rd_size) const override
    {
        std::vector<FF> padded_returndata(rd_size, 0);

        size_t slice_size = std::min(static_cast<size_t>(rd_offset + rd_size), returndata.size());

        for (size_t i = rd_offset; i < slice_size; i++) {
            padded_returndata[i] = returndata[i];
        }

        return padded_returndata;
    };

  private:
    std::vector<FF> calldata;
    std::vector<FF> returndata;
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
                  MemoryAddress cd_offset_address, /* This is a direct mem address */
                  MemoryAddress cd_size_address    /* This is a direct mem address */
                  )
        : BaseContext(context_id, address, msg_sender, is_static, std::move(bytecode), std::move(memory))
        , cd_offset_address(cd_offset_address)
        , cd_size_address(cd_size_address)
    {}

    // Input / Output
    std::vector<FF> get_calldata([[maybe_unused]] uint32_t cd_offset, [[maybe_unused]] uint32_t cd_size) const override
    {
        // Temporary implementation
        return {};
    };
    std::vector<FF> get_returndata([[maybe_unused]] uint32_t rd_offset,
                                   [[maybe_unused]] uint32_t rd_size) const override
    {
        return {};
    };

  private:
    // These are direct addresses to look up into the parent context during calldata copying
    [[maybe_unused]] MemoryAddress cd_offset_address;
    [[maybe_unused]] MemoryAddress cd_size_address;
};

} // namespace bb::avm2::simulation
