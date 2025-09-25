#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"
#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/gadgets/execution.hpp"
#include "barretenberg/vm2/simulation/gadgets/nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/tx_context.hpp"
#include "barretenberg/vm2/simulation/gadgets/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::avm2::simulation {

// In charge of executing a transaction.
class TxExecution final {
  public:
    TxExecution(ExecutionInterface& call_execution,
                ContextProviderInterface& context_provider,
                HighLevelMerkleDBInterface& merkle_db,
                WrittenPublicDataSlotsTreeCheckInterface& written_public_data_slots_tree,
                RetrievedBytecodesTreeCheckInterface& retrieved_bytecodes_tree,
                FieldGreaterThanInterface& field_gt,
                Poseidon2Interface& poseidon2,
                EventEmitterInterface<TxEvent>& event_emitter)
        : call_execution(call_execution)
        , context_provider(context_provider)
        , merkle_db(merkle_db)
        , field_gt(field_gt)
        , poseidon2(poseidon2)
        , events(event_emitter)
        , tx_context(merkle_db, written_public_data_slots_tree, retrieved_bytecodes_tree, context_provider)
    {}

    void simulate(const Tx& tx);

  private:
    ExecutionInterface& call_execution;
    ContextProviderInterface& context_provider;
    HighLevelMerkleDBInterface& merkle_db;
    FieldGreaterThanInterface& field_gt;
    Poseidon2Interface& poseidon2;
    EventEmitterInterface<TxEvent>& events;

    TxContext tx_context;

    // This function can throw if there is a nullifier collision.
    void insert_non_revertibles(const Tx& tx);
    // This function can throw if there is a nullifier collision.
    void insert_revertibles(const Tx& tx);
    void emit_public_call_request(const PublicCallRequestWithCalldata& call,
                                  TransactionPhase phase,
                                  const FF& transaction_fee,
                                  bool success,
                                  const Gas& start_gas,
                                  const Gas& end_gas,
                                  const TxContextEvent& state_before,
                                  const TxContextEvent& state_after);
    void pay_fee(const FF& fee_payer, const FF& fee, const uint128_t& fee_per_da_gas, const uint128_t& fee_per_l2_gas);

    void emit_l2_to_l1_message(bool revertible, const ScopedL2ToL1Message& l2_to_l1_message);
    void emit_nullifier(bool revertible, const FF& nullifier);
    void emit_note_hash(bool revertible, const FF& note_hash);

    void pad_trees();

    void cleanup();

    void emit_empty_phase(TransactionPhase phase);
};

} // namespace bb::avm2::simulation
