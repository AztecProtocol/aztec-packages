#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"

namespace bb::avm2::simulation {

// Temporary.
struct Tx {
    std::vector<EnqueuedCallHint> enqueued_calls;
};

// Temporary lifting of ContextProvider (ripped from ExecutionComponents)
class ContextProviderInterface {
  public:
    virtual ~ContextProviderInterface() = default;

    virtual std::unique_ptr<EnqueuedCallContext> make_enqueued_context(AztecAddress address,
                                                                       AztecAddress msg_sender,
                                                                       std::span<const FF> calldata,
                                                                       bool is_static) = 0;
    // TODO: Update params for this nested call
    virtual std::unique_ptr<NestedContext> make_nested_context(AztecAddress address,
                                                               AztecAddress msg_sender,
                                                               std::span<const FF> calldata,
                                                               bool is_static) = 0;
};

class ContextProvider : public ContextProviderInterface {
  public:
    ContextProvider(TxBytecodeManagerInterface& tx_bytecode_manager, EventEmitterInterface<MemoryEvent>& memory_events)
        : tx_bytecode_manager(tx_bytecode_manager)
        , memory_events(memory_events)
    {}
    std::unique_ptr<EnqueuedCallContext> make_enqueued_context(AztecAddress address,
                                                               AztecAddress msg_sender,
                                                               std::span<const FF> calldata,
                                                               bool is_static) override
    {

        // TODO update this
        auto context_id = next_context_id++;
        return std::make_unique<EnqueuedCallContext>(context_id,
                                                     address,
                                                     msg_sender,
                                                     calldata,
                                                     is_static,
                                                     std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
                                                     std::make_unique<Memory>(context_id, memory_events));
    }

    std::unique_ptr<NestedContext> make_nested_context(AztecAddress address,
                                                       AztecAddress msg_sender,
                                                       std::span<const FF> calldata,
                                                       bool is_static) override
    {

        auto context_id = next_context_id++;
        return std::make_unique<NestedContext>(context_id,
                                               address,
                                               msg_sender,
                                               calldata,
                                               is_static,
                                               std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
                                               std::make_unique<Memory>(context_id, memory_events));
    }

  private:
    uint32_t next_context_id;
    TxBytecodeManagerInterface& tx_bytecode_manager;
    EventEmitterInterface<MemoryEvent>& memory_events;
};

// In charge of executing a transaction.
class TxExecution final {
  public:
    TxExecution(ExecutionInterface& call_execution, ContextProviderInterface& context_provider)
        : call_execution(call_execution)
        , context_provider(context_provider){};

    void simulate(const Tx& tx);

  private:
    ExecutionInterface& call_execution;
    ContextProviderInterface& context_provider;
    // More things need to be lifted into the tx execution??
    // MerkleDB
};

} // namespace bb::avm2::simulation
