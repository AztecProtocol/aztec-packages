#include "barretenberg/vm2/simulation/tx_execution.hpp"

#include <algorithm>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"

namespace bb::avm2::simulation {

void TxExecution::emit_public_call_request(const EnqueuedCallHint& call,
                                           TransactionPhase phase,
                                           const ExecutionResult& result,
                                           TreeStates&& prev_tree_state,
                                           Gas prev_gas,
                                           Gas gas_limit)
{
    // Compute an emit calldata event here eventually, for now just unconstrained
    std::vector<FF> calldata_with_sep = { GENERATOR_INDEX__PUBLIC_CALLDATA };
    calldata_with_sep.insert(calldata_with_sep.end(), call.calldata.begin(), call.calldata.end());
    auto calldata_hash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(calldata_with_sep);
    events.emit(TxEvent{ .phase = phase,
                         .prev_tree_state = std::move(prev_tree_state),
                         .next_tree_state = merkle_db.get_tree_state(),
                         .prev_gas_used = prev_gas,
                         .gas_used = result.gas_used,
                         .gas_limit = gas_limit,
                         .event = EnqueuedCallEvent{
                             .msg_sender = call.msgSender,
                             .contract_address = call.contractAddress,
                             .is_static = call.isStaticCall,
                             .calldata_hash = calldata_hash,
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
            info("[SETUP] Executing enqueued call to ", call.contractAddress);
            TreeStates prev_tree_state = merkle_db.get_tree_state();
            auto context = context_provider.make_enqueued_context(
                call.contractAddress, call.msgSender, call.calldata, call.isStaticCall, gas_limit, gas_used);
            ExecutionResult result = call_execution.execute(std::move(context));
            emit_public_call_request(
                call, TransactionPhase::SETUP, result, std::move(prev_tree_state), gas_used, gas_limit);
            gas_used = result.gas_used;
        }

        try {
            merkle_db.create_checkpoint();

            // Insert revertibles.
            insert_revertibles(tx);

            // App logic.
            for (const auto& call : tx.appLogicEnqueuedCalls) {
                info("[APP_LOGIC] Executing enqueued call to ", call.contractAddress);
                TreeStates prev_tree_state = merkle_db.get_tree_state();
                auto context = context_provider.make_enqueued_context(
                    call.contractAddress, call.msgSender, call.calldata, call.isStaticCall, gas_limit, gas_used);
                ExecutionResult result = call_execution.execute(std::move(context));
                emit_public_call_request(
                    call, TransactionPhase::APP_LOGIC, result, std::move(prev_tree_state), gas_used, gas_limit);
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
                TreeStates prev_tree_state = merkle_db.get_tree_state();
                auto context = context_provider.make_enqueued_context(tx.teardownEnqueuedCall->contractAddress,
                                                                      tx.teardownEnqueuedCall->msgSender,
                                                                      tx.teardownEnqueuedCall->calldata,
                                                                      tx.teardownEnqueuedCall->isStaticCall,
                                                                      tx.gasSettings.teardownGasLimits,
                                                                      Gas{ 0, 0 });

                ExecutionResult result = call_execution.execute(std::move(context));
                // Check what to do here for GAS
                emit_public_call_request(*tx.teardownEnqueuedCall,
                                         TransactionPhase::APP_LOGIC,
                                         result,
                                         std::move(prev_tree_state),
                                         Gas{ 0, 0 }, // Reset for teardown since it is tracked separately
                                         tx.gasSettings.teardownGasLimits);
            } catch (const std::exception& e) {
                info("Teardown failure while simulating tx ", tx.hash, ": ", e.what());
            }
        }

        // Fee payment.
        events.emit(TxEvent{ .phase = TransactionPhase::COLLECT_GAS_FEES,
                             .prev_tree_state = merkle_db.get_tree_state(),
                             .next_tree_state = merkle_db.get_tree_state(),
                             .prev_gas_used = gas_used,
                             .gas_used = gas_used, // Gas charged outside AVM for private inserts
                             .gas_limit = tx.gasSettings.gasLimits,
                             .event = CollectGasFeeEvent{
                                 .fee_per_da_gas = 0,
                                 .fee_per_l2_gas = 0,
                                 .max_fee_per_da_gas = tx.gasSettings.maxFeesPerGas.feePerDaGas,
                                 .max_fee_per_l2_gas = tx.gasSettings.maxFeesPerGas.feePerL2Gas,
                                 .max_priority_fees_per_l2_gas = tx.gasSettings.maxPriorityFeesPerGas.feePerL2Gas,
                                 .max_priority_fees_per_da_gas = tx.gasSettings.maxPriorityFeesPerGas.feePerDaGas,
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
        merkle_db.nullifier_write(nullifier);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxEvent{ .phase = TransactionPhase::NR_NULLIFIER_INSERTION,
                             .prev_tree_state = prev_tree_state,
                             .next_tree_state = next_tree_state,
                             .event = PrivateAppendTreeEvent{ .leaf_value = nullifier } });
        prev_tree_state = next_tree_state;
    }

    // 2. Write already unique note hashes.
    for (const auto& siloed_note_hash : tx.nonRevertibleAccumulatedData.noteHashes) {
        merkle_db.note_hash_write(siloed_note_hash);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxEvent{ .phase = TransactionPhase::NR_NOTE_INSERTION,
                             .prev_tree_state = prev_tree_state,
                             .next_tree_state = next_tree_state,
                             .event = PrivateAppendTreeEvent{ .leaf_value = siloed_note_hash } });
        prev_tree_state = next_tree_state;
    }

    // 3. Write l2_l1 messages
    for (const auto& l2_to_l1_msg : tx.nonRevertibleAccumulatedData.l2ToL1Messages) {
        // Tree state does not change when writing L2 to L1 messages.
        auto tree_state = merkle_db.get_tree_state();
        events.emit(TxEvent{ .phase = TransactionPhase::NR_L2_TO_L1_MESSAGE,
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
        merkle_db.nullifier_write(siloed_nullifier);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxEvent{ .phase = TransactionPhase::R_NULLIFIER_INSERTION,
                             .prev_tree_state = prev_tree_state,
                             .next_tree_state = next_tree_state,
                             .event = PrivateAppendTreeEvent{ .leaf_value = siloed_nullifier } });
        prev_tree_state = next_tree_state;
    }

    // 2. Write the note hashes
    for (const auto& note_hash : tx.revertibleAccumulatedData.noteHashes) {
        // todo: this silo/unique-fying needs to be constrained  by the avm. (#14544)
        // This is guaranteed to not fail by a private kernel, otherwise we can't prove
        FF first_nullifier = tx.revertibleAccumulatedData.nullifiers[0];
        uint32_t num_note_hash_emitted = prev_tree_state.noteHashTree.counter;
        auto note_hash_nonce = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
            { GENERATOR_INDEX__NOTE_HASH_NONCE, first_nullifier, num_note_hash_emitted });
        auto siloedNoteHash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
            { GENERATOR_INDEX__UNIQUE_NOTE_HASH, note_hash_nonce, note_hash });
        merkle_db.note_hash_write(siloedNoteHash);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxEvent{ .phase = TransactionPhase::R_NOTE_INSERTION,
                             .prev_tree_state = prev_tree_state,
                             .next_tree_state = next_tree_state,
                             .event = PrivateAppendTreeEvent{ .leaf_value = note_hash } });
        prev_tree_state = next_tree_state;
    }

    // 3. Write L2 to L1 messages.
    for (const auto& l2_to_l1_msg : tx.revertibleAccumulatedData.l2ToL1Messages) {
        // Tree state does not change when writing L2 to L1 messages.
        auto tree_state = merkle_db.get_tree_state();
        events.emit(TxEvent{ .phase = TransactionPhase::R_L2_TO_L1_MESSAGE,
                             .prev_tree_state = tree_state,
                             .next_tree_state = tree_state,
                             .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_msg } });
    }
}

} // namespace bb::avm2::simulation
