#include "barretenberg/vm2/simulation/tx_execution.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include <algorithm>

namespace bb::avm2::simulation {

void TxExecution::simulate(const Tx& tx)
{
    Gas gas_limit = tx.gasSettings.gasLimits;
    Gas gas_used = tx.gasUsedByPrivate;

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

    try {
        // Insert non-revertibles.
        insert_non_revertibles(tx);

        // Setup.
        for (const auto& call : tx.setupEnqueuedCalls) {
            info("[SETUP] Executing enqueued call to ", call.contractAddress);
            auto context = make_enqueued_context(
                call.contractAddress, call.msgSender, call.calldata, call.isStaticCall, gas_limit, gas_used);
            ExecutionResult result = call_execution.execute(std::move(context));
            gas_used = result.gas_used;
        }

        try {
            merkle_db.create_checkpoint();

            // Insert revertibles.
            insert_revertibles(tx);

            // App logic.
            for (const auto& call : tx.appLogicEnqueuedCalls) {
                info("[APP_LOGIC] Executing enqueued call to ", call.contractAddress);
                auto context = make_enqueued_context(
                    call.contractAddress, call.msgSender, call.calldata, call.isStaticCall, gas_limit, gas_used);
                ExecutionResult result = call_execution.execute(std::move(context));
                gas_used = result.gas_used;
            }
        } catch (const std::exception& e) {
            // TODO: revert the checkpoint.
            info("Revertible failure while simulating tx ", tx.hash, ": ", e.what());
        }

        // Teardown.
        if (tx.teardownEnqueuedCall) {
            try {
                info("[TEARDOWN] Executing enqueued call to ", tx.teardownEnqueuedCall->contractAddress);
                auto context = make_enqueued_context(tx.teardownEnqueuedCall->contractAddress,
                                                     tx.teardownEnqueuedCall->msgSender,
                                                     tx.teardownEnqueuedCall->calldata,
                                                     tx.teardownEnqueuedCall->isStaticCall,
                                                     tx.gasSettings.teardownGasLimits,
                                                     Gas{ 0, 0 });
                call_execution.execute(std::move(context));
            } catch (const std::exception& e) {
                info("Teardown failure while simulating tx ", tx.hash, ": ", e.what());
            }
        }

        // TODO: Fee payment.
    } catch (const std::exception& e) {
        // Catastrophic failure.
        info("Error while simulating tx ", tx.hash, ": ", e.what());
        throw e;
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
    // 1. Write the nullifiers.
    // 2. Write the note hashes.
    // 3. Write the new contracts.
}

} // namespace bb::avm2::simulation
