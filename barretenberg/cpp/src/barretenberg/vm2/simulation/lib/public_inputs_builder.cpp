#include "barretenberg/vm2/simulation/lib/public_inputs_builder.hpp"

#include <ranges>

namespace bb::avm2::simulation {

PublicInputsBuilder& PublicInputsBuilder::extract_inputs(const Tx& tx,
                                                         const GlobalVariables& global_variables,
                                                         const ProtocolContracts& protocol_contracts,
                                                         const FF& prover_id,
                                                         const LowLevelMerkleDBInterface& merkle_db)
{
    public_inputs_.global_variables = global_variables;
    public_inputs_.protocol_contracts = protocol_contracts;
    public_inputs_.prover_id = prover_id;
    public_inputs_.start_gas_used = tx.gas_used_by_private;
    public_inputs_.gas_settings = tx.gas_settings;
    public_inputs_.effective_gas_fees = tx.effective_gas_fees;
    public_inputs_.fee_payer = tx.fee_payer;
    public_inputs_.start_tree_snapshots = merkle_db.get_tree_roots();

    ///////////////////////////////////////////////////////////
    // Public Call Requests.
    ///////////////////////////////////////////////////////////
    public_inputs_.public_call_request_array_lengths = {
        .setup_calls = static_cast<uint32_t>(tx.setup_enqueued_calls.size()),
        .app_logic_calls = static_cast<uint32_t>(tx.app_logic_enqueued_calls.size()),
        .teardown_call = tx.teardown_enqueued_call.has_value(),
    };
    // The protocol does not allow this, but from the TX object PoV the size could be larger.
    // Therefore we keep this check. We also keep it as an exception because it's not
    // expensive to check and it allows for a more informative error message.
    if (tx.setup_enqueued_calls.size() > MAX_ENQUEUED_CALLS_PER_TX ||
        tx.app_logic_enqueued_calls.size() > MAX_ENQUEUED_CALLS_PER_TX) {
        throw std::runtime_error(
            "Too many enqueued calls. Setup calls: " + std::to_string(tx.setup_enqueued_calls.size()) +
            ", App logic calls: " + std::to_string(tx.app_logic_enqueued_calls.size()));
    }

    std::ranges::transform(tx.setup_enqueued_calls.begin(),
                           tx.setup_enqueued_calls.end(),
                           public_inputs_.public_setup_call_requests.begin(),
                           [](const auto& call) { return call.request; });
    std::ranges::transform(tx.app_logic_enqueued_calls,
                           public_inputs_.public_app_logic_call_requests.begin(),
                           [](const auto& call) { return call.request; });

    // If there is a teardown call, set it. Otherwise it will be full of zeroes.
    if (tx.teardown_enqueued_call.has_value()) {
        public_inputs_.public_teardown_call_request = tx.teardown_enqueued_call.value().request;
    }

    ///////////////////////////////////////////////////////////
    // Side effects from private.
    ///////////////////////////////////////////////////////////

    // Note that the side effects that come from private, both revertible and non-revertible,
    // need to be in the `**previous**(Non)RevertibleAccumulatedData` part of the public inputs.
    // This is irrespective of whether they end up inserted, or reverted in the actual execution.

    // Non-revertible.
    public_inputs_.previous_non_revertible_accumulated_data_array_lengths = {
        .note_hashes = static_cast<uint32_t>(tx.non_revertible_accumulated_data.note_hashes.size()),
        .nullifiers = static_cast<uint32_t>(tx.non_revertible_accumulated_data.nullifiers.size()),
        .l2_to_l1_msgs = static_cast<uint32_t>(tx.non_revertible_accumulated_data.l2_to_l1_messages.size()),
    };
    // The protocol does not allow this, but from the TX object PoV the size could be larger.
    // Therefore we keep this check. We also keep it as an exception because it's not
    // expensive to check and it allows for a more informative error message.
    if (tx.non_revertible_accumulated_data.note_hashes.size() > MAX_NOTE_HASHES_PER_TX ||
        tx.non_revertible_accumulated_data.nullifiers.size() > MAX_NULLIFIERS_PER_TX ||
        tx.non_revertible_accumulated_data.l2_to_l1_messages.size() > MAX_L2_TO_L1_MSGS_PER_TX) {
        throw std::runtime_error(
            "Too many non-revertible side effects from private. Note hashes: " +
            std::to_string(tx.non_revertible_accumulated_data.note_hashes.size()) +
            ", Nullifiers: " + std::to_string(tx.non_revertible_accumulated_data.nullifiers.size()) +
            ", L2 to L1 messages: " + std::to_string(tx.non_revertible_accumulated_data.l2_to_l1_messages.size()));
    }

    std::ranges::copy(tx.non_revertible_accumulated_data.note_hashes,
                      public_inputs_.previous_non_revertible_accumulated_data.note_hashes.begin());
    std::ranges::copy(tx.non_revertible_accumulated_data.nullifiers,
                      public_inputs_.previous_non_revertible_accumulated_data.nullifiers.begin());
    std::ranges::copy(tx.non_revertible_accumulated_data.l2_to_l1_messages,
                      public_inputs_.previous_non_revertible_accumulated_data.l2_to_l1_msgs.begin());

    // Revertible.
    public_inputs_.previous_revertible_accumulated_data_array_lengths = {
        .note_hashes = static_cast<uint32_t>(tx.revertible_accumulated_data.note_hashes.size()),
        .nullifiers = static_cast<uint32_t>(tx.revertible_accumulated_data.nullifiers.size()),
        .l2_to_l1_msgs = static_cast<uint32_t>(tx.revertible_accumulated_data.l2_to_l1_messages.size()),
    };
    // The protocol does not allow this, but from the TX object PoV the size could be larger.
    // Therefore we keep this check. We also keep it as an exception because it's not
    // expensive to check and it allows for a more informative error message.
    if (tx.revertible_accumulated_data.note_hashes.size() > MAX_NOTE_HASHES_PER_TX ||
        tx.revertible_accumulated_data.nullifiers.size() > MAX_NULLIFIERS_PER_TX ||
        tx.revertible_accumulated_data.l2_to_l1_messages.size() > MAX_L2_TO_L1_MSGS_PER_TX) {
        throw std::runtime_error(
            "Too many revertible side effects from private. Note hashes: " +
            std::to_string(tx.revertible_accumulated_data.note_hashes.size()) +
            ", Nullifiers: " + std::to_string(tx.revertible_accumulated_data.nullifiers.size()) +
            ", L2 to L1 messages: " + std::to_string(tx.revertible_accumulated_data.l2_to_l1_messages.size()));
    }

    std::ranges::copy(tx.revertible_accumulated_data.note_hashes,
                      public_inputs_.previous_revertible_accumulated_data.note_hashes.begin());
    std::ranges::copy(tx.revertible_accumulated_data.nullifiers,
                      public_inputs_.previous_revertible_accumulated_data.nullifiers.begin());
    std::ranges::copy(tx.revertible_accumulated_data.l2_to_l1_messages,
                      public_inputs_.previous_revertible_accumulated_data.l2_to_l1_msgs.begin());

    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::extract_outputs(const LowLevelMerkleDBInterface& merkle_db,
                                                          const Gas& end_gas_used,
                                                          const FF& transaction_fee,
                                                          const bool reverted,
                                                          const TrackedSideEffects& side_effects)
{
    public_inputs_.end_tree_snapshots = merkle_db.get_tree_roots();
    public_inputs_.end_gas_used = end_gas_used;
    public_inputs_.transaction_fee = transaction_fee;
    public_inputs_.reverted = reverted;

    ///////////////////////////////////////////////////////////
    // accumulated_data_array_lengths.
    ///////////////////////////////////////////////////////////
    public_inputs_.accumulated_data_array_lengths = {
        .note_hashes = static_cast<uint32_t>(side_effects.note_hashes.size()),
        .nullifiers = static_cast<uint32_t>(side_effects.nullifiers.size()),
        .l2_to_l1_msgs = static_cast<uint32_t>(side_effects.l2_to_l1_messages.size()),
        .public_data_writes = static_cast<uint32_t>(side_effects.storage_writes_slot_to_value.size()),
    };
    // If this happens, it's a bug in our code. We keep it as an exception because it's not
    // expensive to check and it allows for a more informative error message.
    if (side_effects.note_hashes.size() > MAX_NOTE_HASHES_PER_TX ||
        side_effects.nullifiers.size() > MAX_NULLIFIERS_PER_TX ||
        side_effects.l2_to_l1_messages.size() > MAX_L2_TO_L1_MSGS_PER_TX ||
        side_effects.storage_writes_slot_to_value.size() > MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
        throw std::runtime_error(
            "Too many side effects. Note hashes: " + std::to_string(side_effects.note_hashes.size()) +
            ", Nullifiers: " + std::to_string(side_effects.nullifiers.size()) +
            ", L2 to L1 messages: " + std::to_string(side_effects.l2_to_l1_messages.size()) +
            ", Storage writes: " + std::to_string(side_effects.storage_writes_slot_to_value.size()));
    }

    ///////////////////////////////////////////////////////////
    // accumulated_data.
    ///////////////////////////////////////////////////////////
    std::ranges::copy(side_effects.note_hashes, public_inputs_.accumulated_data.note_hashes.begin());
    std::ranges::copy(side_effects.nullifiers, public_inputs_.accumulated_data.nullifiers.begin());
    std::ranges::copy(side_effects.l2_to_l1_messages, public_inputs_.accumulated_data.l2_to_l1_msgs.begin());
    public_inputs_.accumulated_data.public_logs = side_effects.public_logs;
    // We need to copy the storage writes slot to value in the order of the slots by insertion.
    for (uint32_t i = 0; i < side_effects.storage_writes_slots_by_insertion.size(); i++) {
        const auto& slot = side_effects.storage_writes_slots_by_insertion.at(i);
        const auto& value = side_effects.storage_writes_slot_to_value.at(slot);
        public_inputs_.accumulated_data.public_data_writes[i] = PublicDataWrite{ .leaf_slot = slot, .value = value };
    }

    return *this;
}

} // namespace bb::avm2::simulation
