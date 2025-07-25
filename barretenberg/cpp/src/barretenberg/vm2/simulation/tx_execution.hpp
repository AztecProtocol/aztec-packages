#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/context_provider.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"

namespace bb::avm2::simulation {

// In charge of executing a transaction.
class TxExecution final {
  public:
    // FIXME: mekle db here should only be temporary, we should access via context.
    TxExecution(ExecutionInterface& call_execution,
                ContextProviderInterface& context_provider,
                HighLevelMerkleDBInterface& merkle_db,
                FieldGreaterThanInterface& field_gt,
                Poseidon2Interface& poseidon2,
                EventEmitterInterface<TxEvent>& event_emitter)
        : call_execution(call_execution)
        , context_provider(context_provider)
        , merkle_db(merkle_db)
        , field_gt(field_gt)
        , poseidon2(poseidon2)
        , events(event_emitter)
    {}

    void simulate(const Tx& tx);

  private:
    ExecutionInterface& call_execution;
    ContextProviderInterface& context_provider;
    // More things need to be lifted into the tx execution??
    HighLevelMerkleDBInterface& merkle_db;
    FieldGreaterThanInterface& field_gt;
    Poseidon2Interface& poseidon2;
    EventEmitterInterface<TxEvent>& events;

    // This function can throw if there is a nullifier collision.
    void insert_non_revertibles(const Tx& tx);
    // This function can throw if there is a nullifier collision.
    void insert_revertibles(const Tx& tx);
    void emit_public_call_request(const PublicCallRequestWithCalldata& call,
                                  TransactionPhase phase,
                                  const FF& transaction_fee,
                                  const ExecutionResult& result,
                                  TreeStates&& prev_tree_state,
                                  Gas prev_gas,
                                  Gas gas_limit);
};

} // namespace bb::avm2::simulation
