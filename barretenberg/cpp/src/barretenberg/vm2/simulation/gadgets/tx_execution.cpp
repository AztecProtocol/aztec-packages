#include "barretenberg/vm2/simulation/gadgets/tx_execution.hpp"

#include <cstdint>
#include <stdexcept>

#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2::simulation {
namespace {

// A tx-level exception that is expected to be handled.
// This is in contrast to other runtime exceptions that might happen and should be propagated.
// Note however that we re-throw unrecoverable errors of this type (exceptions thrown in insert_non_revertibles()).
class TxExecutionException : public std::runtime_error {
  public:
    TxExecutionException(const std::string& message)
        : std::runtime_error(message)
    {}
};

} // namespace

/**
 * @brief Simulates the entire transaction execution phases.
 *
 * There are multiple distinct transaction phases that are executed in order:
 *
 * - Non-revertible insertions:
 *   - nullifiers (0)
 *   - note hashes (1)
 *   - L2 to L1 messages (2)
 * - Setup phase (3), where the setup enqueued calls are executed.
 * - Revertible insertions:
 *   - nullifiers (4)
 *   - note hashes (5)
 *   - L2 to L1 messages (6)
 * - App logic phase (7), where the app logic enqueued calls are executed.
 * - Teardown phase (8), where the teardown enqueued call is executed.
 * - Collect Gas fee (9)
 * - Tree padding (10)
 * - Cleanup (11)
 *
 * If a an error occurs during non-revertible insertions or a Setup phase enqueued call fails,
 * the transaction is considered unprovable and an unrecoverable TxExecutionException is thrown.
 * If an error occurs during revertible insertions or App logic phase, all the state changes are reverted
 * to the post-setup state and we continue with the Teardown phase.
 * If an error occurs during Teardown phase, all the state changes are reverted to the post-setup state and
 * we continue with the Collect Gas fee phase.
 *
 * The phase values and their order are reflected in the enum TransactionPhase in aztec_types.hpp.
 * These values are emitted as part of the TxPhaseEvent.
 *
 * @param tx The transaction to simulate.
 * @return The result of the transaction simulation.
 * @throws TxExecutionException if
 *         - there is a nullifier collision or the maximum number of
 *           nullifiers, note hashes, or l2_to_l1 messages is reached as part of the non-revertible insertions.
 *         - a Setup phase enqueued call fails.
 *         - the fee payer does not have enough balance to pay the fee.
 * Note: Other low-level exceptions of other types are not caught and will be thrown.
 */
