#include "barretenberg/vm2/simulation/tx_execution.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

void TxExecution::simulate(const Tx& tx)
{
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
        auto context = make_enqueued_context(call.contractAddress, call.msgSender, call.calldata, call.isStaticCall);
        call_execution.execute(*context);
    }

    // Insert revertibles.
    insert_revertibles(tx);

    // App logic.
    for (const auto& call : tx.appLogicEnqueuedCalls) {
        info("[APP_LOGIC] Executing enqueued call to ", call.contractAddress);
        auto context = make_enqueued_context(call.contractAddress, call.msgSender, call.calldata, call.isStaticCall);
        call_execution.execute(*context);
    }

    // Teardown.
    if (tx.teardownEnqueuedCall) {
        info("[TEARDOWN] Executing enqueued call to ", tx.teardownEnqueuedCall->contractAddress);
        auto context = make_enqueued_context(tx.teardownEnqueuedCall->contractAddress,
                                             tx.teardownEnqueuedCall->msgSender,
                                             tx.teardownEnqueuedCall->calldata,
                                             tx.teardownEnqueuedCall->isStaticCall);
        call_execution.execute(*context);
    }
}

// This is effectively just calling into the execution provider
std::unique_ptr<ContextInterface> TxExecution::make_enqueued_context(AztecAddress address,
                                                                     AztecAddress msg_sender,
                                                                     std::span<const FF> calldata,
                                                                     bool is_static)
{
    auto& execution_provider = call_execution.get_provider();
    auto ctx = execution_provider.make_enqueued_context(address, msg_sender, calldata, is_static);
    ctx->set_enqueued_call_id(next_enqueued_call_id);

    cd_events.emit(
        { .calldata = std::vector<FF>(calldata.begin(), calldata.end()), .enqueued_call_id = next_enqueued_call_id });

    cd_hasher.compute_calldata_hash(next_enqueued_call_id, std::vector<FF>(calldata.begin(), calldata.end()));

    next_enqueued_call_id++;
    return ctx;
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
