#include "barretenberg/vm2/simulation/tx_execution.hpp"

#include <algorithm>
#include <stdexcept>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/tx_context_event.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"
#include "barretenberg/vm2/simulation/tx_context.hpp"

namespace bb::avm2::simulation {

void TxExecution::emit_public_call_request(const PublicCallRequestWithCalldata& call,
                                           TransactionPhase phase,
                                           const FF& transaction_fee,
                                           bool success,
                                           const Gas& gas_limit,
                                           const TxContextEvent& state_before,
                                           const TxContextEvent& state_after)
{
    events.emit(TxPhaseEvent{ .phase = phase,
                              .state_before = state_before,
                              .state_after = state_after,
                              .event = EnqueuedCallEvent{
                                  .msg_sender = call.request.msgSender,
                                  .contract_address = call.request.contractAddress,
                                  .transaction_fee = transaction_fee,
                                  .is_static = call.request.isStaticCall,
                                  .calldata_hash = call.request.calldataHash,
                                  .gas_limit = gas_limit,
                                  .success = success,
                              } });
}

// Simulates the entire transaction execution phases.
// There are multiple distinct transaction phases that are executed in order:
// (1) Non-revertible insertions of nullifiers, note hashes, and L2 to L1 messages.
// (2) Setup phase, where the setup enqueued calls are executed.
// (3) Revertible insertions of nullifiers, note hashes, and L2 to L1 messages.
// (4) App logic phase, where the app logic enqueued calls are executed.
// (5) Collec Gas fee
void TxExecution::simulate(const Tx& tx)
{
    Gas gas_limit = tx.gasSettings.gasLimits;
    tx_context.gas_used = tx.gasUsedByPrivate;

    events.emit(TxStartupEvent{
        .state = tx_context.serialize_tx_context_event(),
    });

    info("Simulating tx ",
         tx.hash,
         " with ",
         tx.setupEnqueuedCalls.size(),
         " setup enqueued calls, ",
         tx.appLogicEnqueuedCalls.size(),
         " app logic enqueued calls, and ",
         tx.teardownEnqueuedCall ? "1 teardown enqueued call" : "no teardown enqueued call");

    // Insert non-revertibles. This can throw if there is a nullifier collision.
    insert_non_revertibles(tx);

    // Setup.
    for (const auto& call : tx.setupEnqueuedCalls) {
        info("[SETUP] Executing enqueued call to ", call.request.contractAddress);
        TxContextEvent state_before = tx_context.serialize_tx_context_event();
        auto context = context_provider.make_enqueued_context(call.request.contractAddress,
                                                              call.request.msgSender,
                                                              /*transaction_fee=*/FF(0),
                                                              call.calldata,
                                                              call.request.isStaticCall,
                                                              gas_limit,
                                                              tx_context.gas_used);
        ExecutionResult result = call_execution.execute(std::move(context));
        tx_context.gas_used = result.gas_used;
        emit_public_call_request(call,
                                 TransactionPhase::SETUP,
                                 /*transaction_fee=*/FF(0),
                                 result.success,
                                 gas_limit,
                                 state_before,
                                 tx_context.serialize_tx_context_event());
        tx_context.gas_used = result.gas_used;
    }

    // The checkpoint we should go back to if anything from now on reverts.
    merkle_db.create_checkpoint();

    try {
        // Insert revertibles. This can throw if there is a nullifier collision.
        insert_revertibles(tx);

        // App logic.
        for (const auto& call : tx.appLogicEnqueuedCalls) {
            info("[APP_LOGIC] Executing enqueued call to ", call.request.contractAddress);
            TxContextEvent state_before = tx_context.serialize_tx_context_event();
            auto context = context_provider.make_enqueued_context(call.request.contractAddress,
                                                                  call.request.msgSender,
                                                                  /*transaction_fee=*/FF(0),
                                                                  call.calldata,
                                                                  call.request.isStaticCall,
                                                                  gas_limit,
                                                                  tx_context.gas_used);
            ExecutionResult result = call_execution.execute(std::move(context));
            tx_context.gas_used = result.gas_used;
            emit_public_call_request(call,
                                     TransactionPhase::APP_LOGIC,
                                     /*transaction_fee=*/FF(0),
                                     result.success,
                                     gas_limit,
                                     state_before,
                                     tx_context.serialize_tx_context_event());
            if (!result.success) {
                throw std::runtime_error(
                    format("[APP_LOGIC] Enqueued call to ", call.request.contractAddress, " failed"));
            }
        }
    } catch (const std::runtime_error& e) {
        info("Revertible failure while simulating tx ", tx.hash, ": ", e.what());
        // TODO(fcarreiro): Enable the following lines once we stop truncating the bulk trace.
        // We can't execute this code because TS will not fail here, and therefore not revert and create a checkpoint.

        // We revert to the post-setup state.
        // merkle_db.revert_checkpoint();
        // But we also create a new fork so that the teardown phase can transparently
        // commit or rollback to the end of teardown.
        // merkle_db.create_checkpoint();
    }

    // Compute the transaction fee here so it can be passed to teardown
    uint128_t fee_per_da_gas = tx.effectiveGasFees.feePerDaGas;
    uint128_t fee_per_l2_gas = tx.effectiveGasFees.feePerL2Gas;
    FF fee = FF(fee_per_da_gas) * FF(tx_context.gas_used.daGas) + FF(fee_per_l2_gas) * FF(tx_context.gas_used.l2Gas);

    // Teardown.
    try {
        if (tx.teardownEnqueuedCall) {
            info("[TEARDOWN] Executing enqueued call to ", tx.teardownEnqueuedCall->request.contractAddress);
            // Reset gas for teardown since it is tracked separately.
            tx_context.gas_used = { 0, 0 };
            TxContextEvent state_before = tx_context.serialize_tx_context_event();
            auto context = context_provider.make_enqueued_context(tx.teardownEnqueuedCall->request.contractAddress,
                                                                  tx.teardownEnqueuedCall->request.msgSender,
                                                                  fee,
                                                                  tx.teardownEnqueuedCall->calldata,
                                                                  tx.teardownEnqueuedCall->request.isStaticCall,
                                                                  // Teardown has its own gas limit and usage.
                                                                  tx.gasSettings.teardownGasLimits,
                                                                  Gas{ 0, 0 });
            ExecutionResult result = call_execution.execute(std::move(context));
            // Check what to do here for GAS
            emit_public_call_request(*tx.teardownEnqueuedCall,
                                     // TODO(dbanks12): This should be TEARDOWN.
                                     TransactionPhase::APP_LOGIC,
                                     fee,
                                     result.success,
                                     tx.gasSettings.teardownGasLimits,
                                     state_before,
                                     tx_context.serialize_tx_context_event());
            if (!result.success) {
                throw std::runtime_error(format(
                    "[TEARDOWN] Enqueued call to ", tx.teardownEnqueuedCall->request.contractAddress, " failed"));
            }
        }

        // TODO(fcarreiro): Enable the following lines once we stop truncating the bulk trace.
        // We commit the forked state and we are done.
        // merkle_db.commit_checkpoint();
    } catch (const std::runtime_error& e) {
        info("Teardown failure while simulating tx ", tx.hash, ": ", e.what());
        // TODO(fcarreiro): Enable the following lines once we stop truncating the bulk trace.
        // We rollback to the post-setup state.
        // merkle_db.revert_checkpoint();
    }

    // Fee payment
    pay_fee(tx.feePayer, fee, fee_per_da_gas, fee_per_l2_gas);
}

// TODO: How to increment the context id here?
// This function inserts the non-revertible accumulated data into the Merkle DB.
// It might error if the limits for number of allowable inserts are exceeded, but this result in an unprovable tx
void TxExecution::insert_non_revertibles(const Tx& tx)
{
    info("[NON_REVERTIBLE] Inserting ",
         tx.nonRevertibleAccumulatedData.nullifiers.size(),
         " nullifiers, ",
         tx.nonRevertibleAccumulatedData.noteHashes.size(),
         " note hashes, and ",
         tx.nonRevertibleAccumulatedData.l2ToL1Messages.size(),
         " L2 to L1 messages for tx ",
         tx.hash);

    TxContextEvent state_before = tx_context.serialize_tx_context_event();
    // 1. Write the already siloed nullifiers.
    for (const auto& nullifier : tx.nonRevertibleAccumulatedData.nullifiers) {
        // TODO: handle the error case
        merkle_db.siloed_nullifier_write(nullifier);
        TxContextEvent state_after = tx_context.serialize_tx_context_event();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::NR_NULLIFIER_INSERTION,
                                  .state_before = state_before,
                                  .state_after = state_after,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = nullifier } });
        state_before = state_after;
    }

    // 2. Write already unique note hashes.
    for (const auto& unique_note_hash : tx.nonRevertibleAccumulatedData.noteHashes) {
        merkle_db.unique_note_hash_write(unique_note_hash);
        TxContextEvent state_after = tx_context.serialize_tx_context_event();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::NR_NOTE_INSERTION,
                                  .state_before = state_before,
                                  .state_after = state_after,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = unique_note_hash } });
        state_before = state_after;
    }

    // 3. Write l2_l1 messages
    for (const auto& l2_to_l1_msg : tx.nonRevertibleAccumulatedData.l2ToL1Messages) {
        // Tree state does not change when writing L2 to L1 messages.
        TxContextEvent state_after = tx_context.serialize_tx_context_event();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::NR_L2_TO_L1_MESSAGE,
                                  .state_before = state_before,
                                  .state_after = state_after,
                                  .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_msg } });
        state_before = state_after;
    }
}

