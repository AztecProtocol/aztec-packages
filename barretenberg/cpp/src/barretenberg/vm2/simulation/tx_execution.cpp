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
                                           const Gas& start_gas,
                                           const Gas& end_gas,
                                           const TxContextEvent& state_before,
                                           const TxContextEvent& state_after)
{
    events.emit(TxPhaseEvent{ .phase = phase,
                              .state_before = state_before,
                              .state_after = state_after,
                              .reverted = !success,
                              .event = EnqueuedCallEvent{
                                  .msg_sender = call.request.msgSender,
                                  .contract_address = call.request.contractAddress,
                                  .transaction_fee = transaction_fee,
                                  .is_static = call.request.isStaticCall,
                                  .calldata_hash = call.request.calldataHash,
                                  .start_gas = start_gas,
                                  .end_gas = end_gas,
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
    Gas teardown_gas_limit = tx.gasSettings.teardownGasLimits;
    tx_context.gas_used = tx.gasUsedByPrivate;

    events.emit(TxStartupEvent{
        .state = tx_context.serialize_tx_context_event(),
        .gas_limit = gas_limit,
        .teardown_gas_limit = teardown_gas_limit,
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
        Gas start_gas = tx_context.gas_used;
        auto context = context_provider.make_enqueued_context(call.request.contractAddress,
                                                              call.request.msgSender,
                                                              /*transaction_fee=*/FF(0),
                                                              call.calldata,
                                                              call.request.isStaticCall,
                                                              gas_limit,
                                                              start_gas,
                                                              tx_context.side_effect_states,
                                                              TransactionPhase::SETUP);
        ExecutionResult result = call_execution.execute(std::move(context));
        if (!result.success) {
            throw std::runtime_error(
                format("[SETUP] UNRECOVERABLE ERROR! Enqueued call to ", call.request.contractAddress, " failed"));
        }
        tx_context.side_effect_states = result.side_effect_states;
        tx_context.gas_used = result.gas_used;
        emit_public_call_request(call,
                                 TransactionPhase::SETUP,
                                 /*transaction_fee=*/FF(0),
                                 result.success,
                                 start_gas,
                                 tx_context.gas_used,
                                 state_before,
                                 tx_context.serialize_tx_context_event());
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
            Gas start_gas = tx_context.gas_used;
            auto context = context_provider.make_enqueued_context(call.request.contractAddress,
                                                                  call.request.msgSender,
                                                                  /*transaction_fee=*/FF(0),
                                                                  call.calldata,
                                                                  call.request.isStaticCall,
                                                                  gas_limit,
                                                                  start_gas,
                                                                  tx_context.side_effect_states,
                                                                  TransactionPhase::APP_LOGIC);
            ExecutionResult result = call_execution.execute(std::move(context));
            tx_context.side_effect_states = result.side_effect_states;
            tx_context.gas_used = result.gas_used;
            emit_public_call_request(call,
                                     TransactionPhase::APP_LOGIC,
                                     /*transaction_fee=*/FF(0),
                                     result.success,
                                     start_gas,
                                     tx_context.gas_used,
                                     state_before,
                                     tx_context.serialize_tx_context_event());
            if (!result.success) {
                throw std::runtime_error(
                    format("[APP_LOGIC] Enqueued call to ", call.request.contractAddress, " failed"));
            }
        }
    } catch (const std::runtime_error& e) {
        info("Revertible failure while simulating tx ", tx.hash, ": ", e.what());
        // We revert to the post-setup state.
        merkle_db.revert_checkpoint();
        // But we also create a new fork so that the teardown phase can transparently
        // commit or rollback to the end of teardown.
        merkle_db.create_checkpoint();
    }

    // Compute the transaction fee here so it can be passed to teardown
    Gas gas_used_before_teardown = tx_context.gas_used;
    uint128_t fee_per_da_gas = tx.effectiveGasFees.feePerDaGas;
    uint128_t fee_per_l2_gas = tx.effectiveGasFees.feePerL2Gas;
    FF fee = FF(fee_per_da_gas) * FF(gas_used_before_teardown.daGas) +
             FF(fee_per_l2_gas) * FF(gas_used_before_teardown.l2Gas);

    // Teardown.
    try {
        if (tx.teardownEnqueuedCall) {
            info("[TEARDOWN] Executing enqueued call to ", tx.teardownEnqueuedCall->request.contractAddress);
            // Teardown has its own gas limit and usage.
            Gas start_gas = { 0, 0 };
            gas_limit = teardown_gas_limit;
            TxContextEvent state_before = tx_context.serialize_tx_context_event();
            auto context = context_provider.make_enqueued_context(tx.teardownEnqueuedCall->request.contractAddress,
                                                                  tx.teardownEnqueuedCall->request.msgSender,
                                                                  fee,
                                                                  tx.teardownEnqueuedCall->calldata,
                                                                  tx.teardownEnqueuedCall->request.isStaticCall,
                                                                  gas_limit,
                                                                  start_gas,
                                                                  tx_context.side_effect_states,
                                                                  TransactionPhase::TEARDOWN);
            ExecutionResult result = call_execution.execute(std::move(context));
            tx_context.side_effect_states = result.side_effect_states;
            // Check what to do here for GAS
            emit_public_call_request(*tx.teardownEnqueuedCall,
                                     // TODO(dbanks12): This should be TEARDOWN.
                                     TransactionPhase::APP_LOGIC,
                                     fee,
                                     result.success,
                                     start_gas,
                                     result.gas_used,
                                     state_before,
                                     tx_context.serialize_tx_context_event());
            if (!result.success) {
                throw std::runtime_error(format(
                    "[TEARDOWN] Enqueued call to ", tx.teardownEnqueuedCall->request.contractAddress, " failed"));
            }
        }

        // We commit the forked state and we are done.
        merkle_db.commit_checkpoint();
    } catch (const std::runtime_error& e) {
        info("Teardown failure while simulating tx ", tx.hash, ": ", e.what());
        // We rollback to the post-setup state.
        merkle_db.revert_checkpoint();
    }

    // Fee payment
    pay_fee(tx.feePayer, fee, fee_per_da_gas, fee_per_l2_gas);

    pad_trees();

    cleanup();
}

void TxExecution::emit_nullifier(bool revertible, const FF& nullifier)
{
    TransactionPhase phase =
        revertible ? TransactionPhase::R_NULLIFIER_INSERTION : TransactionPhase::NR_NULLIFIER_INSERTION;
    TxContextEvent state_before = tx_context.serialize_tx_context_event();
    try {
        uint32_t prev_nullifier_count = merkle_db.get_tree_state().nullifierTree.counter;

        if (prev_nullifier_count == MAX_NULLIFIERS_PER_TX) {
            throw std::runtime_error("Maximum number of nullifiers reached");
        }
        bool success = merkle_db.siloed_nullifier_write(nullifier);
        if (!success) {
            throw std::runtime_error("Nullifier collision");
        }

        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .event = PrivateAppendTreeEvent{ .leaf_value = nullifier } });

    } catch (const std::runtime_error& e) {
        events.emit(TxPhaseEvent{
            .phase = phase,
            .state_before = state_before,
            .state_after = tx_context.serialize_tx_context_event(),
            .reverted = true,
            .event = PrivateAppendTreeEvent{ .leaf_value = nullifier },
        });
        // Rethrow the error
        throw e;
    }
}

void TxExecution::emit_note_hash(bool revertible, const FF& note_hash)
{
    TransactionPhase phase = revertible ? TransactionPhase::R_NOTE_INSERTION : TransactionPhase::NR_NOTE_INSERTION;
    TxContextEvent state_before = tx_context.serialize_tx_context_event();

    try {
        uint32_t prev_note_hash_count = merkle_db.get_tree_state().noteHashTree.counter;

        if (prev_note_hash_count == MAX_NOTE_HASHES_PER_TX) {
            throw std::runtime_error("Maximum number of note hashes reached");
        }

        if (revertible) {
            merkle_db.siloed_note_hash_write(note_hash);
        } else {
            merkle_db.unique_note_hash_write(note_hash);
        }

        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .event = PrivateAppendTreeEvent{ .leaf_value = note_hash } });
    } catch (const std::runtime_error& e) {
        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .reverted = true,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = note_hash } });
        // Rethrow the error
        throw e;
    }
}

