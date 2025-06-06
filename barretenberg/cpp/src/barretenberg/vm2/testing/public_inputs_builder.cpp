#include "public_inputs_builder.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include <cstdlib>

namespace bb::avm2::testing {

PublicInputsBuilder& PublicInputsBuilder::with_global_variables(const GlobalVariables& globals)
{
    public_inputs.globalVariables = globals;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_start_tree_snapshots(const TreeSnapshots& snapshots)
{
    public_inputs.startTreeSnapshots = snapshots;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_start_gas_used(const Gas& gas)
{
    public_inputs.startGasUsed = gas;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_gas_settings(const GasSettings& settings)
{
    public_inputs.gasSettings = settings;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_fee_payer(const AztecAddress& fee_payer)
{
    public_inputs.feePayer = fee_payer;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_public_setup_call_requests(
    const std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX>& public_setup_call_requests)
{
    public_inputs.publicSetupCallRequests = public_setup_call_requests;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_public_app_logic_call_requests(
    const std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX>& public_app_logic_call_requests)
{
    public_inputs.publicAppLogicCallRequests = public_app_logic_call_requests;
    return *this;
};

PublicInputsBuilder& PublicInputsBuilder::with_public_teardown_call_request(
    const PublicCallRequest& public_teardown_call_request)
{
    public_inputs.publicTeardownCallRequest = public_teardown_call_request;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_previous_non_revertible_accumulated_data(
    const PrivateToAvmAccumulatedData& previous_non_revertible_accumulated_data)
{
    public_inputs.previousNonRevertibleAccumulatedData = previous_non_revertible_accumulated_data;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_previous_revertible_accumulated_data(
    const PrivateToAvmAccumulatedData& previous_revertible_accumulated_data)
{
    public_inputs.previousRevertibleAccumulatedData = previous_revertible_accumulated_data;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_previous_non_revertible_accumulated_data_array_lengths(
    const PrivateToAvmAccumulatedDataArrayLengths& previous_non_revertible_accumulated_data_array_lengths)
{
    public_inputs.previousNonRevertibleAccumulatedDataArrayLengths =
        previous_non_revertible_accumulated_data_array_lengths;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_previous_revertible_accumulated_data_array_lengths(
    const PrivateToAvmAccumulatedDataArrayLengths& previous_revertible_accumulated_data_array_lengths)
{
    public_inputs.previousRevertibleAccumulatedDataArrayLengths = previous_revertible_accumulated_data_array_lengths;
    return *this;
}

// Outputs
PublicInputsBuilder& PublicInputsBuilder::set_end_tree_snapshots(const TreeSnapshots& end_tree_snapshots)
{
    public_inputs.endTreeSnapshots = end_tree_snapshots;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_end_gas_used(const Gas& end_gas_used)
{
    public_inputs.endGasUsed = end_gas_used;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_accumulated_data_array_lengths(
    const AvmAccumulatedDataArrayLengths& accumulated_data_array_lengths)
{
    public_inputs.accumulatedDataArrayLengths = accumulated_data_array_lengths;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_accumulated_data(const AvmAccumulatedData& accumulated_data)
{
    public_inputs.accumulatedData = accumulated_data;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_transaction_fee(const FF& transaction_fee)
{
    public_inputs.transactionFee = transaction_fee;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_reverted(bool reverted)
{
    public_inputs.reverted = reverted;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_global_variables()
{
    public_inputs.globalVariables = { .chainId = FF::random_element(),
                                      .version = FF::random_element(),
                                      .blockNumber = FF::random_element(),
                                      .slotNumber = FF::random_element(),
                                      .timestamp = FF::random_element(),
                                      .coinbase = EthAddress::random_element(),
                                      .feeRecipient = AztecAddress::random_element(),
                                      .gasFees = {
                                          .feePerDaGas = static_cast<uint128_t>(std::rand()),
                                          .feePerL2Gas = static_cast<uint128_t>(std::rand()),
                                      } };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_start_tree_snapshots()
{
    public_inputs.startTreeSnapshots = {
        .l1ToL2MessageTree = { .root = FF::random_element(),
                               .nextAvailableLeafIndex = static_cast<uint64_t>(std::rand()) },
        .noteHashTree = { .root = FF::random_element(), .nextAvailableLeafIndex = static_cast<uint64_t>(std::rand()) },
        .nullifierTree = { .root = FF::random_element(), .nextAvailableLeafIndex = static_cast<uint64_t>(std::rand()) },
        .publicDataTree = { .root = FF::random_element(),
                            .nextAvailableLeafIndex = static_cast<uint64_t>(std::rand()) },
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_start_gas_used()
{
    public_inputs.startGasUsed = {
        .l2Gas = static_cast<uint32_t>(std::rand()),
        .daGas = static_cast<uint32_t>(std::rand()),
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_gas_settings()
{
    public_inputs.gasSettings = {
        .gasLimits = {
            .l2Gas = static_cast<uint32_t>(std::rand()),
            .daGas = static_cast<uint32_t>(std::rand()),
        },
        .teardownGasLimits = {
            .l2Gas = static_cast<uint32_t>(std::rand()),
            .daGas = static_cast<uint32_t>(std::rand()),
        },
        .maxFeesPerGas = {
            .feePerDaGas = static_cast<uint128_t>(std::rand()),
            .feePerL2Gas = static_cast<uint128_t>(std::rand()),
        },
        .maxPriorityFeesPerGas = {
            .feePerDaGas = static_cast<uint128_t>(std::rand()),
            .feePerL2Gas = static_cast<uint128_t>(std::rand()),
        },
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_fee_payer()
{
    public_inputs.feePayer = AztecAddress::random_element();
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_previous_non_revertible_accumulated_data(size_t n)
{
    auto rand_note_hashes = random_fields(n);
    auto rand_nullifiers = random_fields(n);
    auto rand_l2_to_l1_messages = random_l2_to_l1_messages(n);

    std::array<FF, MAX_NOTE_HASHES_PER_TX> note_hashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> messages{};

    for (size_t i = 0; i < n; ++i) {
        note_hashes[i] = rand_note_hashes[i];
        nullifiers[i] = rand_nullifiers[i];
        messages[i] = rand_l2_to_l1_messages[i];
    }

    public_inputs.previousNonRevertibleAccumulatedData = {
        .noteHashes = note_hashes,
        .nullifiers = nullifiers,
        .l2ToL1Msgs = messages,
    };
    public_inputs.previousNonRevertibleAccumulatedDataArrayLengths = {
        .noteHashes = static_cast<uint32_t>(n),
        .nullifiers = static_cast<uint32_t>(n),
        .l2ToL1Msgs = static_cast<uint32_t>(n),
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_previous_revertible_accumulated_data(size_t n)
{
    auto rand_note_hashes = random_fields(n);
    auto rand_nullifiers = random_fields(n);
    auto rand_l2_to_l1_messages = random_l2_to_l1_messages(n);

    std::array<FF, MAX_NOTE_HASHES_PER_TX> note_hashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> messages{};

    for (size_t i = 0; i < n; ++i) {
        note_hashes[i] = rand_note_hashes[i];
        nullifiers[i] = rand_nullifiers[i];
        messages[i] = rand_l2_to_l1_messages[i];
    }

    public_inputs.previousRevertibleAccumulatedData = {
        .noteHashes = note_hashes,
        .nullifiers = nullifiers,
        .l2ToL1Msgs = messages,
    };
    public_inputs.previousRevertibleAccumulatedDataArrayLengths = {
        .noteHashes = static_cast<uint32_t>(n),
        .nullifiers = static_cast<uint32_t>(n),
        .l2ToL1Msgs = static_cast<uint32_t>(n),
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_public_setup_call_requests(size_t n)
{
    for (size_t i = 0; i < n; ++i) {
        public_inputs.publicSetupCallRequests[i] = PublicCallRequest{
            .msgSender = AztecAddress::random_element(),
            .contractAddress = AztecAddress::random_element(),
            .isStaticCall = (std::rand() % 2) == 0,
            .calldataHash = FF::random_element(), // Placeholder for actual calldata hash
        };
    }
    public_inputs.publicCallRequestArrayLengths.setupCalls += static_cast<uint32_t>(n);
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_public_app_logic_call_requests(size_t n)
{
    for (size_t i = 0; i < n; ++i) {
        public_inputs.publicAppLogicCallRequests[i] = PublicCallRequest{
            .msgSender = AztecAddress::random_element(),
            .contractAddress = AztecAddress::random_element(),
            .isStaticCall = (std::rand() % 2) == 0,
            .calldataHash = FF::random_element(), // Placeholder for actual calldata hash
        };
    }

    public_inputs.publicCallRequestArrayLengths.appLogicCalls += n;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_public_teardown_call_request()
{
    public_inputs.publicTeardownCallRequest = PublicCallRequest{
        .msgSender = AztecAddress::random_element(),
        .contractAddress = AztecAddress::random_element(),
        .isStaticCall = (std::rand() % 2) == 0,
        .calldataHash = FF::random_element(), // Placeholder for actual calldata hash
    };

    return *this;
}

PublicInputs PublicInputsBuilder::build() const
{
    return public_inputs;
}

} // namespace bb::avm2::testing
