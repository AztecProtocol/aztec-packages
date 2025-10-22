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
    public_inputs_.previousNonRevertibleAccumulatedDataArrayLengths = {
        .noteHashes = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.noteHashes.size()),
        .nullifiers = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.nullifiers.size()),
        .l2ToL1Msgs = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.l2ToL1Messages.size()),
    };
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

    public_inputs_.previousRevertibleAccumulatedDataArrayLengths = {
        .noteHashes = static_cast<uint32_t>(tx.revertibleAccumulatedData.noteHashes.size()),
        .nullifiers = static_cast<uint32_t>(tx.revertibleAccumulatedData.nullifiers.size()),
        .l2ToL1Msgs = static_cast<uint32_t>(tx.revertibleAccumulatedData.l2ToL1Messages.size()),
    };
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

PublicInputsBuilder& PublicInputsBuilder::extract_outputs(const LowLevelMerkleDBInterface& merkle_db)
{
    ///////////////////////////////////
    // Outputs.
    // endTreeSnapshots -> DB
    // endGasUsed -> context (or idealy TxExecution simulation results)
    // accumulatedDataArrayLengths -> tracking side effects
    // accumulatedData -> tracking side effects
    // transactionFee -> tx execution (or idealy simulation results)
    // reverted -> tx execution (or idealy TxExecution simulation results)
    public_inputs_.endTreeSnapshots = merkle_db.get_tree_roots();

    return *this;
}

} // namespace bb::avm2::simulation