TxExecutionResult TxExecution::simulate(const Tx& tx)
{
    const Gas& gas_limit = tx.gas_settings.gas_limits;
    const Gas& teardown_gas_limit = tx.gas_settings.teardown_gas_limits;
    tx_context.gas_used = tx.gas_used_by_private;

    // NOTE: This vector will be populated with one CallStackMetadata per app logic enqueued call.
    // IMPORTANT: The nesting will only be 1 level deep! You will get one result per enqueued call
    // but no information about nested calls. This can be added later.
    std::vector<CallStackMetadata> app_logic_return_values;

    events.emit(TxStartupEvent{
        .state = tx_context.serialize_tx_context_event(),
        .gas_limit = gas_limit,
        .teardown_gas_limit = teardown_gas_limit,
        .phase_lengths = PhaseLengths::from_tx(tx), // extract lengths of each phase at start
    });

    vinfo("Simulating tx ",
          tx.hash,
          " with ",
          tx.setup_enqueued_calls.size(),
          " setup enqueued calls, ",
          tx.app_logic_enqueued_calls.size(),
          " app logic enqueued calls, and ",
          tx.teardown_enqueued_call.has_value() ? "1 teardown enqueued call" : "no teardown enqueued call");

    // Insert non-revertibles. This can throw if there is a nullifier collision or the maximum number of
    // nullifiers, note hashes, or l2_to_l1 messages is reached.
    // That would result in an unprovable tx.
    insert_non_revertibles(tx);

    // Setup.
    if (tx.setup_enqueued_calls.empty()) {
        emit_empty_phase(TransactionPhase::SETUP);
    } else {
        for (const auto& call : tx.setup_enqueued_calls) {
            vinfo("[SETUP] Executing enqueued call to ",
                  call.request.contract_address,
                  "::",
                  get_debug_function_name(call.request.contract_address, call.calldata));
            const TxContextEvent state_before = tx_context.serialize_tx_context_event();
            const Gas start_gas =
                tx_context.gas_used; // Do not use a const reference as tx_context.gas_used will be modified.
            auto context = context_provider.make_enqueued_context(call.request.contract_address,
                                                                  call.request.msg_sender,
                                                                  /*transaction_fee=*/FF(0),
                                                                  call.calldata,
                                                                  call.request.is_static_call,
                                                                  gas_limit,
                                                                  start_gas,
                                                                  TransactionPhase::SETUP);
            // This call should not throw unless it's an unexpected unrecoverable failure.
            EnqueuedCallResult result = call_execution.execute(std::move(context));
            tx_context.gas_used = result.gas_used;
            emit_public_call_request(call,
                                     TransactionPhase::SETUP,
                                     /*transaction_fee=*/FF(0),
                                     result.success,
                                     start_gas,
                                     tx_context.gas_used,
                                     state_before,
                                     tx_context.serialize_tx_context_event());
            if (!result.success) {
                // This will result in an unprovable tx.
                throw TxExecutionException(
                    format("[SETUP] UNRECOVERABLE ERROR! Enqueued call to ", call.request.contract_address, " failed"));
            }
        }
    }

    // The checkpoint we should go back to if anything from now on reverts.
    merkle_db.create_checkpoint();
    contract_db.create_checkpoint();

    try {
        // Insert revertibles. This can throw if there is a nullifier collision.
        // Such an exception should be handled and the tx be provable.
        insert_revertibles(tx);

        // App logic.
        if (tx.app_logic_enqueued_calls.empty()) {
            emit_empty_phase(TransactionPhase::APP_LOGIC);
        } else {
            for (const auto& call : tx.app_logic_enqueued_calls) {
                vinfo("[APP_LOGIC] Executing enqueued call to ",
                      call.request.contract_address,
                      "::",
                      get_debug_function_name(call.request.contract_address, call.calldata));
                const TxContextEvent state_before = tx_context.serialize_tx_context_event();
                const Gas start_gas =
                    tx_context.gas_used; // Do not use a const reference as tx_context.gas_used will be modified.
                auto context = context_provider.make_enqueued_context(call.request.contract_address,
                                                                      call.request.msg_sender,
                                                                      /*transaction_fee=*/FF(0),
                                                                      call.calldata,
                                                                      call.request.is_static_call,
                                                                      gas_limit,
                                                                      start_gas,
                                                                      TransactionPhase::APP_LOGIC);
                // This call should not throw unless it's an unexpected unrecoverable failure.
                EnqueuedCallResult result = call_execution.execute(std::move(context));
                tx_context.gas_used = result.gas_used;

                if (collect_call_metadata) {
                    app_logic_return_values.push_back(
                        CallStackMetadata{ .calldata = call.calldata, .values = std::move(result.output) });
                }

                emit_public_call_request(call,
                                         TransactionPhase::APP_LOGIC,
                                         /*transaction_fee=*/FF(0),
                                         result.success,
                                         start_gas,
                                         tx_context.gas_used,
                                         state_before,
                                         tx_context.serialize_tx_context_event());
                if (!result.success) {
                    // This exception should be handled and the tx be provable.
                    throw TxExecutionException(
                        format("[APP_LOGIC] Enqueued call to ", call.request.contract_address, " failed"));
                }
            }
        }
    } catch (const TxExecutionException& e) {
        vinfo("Revertible failure while simulating tx ", tx.hash, ": ", e.what());
        tx_context.revert_code = RevertCode::APP_LOGIC_REVERTED;
        // We revert to the post-setup state.
        merkle_db.revert_checkpoint();
        contract_db.revert_checkpoint();
        // But we also create a new fork so that the teardown phase can transparently
        // commit or rollback to the end of teardown.
        merkle_db.create_checkpoint();
        contract_db.create_checkpoint();
    }

    // Compute the transaction fee here so it can be passed to teardown
    const uint128_t& fee_per_da_gas = tx.effective_gas_fees.fee_per_da_gas;
    const uint128_t& fee_per_l2_gas = tx.effective_gas_fees.fee_per_l2_gas;
    const FF fee =
        FF(fee_per_da_gas) * FF(tx_context.gas_used.da_gas) + FF(fee_per_l2_gas) * FF(tx_context.gas_used.l2_gas);
    Gas gas_used_by_teardown = { 0, 0 };

    // Teardown.
    try {
        if (!tx.teardown_enqueued_call.has_value()) {
            emit_empty_phase(TransactionPhase::TEARDOWN);
        } else {
            const auto& teardown_enqueued_call = tx.teardown_enqueued_call.value();
            vinfo("[TEARDOWN] Executing enqueued call to ",
                  teardown_enqueued_call.request.contract_address,
                  "::",
                  get_debug_function_name(teardown_enqueued_call.request.contract_address,
                                          teardown_enqueued_call.calldata));
            // Teardown has its own gas limit and usage.
            constexpr Gas start_gas = { 0, 0 };
            const TxContextEvent state_before = tx_context.serialize_tx_context_event();
            auto context = context_provider.make_enqueued_context(teardown_enqueued_call.request.contract_address,
                                                                  teardown_enqueued_call.request.msg_sender,
                                                                  fee,
                                                                  teardown_enqueued_call.calldata,
                                                                  teardown_enqueued_call.request.is_static_call,
                                                                  teardown_gas_limit,
                                                                  start_gas,
                                                                  TransactionPhase::TEARDOWN);
            // This call should not throw unless it's an unexpected unrecoverable failure.
            EnqueuedCallResult result = call_execution.execute(std::move(context));
            gas_used_by_teardown = result.gas_used;
            emit_public_call_request(teardown_enqueued_call,
                                     TransactionPhase::TEARDOWN,
                                     fee,
                                     result.success,
                                     start_gas,
                                     result.gas_used,
                                     state_before,
                                     tx_context.serialize_tx_context_event());
            if (!result.success) {
                // This exception should be handled and the tx be provable.
                throw TxExecutionException(
                    format("[TEARDOWN] Enqueued call to ", teardown_enqueued_call.request.contract_address, " failed"));
            }
        }

        // We commit the forked state and we are done.
        merkle_db.commit_checkpoint();
        contract_db.commit_checkpoint();
    } catch (const TxExecutionException& e) {
        info("Teardown failure while simulating tx ", tx.hash, ": ", e.what());
        tx_context.revert_code = tx_context.revert_code == RevertCode::APP_LOGIC_REVERTED
                                     ? RevertCode::BOTH_REVERTED
                                     : RevertCode::TEARDOWN_REVERTED;
        // We rollback to the post-setup state.
        merkle_db.revert_checkpoint();
        contract_db.revert_checkpoint();
    }

    // Fee payment
    pay_fee(tx.fee_payer, fee, fee_per_da_gas, fee_per_l2_gas);

    pad_trees();

    cleanup();

    return {
        .gas_used = {
            // Follows PublicTxContext.getActualGasUsed()
            .total_gas = tx_context.gas_used + (tx.teardown_enqueued_call ? (gas_used_by_teardown - teardown_gas_limit) : Gas {0, 0}),
            .teardown_gas = gas_used_by_teardown,
            // Follows PublicTxContext.getActualPublicGasUsed()
            .public_gas = tx_context.gas_used + gas_used_by_teardown - tx.gas_used_by_private,
            // Follows PublicTxContext.getTotalGasUsed()
            .billed_gas = tx_context.gas_used,
        },
        .revert_code = tx_context.revert_code,
        .transaction_fee = fee,
        .app_logic_return_values = std::move(app_logic_return_values),
    };
}

