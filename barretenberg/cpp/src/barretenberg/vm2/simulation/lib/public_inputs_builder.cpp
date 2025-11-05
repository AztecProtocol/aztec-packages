#include "barretenberg/vm2/simulation/lib/public_inputs_builder.hpp"

#include <ranges>

namespace bb::avm2::simulation {

PublicInputsBuilder& PublicInputsBuilder::extract_inputs(const Tx& tx,
                                                         const GlobalVariables& global_variables,
                                                         const ProtocolContracts& protocol_contracts,
                                                         const FF& prover_id,
                                                         const LowLevelMerkleDBInterface& merkle_db)
{
    public_inputs_.globalVariables = global_variables;
    public_inputs_.protocolContracts = protocol_contracts;
    public_inputs_.proverId = prover_id;
    public_inputs_.startGasUsed = tx.gasUsedByPrivate;
    public_inputs_.gasSettings = tx.gasSettings;
    public_inputs_.effectiveGasFees = tx.effectiveGasFees;
    public_inputs_.feePayer = tx.feePayer;
    public_inputs_.startTreeSnapshots = merkle_db.get_tree_roots();

    ///////////////////////////////////////////////////////////
    // Public Call Requests.
    ///////////////////////////////////////////////////////////
    public_inputs_.publicCallRequestArrayLengths = {
        .setupCalls = static_cast<uint32_t>(tx.setupEnqueuedCalls.size()),
        .appLogicCalls = static_cast<uint32_t>(tx.appLogicEnqueuedCalls.size()),
        .teardownCall = tx.teardownEnqueuedCall.has_value(),
    };
    // The protocol does not allow this, but from the TX object PoV the size could be larger.
    // Therefore we keep this check. We also keep it as an exception because it's not
    // expensive to check and it allows for a more informative error message.
    if (tx.setupEnqueuedCalls.size() > MAX_ENQUEUED_CALLS_PER_TX ||
        tx.appLogicEnqueuedCalls.size() > MAX_ENQUEUED_CALLS_PER_TX) {
        throw std::runtime_error(
            "Too many enqueued calls. Setup calls: " + std::to_string(tx.setupEnqueuedCalls.size()) +
            ", App logic calls: " + std::to_string(tx.appLogicEnqueuedCalls.size()));
    }

    std::ranges::transform(tx.setupEnqueuedCalls.begin(),
                           tx.setupEnqueuedCalls.end(),
                           public_inputs_.publicSetupCallRequests.begin(),
                           [](const auto& call) { return call.request; });
    std::ranges::transform(tx.appLogicEnqueuedCalls,
                           public_inputs_.publicAppLogicCallRequests.begin(),
                           [](const auto& call) { return call.request; });

    // If there is a teardown call, set it. Otherwise it will be full of zeroes.
    if (tx.teardownEnqueuedCall.has_value()) {
        public_inputs_.publicTeardownCallRequest = tx.teardownEnqueuedCall.value().request;
    }

    ///////////////////////////////////////////////////////////
    // Side effects from private.
    ///////////////////////////////////////////////////////////

    // Note that the side effects that come from private, both revertible and non-revertible,
    // need to be in the `**previous**(Non)RevertibleAccumulatedData` part of the public inputs.
    // This is irrespective of whether they end up inserted, or reverted in the actual execution.

    // Non-revertible.
    public_inputs_.previousNonRevertibleAccumulatedDataArrayLengths = {
        .noteHashes = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.noteHashes.size()),
        .nullifiers = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.nullifiers.size()),
        .l2ToL1Msgs = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.l2ToL1Messages.size()),
    };
    // The protocol does not allow this, but from the TX object PoV the size could be larger.
    // Therefore we keep this check. We also keep it as an exception because it's not
    // expensive to check and it allows for a more informative error message.
    if (tx.nonRevertibleAccumulatedData.noteHashes.size() > MAX_NOTE_HASHES_PER_TX ||
        tx.nonRevertibleAccumulatedData.nullifiers.size() > MAX_NULLIFIERS_PER_TX ||
        tx.nonRevertibleAccumulatedData.l2ToL1Messages.size() > MAX_L2_TO_L1_MSGS_PER_TX) {
        throw std::runtime_error(
            "Too many non-revertible side effects from private. Note hashes: " +
            std::to_string(tx.nonRevertibleAccumulatedData.noteHashes.size()) +
            ", Nullifiers: " + std::to_string(tx.nonRevertibleAccumulatedData.nullifiers.size()) +
            ", L2 to L1 messages: " + std::to_string(tx.nonRevertibleAccumulatedData.l2ToL1Messages.size()));
    }

    std::ranges::copy(tx.nonRevertibleAccumulatedData.noteHashes,
                      public_inputs_.previousNonRevertibleAccumulatedData.noteHashes.begin());
    std::ranges::copy(tx.nonRevertibleAccumulatedData.nullifiers,
                      public_inputs_.previousNonRevertibleAccumulatedData.nullifiers.begin());
    std::ranges::copy(tx.nonRevertibleAccumulatedData.l2ToL1Messages,
                      public_inputs_.previousNonRevertibleAccumulatedData.l2ToL1Msgs.begin());

    // Revertible.
    public_inputs_.previousRevertibleAccumulatedDataArrayLengths = {
        .noteHashes = static_cast<uint32_t>(tx.revertibleAccumulatedData.noteHashes.size()),
        .nullifiers = static_cast<uint32_t>(tx.revertibleAccumulatedData.nullifiers.size()),
        .l2ToL1Msgs = static_cast<uint32_t>(tx.revertibleAccumulatedData.l2ToL1Messages.size()),
    };
    // The protocol does not allow this, but from the TX object PoV the size could be larger.
    // Therefore we keep this check. We also keep it as an exception because it's not
    // expensive to check and it allows for a more informative error message.
    if (tx.revertibleAccumulatedData.noteHashes.size() > MAX_NOTE_HASHES_PER_TX ||
        tx.revertibleAccumulatedData.nullifiers.size() > MAX_NULLIFIERS_PER_TX ||
        tx.revertibleAccumulatedData.l2ToL1Messages.size() > MAX_L2_TO_L1_MSGS_PER_TX) {
        throw std::runtime_error(
            "Too many revertible side effects from private. Note hashes: " +
            std::to_string(tx.revertibleAccumulatedData.noteHashes.size()) +
            ", Nullifiers: " + std::to_string(tx.revertibleAccumulatedData.nullifiers.size()) +
            ", L2 to L1 messages: " + std::to_string(tx.revertibleAccumulatedData.l2ToL1Messages.size()));
    }

    std::ranges::copy(tx.revertibleAccumulatedData.noteHashes,
                      public_inputs_.previousRevertibleAccumulatedData.noteHashes.begin());
    std::ranges::copy(tx.revertibleAccumulatedData.nullifiers,
                      public_inputs_.previousRevertibleAccumulatedData.nullifiers.begin());
    std::ranges::copy(tx.revertibleAccumulatedData.l2ToL1Messages,
                      public_inputs_.previousRevertibleAccumulatedData.l2ToL1Msgs.begin());

    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::extract_outputs(const LowLevelMerkleDBInterface& merkle_db,
                                                          const Gas& end_gas_used,
                                                          const FF& transaction_fee,
                                                          const bool reverted,
                                                          const TrackedSideEffects& side_effects)
{
    public_inputs_.endTreeSnapshots = merkle_db.get_tree_roots();
    public_inputs_.endGasUsed = end_gas_used;
    public_inputs_.transactionFee = transaction_fee;
    public_inputs_.reverted = reverted;

    ///////////////////////////////////////////////////////////
    // accumulatedDataArrayLengths.
    ///////////////////////////////////////////////////////////
    public_inputs_.accumulatedDataArrayLengths = {
        .noteHashes = static_cast<uint32_t>(side_effects.note_hashes.size()),
        .nullifiers = static_cast<uint32_t>(side_effects.nullifiers.size()),
        .l2ToL1Msgs = static_cast<uint32_t>(side_effects.l2_to_l1_messages.size()),
        .publicDataWrites = static_cast<uint32_t>(side_effects.storage_writes_slot_to_value.size()),
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
    // accumulatedData.
    ///////////////////////////////////////////////////////////
    std::ranges::copy(side_effects.note_hashes, public_inputs_.accumulatedData.noteHashes.begin());
    std::ranges::copy(side_effects.nullifiers, public_inputs_.accumulatedData.nullifiers.begin());
    std::ranges::copy(side_effects.l2_to_l1_messages, public_inputs_.accumulatedData.l2ToL1Msgs.begin());
    public_inputs_.accumulatedData.publicLogs = side_effects.public_logs;
    // We need to copy the storage writes slot to value in the order of the slots by insertion.
    for (uint32_t i = 0; i < side_effects.storage_writes_slots_by_insertion.size(); i++) {
        const auto& slot = side_effects.storage_writes_slots_by_insertion.at(i);
        const auto& value = side_effects.storage_writes_slot_to_value.at(slot);
        public_inputs_.accumulatedData.publicDataWrites[i] = PublicDataWrite{ .leafSlot = slot, .value = value };
    }

    return *this;
}

} // namespace bb::avm2::simulation