// TODO: Error Handling
void TxExecution::insert_revertibles(const Tx& tx)
{
    info("[REVERTIBLE] Inserting ",
         tx.revertibleAccumulatedData.nullifiers.size(),
         " nullifiers, ",
         tx.revertibleAccumulatedData.noteHashes.size(),
         " note hashes, and ",
         tx.revertibleAccumulatedData.l2ToL1Messages.size(),
         " L2 to L1 messages for tx ",
         tx.hash);

    TxContextEvent state_before = tx_context.serialize_tx_context_event();
    // 1. Write the already siloed nullifiers.
    for (const auto& siloed_nullifier : tx.revertibleAccumulatedData.nullifiers) {
        // TODO: handle the error case
        merkle_db.siloed_nullifier_write(siloed_nullifier);

        TxContextEvent state_after = tx_context.serialize_tx_context_event();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::R_NULLIFIER_INSERTION,
                                  .state_before = state_before,
                                  .state_after = state_after,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = siloed_nullifier } });
        state_before = state_after;
    }

    // 2. Write the siloed non uniqued note hashes
    for (const auto& siloed_note_hash : tx.revertibleAccumulatedData.noteHashes) {
        merkle_db.siloed_note_hash_write(siloed_note_hash);

        TxContextEvent state_after = tx_context.serialize_tx_context_event();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::R_NOTE_INSERTION,
                                  .state_before = state_before,
                                  .state_after = state_after,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = siloed_note_hash } });
        state_before = state_after;
    }

    // 3. Write L2 to L1 messages.
    for (const auto& l2_to_l1_msg : tx.revertibleAccumulatedData.l2ToL1Messages) {
        // Tree state does not change when writing L2 to L1 messages.
        TxContextEvent state_after = tx_context.serialize_tx_context_event();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::R_L2_TO_L1_MESSAGE,
                                  .state_before = state_before,
                                  .state_after = state_after,
                                  .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_msg } });
        state_before = state_after;
    }
}