/**
 * @brief Handle a public call request and emit an TxPhaseEvent event with
 *        the embedded event type EnqueuedCallEvent.
 *
 * @param call The public call request with calldata.
 * @param phase The phase in which the call is executed.
 * @param transaction_fee The transaction fee to be paid.
 * @param success Whether the call succeeded.
 * @param start_gas The gas used at the start of the call.
 * @param end_gas The gas used at the end of the call.
 * @param state_before The state before the call.
 * @param state_after The state after the call.
 */
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
                                  .msg_sender = call.request.msg_sender,
                                  .contract_address = call.request.contract_address,
                                  .transaction_fee = transaction_fee,
                                  .is_static = call.request.is_static_call,
                                  .calldata_size = static_cast<uint32_t>(call.calldata.size()),
                                  .calldata_hash = call.request.calldata_hash,
                                  .start_gas = start_gas,
                                  .end_gas = end_gas,
                                  .success = success,
                              } });
}

/**
 * @brief Handle a nullifier insertion and emit a TxPhaseEvent event with
 *        the embedded event type PrivateAppendTreeEvent.
 *
 * @param revertible Whether the nullifier is revertible.
 * @param nullifier The nullifier to insert.
 * @throws TxExecutionException if the maximum number of nullifiers is reached or a nullifier collision occurs.
 */
