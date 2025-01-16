#include "barretenberg/vm2/simulation/tx_execution.hpp"

namespace bb::avm2::simulation {

void TxExecution::simulate(const Tx& tx)
{
    // TODO: other inter-enqueued-call stuff will be done here.
    for (const auto& call : tx.enqueued_calls) {
        info("Executing enqueued call to ", call.contractAddress);
        auto result = call_execution.execute(call.contractAddress, call.args, call.sender, call.isStatic);
        info("Enqueued call to ",
             call.contractAddress,
             " was a ",
             result.success ? "success" : "failure",
             " and it returned ",
             result.returndata.size(),
             " elements.");
    }
}

} // namespace bb::avm2::simulation