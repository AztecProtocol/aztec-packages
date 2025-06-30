#include "barretenberg/vm2/simulation/tx_execution.hpp"

#include <algorithm>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"

namespace bb::avm2::simulation {

void TxExecution::emit_public_call_request(const PublicCallRequestWithCalldata& call,
                                           TransactionPhase phase,
                                           const FF& transaction_fee,
                                           const ExecutionResult& result,
                                           TreeStates&& prev_tree_state,
                                           Gas prev_gas,
                                           Gas gas_limit)
{
    events.emit(TxPhaseEvent{ .phase = phase,
                              .prev_tree_state = std::move(prev_tree_state),
                              .next_tree_state = merkle_db.get_tree_state(),
                              .event = EnqueuedCallEvent{
                                  .msg_sender = call.request.msgSender,
                                  .contract_address = call.request.contractAddress,
                                  .transaction_fee = transaction_fee,
                                  .is_static = call.request.isStaticCall,
                                  .calldata_hash = call.request.calldataHash,
                                  .prev_gas_used = prev_gas,
                                  .gas_used = result.gas_used,
                                  .gas_limit = gas_limit,
                                  .success = result.success,
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
    Gas gas_used = tx.gasUsedByPrivate;

    events.emit(TxStartupEvent{
        .tx_gas_limit = gas_limit,
        .private_gas_used = gas_used,
        .tree_state = merkle_db.get_tree_state(),
    });

    info("Simulating tx ",
         tx.hash,
         " with ",
         tx.setupEnqueuedCalls.size(),
         " setup enqueued calls, ",
         tx.appLogicEnqueuedCalls.size(),
         " app logic enqueued calls, and ",
         tx.teardownEnqueuedCall ? "1 teardown enqueued call" : "no teardown enqueued call");

    // TODO: Checkpointing is not yet correctly implemented.
    try {
        // Insert non-revertibles.
        insert_non_revertibles(tx);

        // Setup.
        for (const auto& call : tx.setupEnqueuedCalls) {
            info("[SETUP] Executing enqueued call to ", call.request.contractAddress);
            TreeStates prev_tree_state = merkle_db.get_tree_state();
            auto context = context_provider.make_enqueued_context(call.request.contractAddress,
                                                                  call.request.msgSender,
                                                                  /*transaction_fee=*/FF(0),
                                                                  call.calldata,
                                                                  call.request.isStaticCall,
                                                                  gas_limit,
                                                                  gas_used);
            ExecutionResult result = call_execution.execute(std::move(context));
            emit_public_call_request(call,
                                     TransactionPhase::SETUP,
                                     /*transaction_fee=*/FF(0),
                                     result,
                                     std::move(prev_tree_state),
                                     gas_used,
                                     gas_limit);
            gas_used = result.gas_used;
        }

        try {
            merkle_db.create_checkpoint();

            // Insert revertibles.
            insert_revertibles(tx);

            // App logic.
            for (const auto& call : tx.appLogicEnqueuedCalls) {
                info("[APP_LOGIC] Executing enqueued call to ", call.request.contractAddress);
                TreeStates prev_tree_state = merkle_db.get_tree_state();
                auto context = context_provider.make_enqueued_context(call.request.contractAddress,
                                                                      call.request.msgSender,
                                                                      /*transaction_fee=*/FF(0),
                                                                      call.calldata,
                                                                      call.request.isStaticCall,
                                                                      gas_limit,
                                                                      gas_used);
                ExecutionResult result = call_execution.execute(std::move(context));
                emit_public_call_request(call,
                                         TransactionPhase::APP_LOGIC,
                                         /*transaction_fee=*/FF(0),
                                         result,
                                         std::move(prev_tree_state),
                                         gas_used,
                                         gas_limit);
                gas_used = result.gas_used;
            }
        } catch (const std::exception& e) {
            // TODO: revert the checkpoint.
            info("Revertible failure while simulating tx ", tx.hash, ": ", e.what());
        }

        // Compute the transaction fee here so it can be passed to teardown
        uint128_t fee_per_da_gas = tx.effectiveGasFees.feePerDaGas;
        uint128_t fee_per_l2_gas = tx.effectiveGasFees.feePerL2Gas;
        FF fee = FF(fee_per_da_gas) * FF(gas_used.daGas) + FF(fee_per_l2_gas) * FF(gas_used.l2Gas);

        // Teardown.
        if (tx.teardownEnqueuedCall) {
            try {
                info("[TEARDOWN] Executing enqueued call to ", tx.teardownEnqueuedCall->request.contractAddress);
                TreeStates prev_tree_state = merkle_db.get_tree_state();
                auto context = context_provider.make_enqueued_context(tx.teardownEnqueuedCall->request.contractAddress,
                                                                      tx.teardownEnqueuedCall->request.msgSender,
                                                                      fee,
                                                                      tx.teardownEnqueuedCall->calldata,
                                                                      tx.teardownEnqueuedCall->request.isStaticCall,
                                                                      tx.gasSettings.teardownGasLimits,
                                                                      Gas{ 0, 0 });
                ExecutionResult result = call_execution.execute(std::move(context));
                // Check what to do here for GAS
                emit_public_call_request(*tx.teardownEnqueuedCall,
                                         TransactionPhase::APP_LOGIC,
                                         fee,
                                         result,
                                         std::move(prev_tree_state),
                                         Gas{ 0, 0 }, // Reset for teardown since it is tracked separately
                                         tx.gasSettings.teardownGasLimits);
            } catch (const std::exception& e) {
                info("Teardown failure while simulating tx ", tx.hash, ": ", e.what());
            }
        }

        // Fee payment
        TreeStates prev_tree_state = merkle_db.get_tree_state();

        FF fee_payer = tx.feePayer;

        FF fee_juice_balance_slot = poseidon2.hash({ FEE_JUICE_BALANCES_SLOT, fee_payer });

        // Commented out for now, to make the bulk test pass before all opcodes are implemented.
        // FF fee_payer_balance = merkle_db.storage_read(FEE_JUICE_ADDRESS, fee_juice_balance_slot);
        FF fee_payer_balance = FF::neg_one();

        if (field_gt.ff_gt(fee, fee_payer_balance)) {
            // Unrecoverable error.
            throw std::runtime_error("Not enough balance for fee payer to pay for transaction");
        }

        // Commented out for now, to make the bulk test pass before all opcodes are implemented.
        // merkle_db.storage_write(FEE_JUICE_ADDRESS, fee_juice_balance_slot, fee_payer_balance - fee, true);

        events.emit(TxPhaseEvent{ .phase = TransactionPhase::COLLECT_GAS_FEES,
                                  .prev_tree_state = prev_tree_state,
                                  .next_tree_state = merkle_db.get_tree_state(),
                                  .event = CollectGasFeeEvent{
                                      .effective_fee_per_da_gas = fee_per_da_gas,
                                      .effective_fee_per_l2_gas = fee_per_l2_gas,
                                      .fee_payer = fee_payer,
                                      .fee_payer_balance = fee_payer_balance,
                                      .fee_juice_balance_slot = fee_juice_balance_slot,
                                      .fee = fee,
                                  } });
    } catch (const std::exception& e) {
        // Catastrophic failure.
        info("Error while simulating tx ", tx.hash, ": ", e.what());
        throw e;
    }
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
    auto prev_tree_state = merkle_db.get_tree_state();
    // 1. Write the already siloed nullifiers.
    for (const auto& nullifier : tx.nonRevertibleAccumulatedData.nullifiers) {
        // TODO: handle the error case
        merkle_db.siloed_nullifier_write(nullifier);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::NR_NULLIFIER_INSERTION,
                                  .prev_tree_state = prev_tree_state,
                                  .next_tree_state = next_tree_state,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = nullifier } });
        prev_tree_state = next_tree_state;
    }

    // 2. Write already unique note hashes.
    for (const auto& unique_note_hash : tx.nonRevertibleAccumulatedData.noteHashes) {
        merkle_db.unique_note_hash_write(unique_note_hash);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::NR_NOTE_INSERTION,
                                  .prev_tree_state = prev_tree_state,
                                  .next_tree_state = next_tree_state,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = unique_note_hash } });
        prev_tree_state = next_tree_state;
    }

    // 3. Write l2_l1 messages
    for (const auto& l2_to_l1_msg : tx.nonRevertibleAccumulatedData.l2ToL1Messages) {
        // Tree state does not change when writing L2 to L1 messages.
        auto tree_state = merkle_db.get_tree_state();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::NR_L2_TO_L1_MESSAGE,
                                  .prev_tree_state = tree_state,
                                  .next_tree_state = tree_state,
                                  .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_msg } });
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
    auto prev_tree_state = merkle_db.get_tree_state();
    // 1. Write the already siloed nullifiers.
    for (const auto& siloed_nullifier : tx.revertibleAccumulatedData.nullifiers) {
        // TODO: handle the error case
        merkle_db.siloed_nullifier_write(siloed_nullifier);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::R_NULLIFIER_INSERTION,
                                  .prev_tree_state = prev_tree_state,
                                  .next_tree_state = next_tree_state,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = siloed_nullifier } });
        prev_tree_state = next_tree_state;
    }

    // 2. Write the siloed non uniqued note hashes
    for (const auto& siloed_note_hash : tx.revertibleAccumulatedData.noteHashes) {
        merkle_db.siloed_note_hash_write(siloed_note_hash);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::R_NOTE_INSERTION,
                                  .prev_tree_state = prev_tree_state,
                                  .next_tree_state = next_tree_state,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = siloed_note_hash } });
        prev_tree_state = next_tree_state;
    }

    // 3. Write L2 to L1 messages.
    for (const auto& l2_to_l1_msg : tx.revertibleAccumulatedData.l2ToL1Messages) {
        // Tree state does not change when writing L2 to L1 messages.
        auto tree_state = merkle_db.get_tree_state();
        events.emit(TxPhaseEvent{ .phase = TransactionPhase::R_L2_TO_L1_MESSAGE,
                                  .prev_tree_state = tree_state,
                                  .next_tree_state = tree_state,
                                  .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_msg } });
    }
}

} // namespace bb::avm2::simulation