void TxExecution::emit_nullifier(bool revertible, const FF& nullifier)
{
    const TransactionPhase phase =
        revertible ? TransactionPhase::R_NULLIFIER_INSERTION : TransactionPhase::NR_NULLIFIER_INSERTION;
    const TxContextEvent state_before = tx_context.serialize_tx_context_event();
    try {
        uint32_t prev_nullifier_count = merkle_db.get_tree_state().nullifier_tree.counter;

        if (prev_nullifier_count == MAX_NULLIFIERS_PER_TX) {
            throw TxExecutionException("Maximum number of nullifiers reached");
        }

        try {
            merkle_db.siloed_nullifier_write(nullifier);
        } catch (const NullifierCollisionException& e) {
            throw TxExecutionException(e.what());
        }

        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .reverted = false,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = nullifier } });

    } catch (const TxExecutionException& e) {
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

/**
 * @brief Handle a note hash insertion and emit a TxPhaseEvent event with
 *        the embedded event type PrivateAppendTreeEvent.
 *
 * @param revertible Whether the note hash is revertible.
 * @param note_hash The note hash to insert. If revertible, it is siloed but not unique. Otherwise, it is unique.
 * @throws TxExecutionException if the maximum number of note hashes is reached.
 */
void TxExecution::emit_note_hash(bool revertible, const FF& note_hash)
{
    const TransactionPhase phase =
        revertible ? TransactionPhase::R_NOTE_INSERTION : TransactionPhase::NR_NOTE_INSERTION;
    const TxContextEvent state_before = tx_context.serialize_tx_context_event();

    try {
        uint32_t prev_note_hash_count = merkle_db.get_tree_state().note_hash_tree.counter;

        if (prev_note_hash_count == MAX_NOTE_HASHES_PER_TX) {
            throw TxExecutionException("Maximum number of note hashes reached");
        }

        if (revertible) {
            merkle_db.siloed_note_hash_write(note_hash);
        } else {
            merkle_db.unique_note_hash_write(note_hash);
        }

        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .reverted = false,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = note_hash } });
    } catch (const TxExecutionException& e) {
        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .reverted = true,
                                  .event = PrivateAppendTreeEvent{ .leaf_value = note_hash } });
        // Rethrow the error
        throw e;
    }
}

