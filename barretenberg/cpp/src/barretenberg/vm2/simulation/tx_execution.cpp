#include "barretenberg/vm2/simulation/tx_execution.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include <algorithm>

namespace bb::avm2::simulation {

void TxExecution::simulate(const Tx& tx)
{
    Gas tx_gas_limit = tx.gasSettings.gasLimits;
    Gas gas_used = tx.gasUsedByPrivate;

    // TODO: Move the max l2 gas per tx public portion to the private tail to public.
    Gas gas_limit =
        Gas{ std::min(tx_gas_limit.l2Gas, gas_used.l2Gas + MAX_L2_GAS_PER_TX_PUBLIC_PORTION), tx_gas_limit.daGas };

    info("Simulating tx ",
         tx.hash,
         " with ",
         tx.setupEnqueuedCalls.size(),
         " setup enqueued calls, ",
         tx.appLogicEnqueuedCalls.size(),
         " app logic enqueued calls, and ",
         tx.teardownEnqueuedCall ? "1 teardown enqueued call" : "no teardown enqueued call");

    // TODO: This method is currently wrong. We need to lift the context to this level.
    // TODO: Checkpointing is not yet correctly implemented.

    // Insert non-revertibles.
    insert_non_revertibles(tx);

    // Setup.
    for (const auto& call : tx.setupEnqueuedCalls) {
        info("[SETUP] Executing enqueued call to ", call.contractAddress);
        auto context = make_enqueued_context(
            call.contractAddress, call.msgSender, call.calldata, call.isStaticCall, gas_limit, gas_used);
        call_execution.execute(*context);
        gas_used = context->get_gas_used();
    }

    // Insert revertibles.
    insert_revertibles(tx);

    // App logic.
    for (const auto& call : tx.appLogicEnqueuedCalls) {
        info("[APP_LOGIC] Executing enqueued call to ", call.contractAddress);
        auto context = make_enqueued_context(
            call.contractAddress, call.msgSender, call.calldata, call.isStaticCall, gas_limit, gas_used);
        call_execution.execute(*context);
        gas_used = context->get_gas_used();
    }

    // Teardown.
    if (tx.teardownEnqueuedCall) {
        info("[TEARDOWN] Executing enqueued call to ", tx.teardownEnqueuedCall->contractAddress);
        auto context = make_enqueued_context(tx.teardownEnqueuedCall->contractAddress,
                                             tx.teardownEnqueuedCall->msgSender,
                                             tx.teardownEnqueuedCall->calldata,
                                             tx.teardownEnqueuedCall->isStaticCall,
                                             tx.gasSettings.teardownGasLimits,
                                             Gas{ 0, 0 });
        call_execution.execute(*context);
    }
}

// This is effectively just calling into the execution provider
std::unique_ptr<ContextInterface> TxExecution::make_enqueued_context(AztecAddress address,
                                                                     AztecAddress msg_sender,
                                                                     std::span<const FF> calldata,
                                                                     bool is_static,
                                                                     Gas gas_limit,
                                                                     Gas gas_used)
{
    auto& execution_provider = call_execution.get_provider();
    return execution_provider.make_enqueued_context(address, msg_sender, calldata, is_static, gas_limit, gas_used);
}

void TxExecution::insert_non_revertibles(const Tx& tx)
{
    // 1. Write the already siloed nullifiers.
    for (const auto& nullifier : tx.nonRevertibleAccumulatedData.nullifiers) {
        merkle_db.nullifier_write(nullifier);
    }
    // 2. Write the note hashes.
    // 3. Write the new contracts.
}

void TxExecution::insert_revertibles(const Tx&)
{
    merkle_db.create_checkpoint();
    // 1. Write the nullifiers.
    // 2. Write the note hashes.
    // 3. Write the new contracts.
}

} // namespace bb::avm2::simulation