void TxExecution::emit_l2_to_l1_message(bool revertible, const ScopedL2ToL1Message& l2_to_l1_message)
{
    TransactionPhase phase = revertible ? TransactionPhase::R_L2_TO_L1_MESSAGE : TransactionPhase::NR_L2_TO_L1_MESSAGE;
    TxContextEvent state_before = tx_context.serialize_tx_context_event();

    try {
        if (tx_context.side_effect_states.numL2ToL1Messages == MAX_L2_TO_L1_MSGS_PER_TX) {
            throw std::runtime_error("Maximum number of L2 to L1 messages reached");
        }
        // TODO: We don't store the l2 to l1 message in the context since it's not needed until cpp has to generate
        // public inputs.
        tx_context.side_effect_states.numL2ToL1Messages++;
        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_message } });
    } catch (const std::runtime_error& e) {
        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .reverted = true,
                                  .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_message } });
        // Rethrow the error
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

    // 1. Write the already siloed nullifiers.
    for (const auto& nullifier : tx.nonRevertibleAccumulatedData.nullifiers) {
        emit_nullifier(false, nullifier);
    }

    // 2. Write already unique note hashes.
    for (const auto& unique_note_hash : tx.nonRevertibleAccumulatedData.noteHashes) {
        emit_note_hash(false, unique_note_hash);
    }

    // 3. Write l2_l1 messages
    for (const auto& l2_to_l1_msg : tx.nonRevertibleAccumulatedData.l2ToL1Messages) {
        emit_l2_to_l1_message(false, l2_to_l1_msg);
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

    // 1. Write the already siloed nullifiers.
    for (const auto& siloed_nullifier : tx.revertibleAccumulatedData.nullifiers) {
        emit_nullifier(true, siloed_nullifier);
    }

    // 2. Write the siloed non uniqued note hashes
    for (const auto& siloed_note_hash : tx.revertibleAccumulatedData.noteHashes) {
        emit_note_hash(true, siloed_note_hash);
    }

    // 3. Write L2 to L1 messages.
    for (const auto& l2_to_l1_msg : tx.revertibleAccumulatedData.l2ToL1Messages) {
        emit_l2_to_l1_message(true, l2_to_l1_msg);
    }
}

