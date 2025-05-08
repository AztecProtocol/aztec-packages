#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::simulation {

// In charge of executing a transaction.
class TxExecution final {
  public:
    // FIXME: mekle db here should only be temporary, we should access via context.
    TxExecution(ExecutionInterface& call_execution,
                HighLevelMerkleDBInterface& merkle_db,
                CalldataHashingInterface& cd_hasher,
                EventEmitterInterface<CalldataEvent>& cd_events)
        : call_execution(call_execution)
        , merkle_db(merkle_db)
        , cd_hasher(cd_hasher)
        , cd_events(cd_events)
    {}

    void simulate(const Tx& tx);

    std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                            AztecAddress msg_sender,
                                                            std::span<const FF> calldata,
                                                            bool is_static);

  private:
    ExecutionInterface& call_execution;
    // More things need to be lifted into the tx execution??
    HighLevelMerkleDBInterface& merkle_db;

    // todo(ilyas): is this the best place for this calldata emitter, it can also live
    // in the execution components class
    // Calldata events are only relevant for top-level calls
    CalldataHashingInterface& cd_hasher;
    EventEmitterInterface<CalldataEvent>& cd_events;
    // This should be derived from phase / counter information
    EnqueuedCallId next_enqueued_call_id = 0;

    void insert_non_revertibles(const Tx& tx);
    void insert_revertibles(const Tx& tx);
};

} // namespace bb::avm2::simulation
