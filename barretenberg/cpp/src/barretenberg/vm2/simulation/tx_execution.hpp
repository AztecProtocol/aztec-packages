#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::simulation {

// In charge of executing a transaction.
class TxExecution final {
  public:
    // FIXME: mekle db here should only be temporary, we should access via context.
    TxExecution(ExecutionInterface& call_execution, HighLevelMerkleDBInterface& merkle_db)
        : call_execution(call_execution)
        , merkle_db(merkle_db)
    {}

    void simulate(const Tx& tx);

    std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                            AztecAddress msg_sender,
                                                            std::span<const FF> calldata,
                                                            bool is_static,
                                                            Gas gas_limit,
                                                            Gas gas_used);

  private:
    ExecutionInterface& call_execution;
    // More things need to be lifted into the tx execution??
    HighLevelMerkleDBInterface& merkle_db;

    void insert_non_revertibles(const Tx& tx);
    void insert_revertibles(const Tx& tx);
};

} // namespace bb::avm2::simulation
