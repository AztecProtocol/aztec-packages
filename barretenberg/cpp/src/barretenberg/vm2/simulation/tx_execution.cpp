#include "barretenberg/vm2/simulation/tx_execution.hpp"

#include <algorithm>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"

namespace bb::avm2::simulation {

void TxExecution::emit_public_call_request(ContextInterface& context,
                                           const ExecutionResult& result,
                                           TreeStates&& prev_tree_state,
                                           Gas prev_gas,
                                           TransactionPhase phase)
{
    events.emit(TxEvent{ .phase = phase,
                         .prev_tree_state = std::move(prev_tree_state),
                         .next_tree_state = merkle_db.get_tree_state(),
                         .prev_gas_used = prev_gas,
                         .gas_used = context.get_gas_used(),
                         .gas_limit = context.get_gas_limit(),
                         .event = EnqueuedCallEvent{
                             .msg_sender = context.get_msg_sender(),
                             .contract_address = context.get_address(),
                             .is_static = context.get_is_static(),
                             .calldata_hash = FF(0), // TODO: This should be the hash of the calldata
                             .success = result.success,
                         } });
}

void TxExecution::emit_private_append_tree(
    const FF& leaf_value, uint64_t size, TreeStates&& prev_tree_state, Gas gas, Gas gas_limit, TransactionPhase phase)
{
    events.emit(TxEvent{
        .phase = phase,
        .prev_tree_state = std::move(prev_tree_state),
        .next_tree_state = merkle_db.get_tree_state(),
        .prev_gas_used = gas,
        .gas_used = gas, // No gas used for private append tree events
        .gas_limit = gas_limit,
        .event =
            PrivateAppendTreeEvent{
                .leaf_value = leaf_value,
                .size = size,
            },
    });
}

// Simulates the entire transaction execution phases.
// There are multiple distinct transaction phases that are executed in order:
// (1) Non-revertible insertions of nullifiers, note hashes, and L2 to L1 messages.
// (2) Setup phase, where the setup enqueued calls are executed.
// (3) Revertible insertions of nullifiers, note hashes, and L2 to L1 messages.
// (4) App logic phase, where the app logic enqueued calls are executed.
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
            emit_public_call_request(*context, result, std::move(prev_tree_state), gas_used, TransactionPhase::SETUP);
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
                    *context, result, std::move(prev_tree_state), gas_used, TransactionPhase::APP_LOGIC);
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
                emit_public_call_request(
                    *context, result, std::move(prev_tree_state), Gas{ 0, 0 }, TransactionPhase::TEARDOWN);
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

// TODO: How to increment the context id here?
void TxExecution::insert_non_revertibles(const Tx& tx)
{
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
    for (const auto& note_hash : tx.nonRevertibleAccumulatedData.noteHashes) {
        merkle_db.note_hash_write(note_hash);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxEvent{ .phase = TransactionPhase::NR_NOTE_INSERTION,
                             .prev_tree_state = prev_tree_state,
                             .next_tree_state = next_tree_state,
                             .event = PrivateAppendTreeEvent{ .leaf_value = note_hash } });
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
    auto prev_tree_state = merkle_db.get_tree_state();
    // 1. Write the already siloed nullifiers.
    for (const auto& nullifier : tx.revertibleAccumulatedData.nullifiers) {
        merkle_db.nullifier_write(nullifier);

        auto next_tree_state = merkle_db.get_tree_state();
        events.emit(TxEvent{ .phase = TransactionPhase::R_NULLIFIER_INSERTION,
                             .prev_tree_state = prev_tree_state,
                             .next_tree_state = next_tree_state,
                             .event = PrivateAppendTreeEvent{ .leaf_value = nullifier } });
        prev_tree_state = next_tree_state;
    }
    // 2. Write the note hashes
    // todo: these need to be siloed/unique-fied by the avm. (#14544)
    for (const auto& note_hash : tx.revertibleAccumulatedData.noteHashes) {
        merkle_db.note_hash_write(note_hash);

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
