#pragma once

#include <memory>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/internal_call_stack_manager.hpp"

namespace bb::avm2::simulation {

class ContextProviderInterface {
  public:
    virtual ~ContextProviderInterface() = default;

    virtual std::unique_ptr<ContextInterface> make_nested_context(AztecAddress address,
                                                                  AztecAddress msg_sender,
                                                                  FF transaction_fee,
                                                                  ContextInterface& parent_context,
                                                                  MemoryAddress cd_offset_addr,
                                                                  MemoryAddress cd_size_addr,
                                                                  bool is_static,
                                                                  Gas gas_limit) = 0;

    virtual std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                                    AztecAddress msg_sender,
                                                                    FF transaction_fee,
                                                                    std::span<const FF> calldata,
                                                                    bool is_static,
                                                                    Gas gas_limit,
                                                                    Gas gas_used) = 0;

    // This can be removed if we use clk for the context id
    virtual uint32_t get_next_context_id() const = 0;
};

class ContextProvider : public ContextProviderInterface {
  public:
    ContextProvider(TxBytecodeManagerInterface& tx_bytecode_manager,
                    MemoryProviderInterface& memory_provider,
                    CalldataHashingProviderInterface& cd_hash_provider,
                    InternalCallStackManagerProviderInterface& internal_call_stack_manager_provider,
                    const GlobalVariables& global_variables)
        : tx_bytecode_manager(tx_bytecode_manager)
        , memory_provider(memory_provider)
        , cd_hash_provider(cd_hash_provider)
        , internal_call_stack_manager_provider(internal_call_stack_manager_provider)
        , global_variables(global_variables)
    {}
    std::unique_ptr<ContextInterface> make_nested_context(AztecAddress address,
                                                          AztecAddress msg_sender,
                                                          FF transaction_fee,
                                                          ContextInterface& parent_context,
                                                          uint32_t cd_offset_addr,
                                                          uint32_t cd_size_addr,
                                                          bool is_static,
                                                          Gas gas_limit) override;
    std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                            AztecAddress msg_sender,
                                                            FF transaction_fee,
                                                            std::span<const FF> calldata,
                                                            bool is_static,
                                                            Gas gas_limit,
                                                            Gas gas_used) override;
    uint32_t get_next_context_id() const override;

  private:
    uint32_t next_context_id = 1; // 0 is reserved to denote the parent of a top level context

    TxBytecodeManagerInterface& tx_bytecode_manager;
    MemoryProviderInterface& memory_provider;
    CalldataHashingProviderInterface& cd_hash_provider;
    InternalCallStackManagerProviderInterface& internal_call_stack_manager_provider;
    const GlobalVariables& global_variables;
};

} // namespace bb::avm2::simulation
