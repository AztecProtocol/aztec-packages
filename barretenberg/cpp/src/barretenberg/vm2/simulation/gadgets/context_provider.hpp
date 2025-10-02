#pragma once

#include <memory>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/internal_call_stack_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/context_provider.hpp"

namespace bb::avm2::simulation {

class ContextProvider : public ContextProviderInterface {
  public:
    ContextProvider(TxBytecodeManagerInterface& tx_bytecode_manager,
                    MemoryProviderInterface& memory_provider,
                    CalldataHashingProviderInterface& cd_hash_provider,
                    InternalCallStackManagerProviderInterface& internal_call_stack_manager_provider,
                    HighLevelMerkleDBInterface& merkle_db,
                    WrittenPublicDataSlotsTreeCheckInterface& written_public_data_slots_tree,
                    RetrievedBytecodesTreeCheckInterface& retrieved_bytecodes_tree,
                    const GlobalVariables& global_variables)
        : tx_bytecode_manager(tx_bytecode_manager)
        , memory_provider(memory_provider)
        , cd_hash_provider(cd_hash_provider)
        , internal_call_stack_manager_provider(internal_call_stack_manager_provider)
        , merkle_db(merkle_db)
        , written_public_data_slots_tree(written_public_data_slots_tree)
        , retrieved_bytecodes_tree(retrieved_bytecodes_tree)
        , global_variables(global_variables)
    {}
    std::unique_ptr<ContextInterface> make_nested_context(AztecAddress address,
                                                          AztecAddress msg_sender,
                                                          FF transaction_fee,
                                                          ContextInterface& parent_context,
                                                          MemoryAddress cd_offset_address,
                                                          MemoryAddress cd_size_address,
                                                          bool is_static,
                                                          Gas gas_limit,
                                                          SideEffectStates side_effect_states,
                                                          TransactionPhase phase) override;
    std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                            AztecAddress msg_sender,
                                                            FF transaction_fee,
                                                            std::span<const FF> calldata,
                                                            bool is_static,
                                                            Gas gas_limit,
                                                            Gas gas_used,
                                                            SideEffectStates side_effect_states,
                                                            TransactionPhase phase) override;
    uint32_t get_next_context_id() const override;

  private:
    uint32_t next_context_id = 1; // 0 is reserved to denote the parent of a top level context

    TxBytecodeManagerInterface& tx_bytecode_manager;
    MemoryProviderInterface& memory_provider;
    CalldataHashingProviderInterface& cd_hash_provider;
    InternalCallStackManagerProviderInterface& internal_call_stack_manager_provider;
    HighLevelMerkleDBInterface& merkle_db;
    WrittenPublicDataSlotsTreeCheckInterface& written_public_data_slots_tree;
    RetrievedBytecodesTreeCheckInterface& retrieved_bytecodes_tree;
    const GlobalVariables& global_variables;
};

} // namespace bb::avm2::simulation