/**
 * @brief Handle a L2 to L1 message insertion and emit a TxPhaseEvent event with the embedded event type
 * PrivateEmitL2L1MessageEvent. The side effect tracker is used to track the L2 to L1 messages.
 *
 * @param revertible Whether the L2 to L1 message is revertible.
 * @param l2_to_l1_message The L2 to L1 message to insert.
 * @throws TxExecutionException if the maximum number of L2 to L1 messages is reached.
 */
void TxExecution::emit_l2_to_l1_message(bool revertible, const ScopedL2ToL1Message& l2_to_l1_message)
{
    const TransactionPhase phase =
        revertible ? TransactionPhase::R_L2_TO_L1_MESSAGE : TransactionPhase::NR_L2_TO_L1_MESSAGE;
    const TxContextEvent state_before = tx_context.serialize_tx_context_event();
    auto& side_effect_tracker = tx_context.side_effect_tracker;
    const auto& side_effects = side_effect_tracker.get_side_effects();

    try {
        if (side_effects.l2_to_l1_messages.size() == MAX_L2_TO_L1_MSGS_PER_TX) {
            throw TxExecutionException("Maximum number of L2 to L1 messages reached");
        }
        side_effect_tracker.add_l2_to_l1_message(
            l2_to_l1_message.contract_address, l2_to_l1_message.message.recipient, l2_to_l1_message.message.content);
        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .reverted = false,
                                  .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_message } });
    } catch (const TxExecutionException& e) {
        events.emit(TxPhaseEvent{ .phase = phase,
                                  .state_before = state_before,
                                  .state_after = tx_context.serialize_tx_context_event(),
                                  .reverted = true,
                                  .event = PrivateEmitL2L1MessageEvent{ .scoped_msg = l2_to_l1_message } });
        // Rethrow the error
        throw e;
    }
}

/**
 * @brief Insert the non-revertible accumulated data into the Merkle DB and emit corresponding events.
 *        It might error if the limits for number of allowable inserts are exceeded or a nullifier collision occurs,
 *        but this results in an unprovable tx.
 *
 * @param tx The transaction to insert the non-revertible accumulated data into.
 * @throws TxExecutionException if the maximum number of nullifiers, note hashes, L2 to L1 messages is reached, or a
 *         nullifier collision occurs.
 */
void TxExecution::insert_non_revertibles(const Tx& tx)
{
    vinfo("[NON_REVERTIBLE] Inserting ",
          tx.non_revertible_accumulated_data.nullifiers.size(),
          " nullifiers, ",
          tx.non_revertible_accumulated_data.note_hashes.size(),
          " note hashes, and ",
          tx.non_revertible_accumulated_data.l2_to_l1_messages.size(),
          " L2 to L1 messages for tx ",
          tx.hash);

    // 1. Write the already siloed nullifiers.
    if (tx.non_revertible_accumulated_data.nullifiers.empty()) {
        emit_empty_phase(TransactionPhase::NR_NULLIFIER_INSERTION);
    } else {
        for (const auto& nullifier : tx.non_revertible_accumulated_data.nullifiers) {
            emit_nullifier(false, nullifier);
        }
    }

    // 2. Write already unique note hashes.
    if (tx.non_revertible_accumulated_data.note_hashes.empty()) {
        emit_empty_phase(TransactionPhase::NR_NOTE_INSERTION);
    } else {
        for (const auto& unique_note_hash : tx.non_revertible_accumulated_data.note_hashes) {
            emit_note_hash(false, unique_note_hash);
        }
    }

    // 3. Write l2_l1 messages
    if (tx.non_revertible_accumulated_data.l2_to_l1_messages.empty()) {
        emit_empty_phase(TransactionPhase::NR_L2_TO_L1_MESSAGE);
    } else {
        for (const auto& l2_to_l1_msg : tx.non_revertible_accumulated_data.l2_to_l1_messages) {
            emit_l2_to_l1_message(false, l2_to_l1_msg);
        }
    }

    // Add new contracts to the contracts DB so that their code may be found and called
    contract_db.add_contracts(tx.non_revertible_contract_deployment_data);
}

