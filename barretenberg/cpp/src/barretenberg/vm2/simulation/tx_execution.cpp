#include "barretenberg/vm2/simulation/tx_execution.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

void TxExecution::simulate(const Tx& tx)
{
    // TODO: other inter-enqueued-call stuff will be done here.
    for (const auto& call : tx.enqueued_calls) {
        info("Executing enqueued call to ", call.contractAddress);
        auto context = make_enqueued_context(call.contractAddress, call.msgSender, call.calldata, call.isStaticCall);
        auto result = call_execution.execute(*context);
        info("Enqueued call to ",
             call.contractAddress,
             " was a ",
             result.success ? "success" : "failure",
             " and it returned ",
             result.returndata.size(),
             " elements.");
    }
}

// This is effectively just calling into the execution provider
std::unique_ptr<ContextInterface> TxExecution::make_enqueued_context(AztecAddress address,
                                                                     AztecAddress msg_sender,
                                                                     std::span<const FF> calldata,
                                                                     bool is_static)
{
    auto& execution_provider = call_execution.get_provider();
    return execution_provider.make_enqueued_context(address, msg_sender, calldata, is_static);
}

} // namespace bb::avm2::simulation
