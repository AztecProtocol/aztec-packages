#include "public_inputs_builder.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include <cstdlib>

namespace bb::avm2::testing {

PublicInputsBuilder& PublicInputsBuilder::with_global_variables(const GlobalVariables& globals)
{
    public_inputs.global_variables = globals;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_protocol_contracts(const ProtocolContracts& protocol_contracts)
{
    public_inputs.protocol_contracts = protocol_contracts;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_start_tree_snapshots(const TreeSnapshots& snapshots)
{
    public_inputs.start_tree_snapshots = snapshots;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_start_gas_used(const Gas& gas)
{
    public_inputs.start_gas_used = gas;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_gas_settings(const GasSettings& settings)
{
    public_inputs.gas_settings = settings;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_fee_payer(const AztecAddress& fee_payer)
{
    public_inputs.fee_payer = fee_payer;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_public_setup_call_requests(
    const std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX>& public_setup_call_requests)
{
    public_inputs.public_setup_call_requests = public_setup_call_requests;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::with_public_app_logic_call_requests(
    const std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX>& public_app_logic_call_requests)
{
    public_inputs.public_app_logic_call_requests = public_app_logic_call_requests;
    return *this;
};

PublicInputsBuilder& PublicInputsBuilder::with_public_teardown_call_request(
    const PublicCallRequest& public_teardown_call_request)
{
    public_inputs.public_teardown_call_request = public_teardown_call_request;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_previous_non_revertible_accumulated_data(
    const PrivateToAvmAccumulatedData& previous_non_revertible_accumulated_data)
{
    public_inputs.previous_non_revertible_accumulated_data = previous_non_revertible_accumulated_data;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_previous_revertible_accumulated_data(
    const PrivateToAvmAccumulatedData& previous_revertible_accumulated_data)
{
    public_inputs.previous_revertible_accumulated_data = previous_revertible_accumulated_data;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_previous_non_revertible_accumulated_data_array_lengths(
    const PrivateToAvmAccumulatedDataArrayLengths& previous_non_revertible_accumulated_data_array_lengths)
{
    public_inputs.previous_non_revertible_accumulated_data_array_lengths =
        previous_non_revertible_accumulated_data_array_lengths;
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::with_previous_revertible_accumulated_data_array_lengths(
    const PrivateToAvmAccumulatedDataArrayLengths& previous_revertible_accumulated_data_array_lengths)
{
    public_inputs.previous_revertible_accumulated_data_array_lengths =
        previous_revertible_accumulated_data_array_lengths;
    return *this;
}

// Outputs
PublicInputsBuilder& PublicInputsBuilder::set_end_tree_snapshots(const TreeSnapshots& end_tree_snapshots)
{
    public_inputs.end_tree_snapshots = end_tree_snapshots;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_end_gas_used(const Gas& end_gas_used)
{
    public_inputs.end_gas_used = end_gas_used;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_accumulated_data_array_lengths(
    const AvmAccumulatedDataArrayLengths& accumulated_data_array_lengths)
{
    public_inputs.accumulated_data_array_lengths = accumulated_data_array_lengths;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_accumulated_data(const AvmAccumulatedData& accumulated_data)
{
    public_inputs.accumulated_data = accumulated_data;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_transaction_fee(const FF& transaction_fee)
{
    public_inputs.transaction_fee = transaction_fee;
    return *this;
}
PublicInputsBuilder& PublicInputsBuilder::set_reverted(bool reverted)
{
    public_inputs.reverted = reverted;
    return *this;
}

// *******************************************
// Randomised Builders
// *******************************************
PublicInputsBuilder& PublicInputsBuilder::rand_global_variables()
{
    public_inputs.global_variables = { .chain_id = FF::random_element(&engine),
                                       .version = FF::random_element(&engine),
                                       .block_number = static_cast<uint32_t>(std::rand()),
                                       .slot_number = FF::random_element(&engine),
                                       .timestamp = static_cast<uint64_t>(std::rand()),
                                       .coinbase = EthAddress::random_element(&engine),
                                       .fee_recipient = AztecAddress::random_element(&engine),
                                       .gas_fees = {
                                           .fee_per_da_gas = static_cast<uint128_t>(std::rand()),
                                           .fee_per_l2_gas = static_cast<uint128_t>(std::rand()),
                                       } };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_start_tree_snapshots()
{
    public_inputs.start_tree_snapshots = {
        .l1_to_l2_message_tree = { .root = FF::random_element(&engine),
                                   .next_available_leaf_index = engine.get_random_uint64() },
        .note_hash_tree = { .root = FF::random_element(&engine),
                            .next_available_leaf_index = engine.get_random_uint64() },
        .nullifier_tree = { .root = FF::random_element(&engine),
                            .next_available_leaf_index = engine.get_random_uint64() },
        .public_data_tree = { .root = FF::random_element(&engine),
                              .next_available_leaf_index = engine.get_random_uint64() },
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_start_gas_used()
{
    public_inputs.start_gas_used = {
        .l2_gas = engine.get_random_uint32(),
        .da_gas = engine.get_random_uint32(),
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_gas_settings()
{
    public_inputs.gas_settings = {
        .gas_limits = {
            .l2_gas = engine.get_random_uint32(),
            .da_gas = engine.get_random_uint32(),
        },
        .teardown_gas_limits = {
            .l2_gas = engine.get_random_uint32(),
            .da_gas = engine.get_random_uint32(),
        },
        .max_fees_per_gas = {
            .fee_per_da_gas = engine.get_random_uint128(),
            .fee_per_l2_gas = engine.get_random_uint128(),
        },
        .max_priority_fees_per_gas = {
            .fee_per_da_gas = engine.get_random_uint128(),
            .fee_per_l2_gas = engine.get_random_uint128(),
        },
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_fee_payer()
{
    public_inputs.fee_payer = AztecAddress::random_element(&engine);
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_previous_non_revertible_accumulated_data(size_t n)
{
    std::array<FF, MAX_NOTE_HASHES_PER_TX> note_hashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> messages{};

    for (size_t i = 0; i < n; ++i) {
        note_hashes[i] = FF::random_element(&engine);
        nullifiers[i] = FF::random_element(&engine);
        messages[i] = ScopedL2ToL1Message{
            .message =
                L2ToL1Message{
                    .recipient = FF::random_element(&engine),
                    .content = FF::random_element(&engine),
                },
            .contract_address = FF::random_element(&engine),
        };
    }

    public_inputs.previous_non_revertible_accumulated_data = {
        .note_hashes = note_hashes,
        .nullifiers = nullifiers,
        .l2_to_l1_msgs = messages,
    };
    public_inputs.previous_non_revertible_accumulated_data_array_lengths = {
        .note_hashes = static_cast<uint32_t>(n),
        .nullifiers = static_cast<uint32_t>(n),
        .l2_to_l1_msgs = static_cast<uint32_t>(n),
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_previous_revertible_accumulated_data(size_t n)
{
    std::array<FF, MAX_NOTE_HASHES_PER_TX> note_hashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> messages{};

    for (size_t i = 0; i < n; ++i) {
        note_hashes[i] = FF::random_element(&engine);
        nullifiers[i] = FF::random_element(&engine);
        messages[i] = ScopedL2ToL1Message{
            .message =
                L2ToL1Message{
                    .recipient = FF::random_element(&engine),
                    .content = FF::random_element(&engine),
                },
            .contract_address = FF::random_element(&engine),
        };
    }

    public_inputs.previous_revertible_accumulated_data = {
        .note_hashes = note_hashes,
        .nullifiers = nullifiers,
        .l2_to_l1_msgs = messages,
    };
    public_inputs.previous_revertible_accumulated_data_array_lengths = {
        .note_hashes = static_cast<uint32_t>(n),
        .nullifiers = static_cast<uint32_t>(n),
        .l2_to_l1_msgs = static_cast<uint32_t>(n),
    };
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_public_setup_call_requests(size_t n)
{
    for (size_t i = 0; i < n; ++i) {
        public_inputs.public_setup_call_requests[i] = PublicCallRequest{
            .msg_sender = AztecAddress::random_element(&engine),
            .contract_address = AztecAddress::random_element(&engine),
            .is_static_call = engine.get_random_uint8() % 2 == 0,
            .calldata_hash = FF::random_element(&engine), // Placeholder for actual calldata hash
        };
    }
    public_inputs.public_call_request_array_lengths.setup_calls += static_cast<uint32_t>(n);
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_public_app_logic_call_requests(size_t n)
{
    for (size_t i = 0; i < n; ++i) {
        public_inputs.public_app_logic_call_requests[i] = PublicCallRequest{
            .msg_sender = AztecAddress::random_element(&engine),
            .contract_address = AztecAddress::random_element(&engine),
            .is_static_call = engine.get_random_uint8() % 2 == 0,
            .calldata_hash = FF::random_element(&engine), // Placeholder for actual calldata hash
        };
    }

    public_inputs.public_call_request_array_lengths.app_logic_calls += static_cast<uint32_t>(n);
    return *this;
}

PublicInputsBuilder& PublicInputsBuilder::rand_public_teardown_call_request()
{
    public_inputs.public_teardown_call_request = PublicCallRequest{
        .msg_sender = AztecAddress::random_element(&engine),
        .contract_address = AztecAddress::random_element(&engine),
        .is_static_call = engine.get_random_uint8() % 2 == 0,
        .calldata_hash = FF::random_element(&engine), // Placeholder for actual calldata hash
    };

    public_inputs.public_call_request_array_lengths.teardown_call = true;

    return *this;
}

PublicInputs PublicInputsBuilder::build() const
{
    return public_inputs;
}

} // namespace bb::avm2::testing