/**
 * @brief Insert the revertible accumulated data into the Merkle DB and emit corresponding events.
 *        It might error if the limits for number of allowable inserts are exceeded or a nullifier collision occurs.
 *
 * @param tx The transaction to insert the revertible accumulated data into.
 * @throws TxExecutionException if the maximum number of nullifiers, note hashes, L2 to L1 messages is reached, or a
 *         nullifier collision occurs.
 */
void TxExecution::insert_revertibles(const Tx& tx)
{
    vinfo("[REVERTIBLE] Inserting ",
          tx.revertible_accumulated_data.nullifiers.size(),
          " nullifiers, ",
          tx.revertible_accumulated_data.note_hashes.size(),
          " note hashes, and ",
          tx.revertible_accumulated_data.l2_to_l1_messages.size(),
          " L2 to L1 messages for tx ",
          tx.hash);

    // 1. Write the already siloed nullifiers.
    if (tx.revertible_accumulated_data.nullifiers.empty()) {
        emit_empty_phase(TransactionPhase::R_NULLIFIER_INSERTION);
    } else {
        for (const auto& siloed_nullifier : tx.revertible_accumulated_data.nullifiers) {
            emit_nullifier(true, siloed_nullifier);
        }
    }

    // 2. Write the siloed non uniqued note hashes
    if (tx.revertible_accumulated_data.note_hashes.empty()) {
        emit_empty_phase(TransactionPhase::R_NOTE_INSERTION);
    } else {
        for (const auto& siloed_note_hash : tx.revertible_accumulated_data.note_hashes) {
            emit_note_hash(true, siloed_note_hash);
        }
    }

    // 3. Write L2 to L1 messages.
    if (tx.revertible_accumulated_data.l2_to_l1_messages.empty()) {
        emit_empty_phase(TransactionPhase::R_L2_TO_L1_MESSAGE);
    } else {
        for (const auto& l2_to_l1_msg : tx.revertible_accumulated_data.l2_to_l1_messages) {
            emit_l2_to_l1_message(true, l2_to_l1_msg);
        }
    }

    // Add new contracts to the contracts DB so that their functions may be found and called
    contract_db.add_contracts(tx.revertible_contract_deployment_data);
}

/**
 * @brief Pay the fee for the transaction and emit a TxPhaseEvent event with
 *        the embedded event type CollectGasFeeEvent.
 *
 * @param fee_payer The address of the fee payer.
 * @param fee The fee to be paid.
 * @param fee_per_da_gas The fee per DA gas.
 * @param fee_per_l2_gas The fee per L2 gas.
 * @throws TxExecutionException if the fee payer does not have enough balance to pay the fee.
 */