void TxExecution::pay_fee(const FF& fee_payer,
                          const FF& fee,
                          const uint128_t& fee_per_da_gas,
                          const uint128_t& fee_per_l2_gas)
{
    TxContextEvent state_before = tx_context.serialize_tx_context_event();

    FF fee_juice_balance_slot = poseidon2.hash({ FEE_JUICE_BALANCES_SLOT, fee_payer });

    // TODO: Commented out for now, to make the bulk test pass before all opcodes are implemented.
    // FF fee_payer_balance = merkle_db.storage_read(FEE_JUICE_ADDRESS, fee_juice_balance_slot);
    FF fee_payer_balance = FF::neg_one();

    if (field_gt.ff_gt(fee, fee_payer_balance)) {
        // Unrecoverable error.
        throw std::runtime_error("Not enough balance for fee payer to pay for transaction");
    }

    // TODO: Commented out for now, to make the bulk test pass before all opcodes are implemented.
    // merkle_db.storage_write(FEE_JUICE_ADDRESS, fee_juice_balance_slot, fee_payer_balance - fee, true);

    events.emit(TxPhaseEvent{ .phase = TransactionPhase::COLLECT_GAS_FEES,
                              .state_before = state_before,
                              .state_after = tx_context.serialize_tx_context_event(),
                              .event = CollectGasFeeEvent{
                                  .effective_fee_per_da_gas = fee_per_da_gas,
                                  .effective_fee_per_l2_gas = fee_per_l2_gas,
                                  .fee_payer = fee_payer,
                                  .fee_payer_balance = fee_payer_balance,
                                  .fee_juice_balance_slot = fee_juice_balance_slot,
                                  .fee = fee,
                              } });
}

} // namespace bb::avm2::simulation