void TxExecution::pay_fee(const FF& fee_payer,
                          const FF& fee,
                          const uint128_t& fee_per_da_gas,
                          const uint128_t& fee_per_l2_gas)
{
    TxContextEvent state_before = tx_context.serialize_tx_context_event();

    FF fee_juice_balance_slot = poseidon2.hash({ FEE_JUICE_BALANCES_SLOT, fee_payer });

    FF fee_payer_balance = merkle_db.storage_read(FEE_JUICE_ADDRESS, fee_juice_balance_slot);

    if (field_gt.ff_gt(fee, fee_payer_balance)) {
        // Unrecoverable error.
        throw std::runtime_error("Not enough balance for fee payer to pay for transaction");
    }

    merkle_db.storage_write(FEE_JUICE_ADDRESS, fee_juice_balance_slot, fee_payer_balance - fee, true);

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

void TxExecution::pad_trees()
{
    TxContextEvent state_before = tx_context.serialize_tx_context_event();
    merkle_db.pad_trees();
    events.emit(TxPhaseEvent{ .phase = TransactionPhase::TREE_PADDING,
                              .state_before = state_before,
                              .state_after = tx_context.serialize_tx_context_event(),
                              .event = PadTreesEvent{} });
}

void TxExecution::cleanup()
{
    events.emit(TxPhaseEvent{ .phase = TransactionPhase::CLEANUP,
                              .state_before = tx_context.serialize_tx_context_event(),
                              .state_after = tx_context.serialize_tx_context_event(),
                              .event = CleanupEvent{} });
}

} // namespace bb::avm2::simulation