void TxExecution::pay_fee(const AztecAddress& fee_payer,
                          const FF& fee,
                          const uint128_t& fee_per_da_gas,
                          const uint128_t& fee_per_l2_gas)
{
    if (fee_payer == 0) {
        if (skip_fee_enforcement) {
            vinfo("Fee payer is 0. Skipping fee enforcement. No one is paying the fee of ", fee);
            return;
        }
        // Real transactions are enforced by private kernel to have nonzero fee payer.
        // Real transactions cannot skip fee enforcement (skipping fee enforcement makes them unprovable).
        // Unrecoverable error.
        throw TxExecutionException("Fee payer cannot be 0 unless skipping fee enforcement for simulation");
    }

    const TxContextEvent state_before = tx_context.serialize_tx_context_event();
    const FF fee_juice_balance_slot = poseidon2.hash({ FEE_JUICE_BALANCES_SLOT, fee_payer });
    FF fee_payer_balance = merkle_db.storage_read(FEE_JUICE_ADDRESS, fee_juice_balance_slot);

    if (field_gt.ff_gt(fee, fee_payer_balance)) {
        if (skip_fee_enforcement) {
            vinfo("Fee payer balance insufficient, but we're skipping fee enforcement");
            // We still proceed and perform the storage write to minimize deviation from normal execution.
            fee_payer_balance = fee;
        } else {
            // Without "skipFeeEnforcement", such transactions should be filtered by GasTxValidator.
            // Unrecoverable error.
            throw TxExecutionException("Not enough balance for fee payer to pay for transaction");
        }
    }

    merkle_db.storage_write(FEE_JUICE_ADDRESS, fee_juice_balance_slot, fee_payer_balance - fee, true);

    events.emit(TxPhaseEvent{ .phase = TransactionPhase::COLLECT_GAS_FEES,
                              .state_before = state_before,
                              .state_after = tx_context.serialize_tx_context_event(),
                              .reverted = false,
                              .event = CollectGasFeeEvent{
                                  .effective_fee_per_da_gas = fee_per_da_gas,
                                  .effective_fee_per_l2_gas = fee_per_l2_gas,
                                  .fee_payer = fee_payer,
                                  .fee_payer_balance = fee_payer_balance,
                                  .fee_juice_balance_slot = fee_juice_balance_slot,
                                  .fee = fee,
                              } });
}

/**
 * @brief Pad the note hash and nullifier trees and emit a TxPhaseEvent event with the embedded event type
 *        PadTreesEvent.
 */
void TxExecution::pad_trees()
{
    const TxContextEvent state_before = tx_context.serialize_tx_context_event();
    merkle_db.pad_trees();
    events.emit(TxPhaseEvent{ .phase = TransactionPhase::TREE_PADDING,
                              .state_before = state_before,
                              .state_after = tx_context.serialize_tx_context_event(),
                              .reverted = false,
                              .event = PadTreesEvent{} });
}

/**
 * @brief Emit a TxPhaseEvent event with the embedded event type CleanupEvent.
 *        This is used to finalize the accounting of some state changes and side effects.
 */
void TxExecution::cleanup()
{
    const TxContextEvent current_state = tx_context.serialize_tx_context_event();
    events.emit(TxPhaseEvent{ .phase = TransactionPhase::CLEANUP,
                              .state_before = current_state,
                              .state_after = current_state,
                              .reverted = false,
                              .event = CleanupEvent{} });
}

/**
 * @brief Emit a TxPhaseEvent event with the embedded event type EmptyPhaseEvent.
 *        This is used to indicate that a phase has no events but in tracegen we
 *        use it to populate a so-called padded (placeholder) row.
 *
 * @param phase The phase to emit the empty phase event for.
 */
void TxExecution::emit_empty_phase(TransactionPhase phase)
{
    const TxContextEvent current_state = tx_context.serialize_tx_context_event();
    events.emit(TxPhaseEvent{ .phase = phase,
                              .state_before = current_state,
                              .state_after = current_state,
                              .reverted = false,
                              .event = EmptyPhaseEvent{} });
}

/**
 * @brief Get the debug function name for a given contract address and calldata.
 *        This is used to get the debug function name for a given contract address and calldata.
 *
 * @param contract_address The address of the contract.
 * @param calldata The calldata of the function.
 * @return The debug function name or a placeholder string if the debug function name is not found.
 */
std::string TxExecution::get_debug_function_name(const AztecAddress& contract_address, const std::vector<FF>& calldata)
{
    // Public function is dispatched and therefore the target function is passed in the first argument.
    if (calldata.empty()) {
        return format("<calldata[0] undefined> (Contract Address: ", contract_address, ")");
    }

    const FF& selector = calldata[0];
    auto debug_name = contract_db.get_debug_function_name(contract_address, selector);

    if (debug_name.has_value()) {
        return debug_name.value();
    }

    // Return selector as hex string if debug name not found
    return format("<selector: ", selector, ">");
}

} // namespace bb::avm2::simulation
