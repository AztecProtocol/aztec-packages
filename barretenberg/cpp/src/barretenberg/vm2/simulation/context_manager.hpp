#pragma once

#include <memory>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

class ContextProviderInterface {
  public:
    virtual ~ContextProviderInterface() = default;

    // TODO: Update this, these params are temporary
    virtual std::unique_ptr<ContextInterface> make_nested_context(AztecAddress address,
                                                                  AztecAddress msg_sender,
                                                                  ContextInterface& parent_context,
                                                                  MemoryAddress cd_offset_addr,
                                                                  MemoryAddress cd_size_addr,
                                                                  bool is_static) = 0;

    virtual std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                                    AztecAddress msg_sender,
                                                                    std::span<const FF> calldata,
                                                                    bool is_static) = 0;

    // This can be removed if we use clk for the context id
    virtual uint32_t get_next_context_id() = 0;
};

class ContextProvider : public ContextProviderInterface {
  public:
    ContextProvider(TxBytecodeManagerInterface& tx_bytecode_manager,
                    RangeCheckInterface& range_check,
                    EventEmitterInterface<MemoryEvent>& memory_events)
        : tx_bytecode_manager(tx_bytecode_manager)
        , range_check(range_check)
        , memory_events(memory_events)
    {}
    std::unique_ptr<ContextInterface> make_nested_context(AztecAddress address,
                                                          AztecAddress msg_sender,
                                                          ContextInterface& parent_context,
                                                          uint32_t cd_offset_addr,
                                                          uint32_t cd_size_addr,
                                                          bool is_static) override;
    std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                            AztecAddress msg_sender,
                                                            std::span<const FF> calldata,
                                                            bool is_static) override;

    uint32_t get_next_context_id() override { return next_context_id; }

  private:
    uint32_t next_context_id = 1; // 0 is reserved to denote the parent of a top level context

    TxBytecodeManagerInterface& tx_bytecode_manager;
    RangeCheckInterface& range_check;
    EventEmitterInterface<MemoryEvent>& memory_events;
};

} // namespace bb::avm2::simulation
