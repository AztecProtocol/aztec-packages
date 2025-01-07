// The aspects of this file related to Public Input struct parsing will likely be msg-packed in the future
#pragma once

#include "barretenberg/vm/avm/generated/flavor_settings.hpp"
#include "barretenberg/vm/aztec_constants.hpp"

using FF = bb::avm::AvmFlavorSettings::FF;

struct EthAddress {
    std::array<uint8_t, 20> value{};
};

struct Gas {
    uint32_t l2_gas = 0;
    uint32_t da_gas = 0;
};

inline void read(uint8_t const*& it, Gas& gas)
{
    using serialize::read;
    read(it, gas.da_gas);
    read(it, gas.l2_gas);
}

struct GasFees {
    FF fee_per_da_gas{};
    FF fee_per_l2_gas{};
};

inline void read(uint8_t const*& it, GasFees& gas_fees)
{
    using serialize::read;
    read(it, gas_fees.fee_per_da_gas);
    read(it, gas_fees.fee_per_l2_gas);
}

struct GasSettings {
    Gas gas_limits;
    Gas teardown_gas_limits;
    GasFees max_fees_per_gas;
    GasFees max_priority_fees_per_gas;
};

inline void read(uint8_t const*& it, GasSettings& gas_settings)
{
    using serialize::read;
    read(it, gas_settings.gas_limits);
    read(it, gas_settings.teardown_gas_limits);
    read(it, gas_settings.max_fees_per_gas);
    read(it, gas_settings.max_priority_fees_per_gas);
}

struct GlobalVariables {
    /** ChainId for the L2 block. */
    FF chain_id{};
    /** Version for the L2 block. */
    FF version{};
    /** Block number of the L2 block. */
    FF block_number{};
    /** Slot number of the L2 block */
    FF slot_number{};
    /** Timestamp of the L2 block. */
    FF timestamp{};
    /** Recipient of block reward */
    // This is an eth address so it's actually only 20 bytes
    FF coinbase{};
    /** Address to receive fees. */
    FF fee_recipient{};
    /** Global gas prices for this block. */
    GasFees gas_fees;
};

inline void read(uint8_t const*& it, GlobalVariables& global_variables)
{
    using serialize::read;
    read(it, global_variables.chain_id);
    read(it, global_variables.version);
    read(it, global_variables.block_number);
    read(it, global_variables.slot_number);
    read(it, global_variables.timestamp);
    std::array<uint8_t, 20> coinbase;
    read(it, coinbase);
    global_variables.coinbase = FF::serialize_from_buffer(coinbase.data());

    read(it, global_variables.fee_recipient);
    read(it, global_variables.gas_fees);
}

struct AppendOnlyTreeSnapshot {
    FF root{};
    uint32_t size = 0;
    inline bool operator==(const AppendOnlyTreeSnapshot& rhs) const { return root == rhs.root && size == rhs.size; }
};

inline void read(uint8_t const*& it, AppendOnlyTreeSnapshot& tree_snapshot)
{
    using serialize::read;
    read(it, tree_snapshot.root);
    read(it, tree_snapshot.size);
}

struct TreeSnapshots {
    AppendOnlyTreeSnapshot l1_to_l2_message_tree;
    AppendOnlyTreeSnapshot note_hash_tree;
    AppendOnlyTreeSnapshot nullifier_tree;
    AppendOnlyTreeSnapshot public_data_tree;
    inline bool operator==(const TreeSnapshots& rhs) const
    {
        return l1_to_l2_message_tree == rhs.l1_to_l2_message_tree && note_hash_tree == rhs.note_hash_tree &&
               nullifier_tree == rhs.nullifier_tree && public_data_tree == rhs.public_data_tree;
    }
    inline TreeSnapshots copy()
    {
        return {
        .l1_to_l2_message_tree = {
          .root = l1_to_l2_message_tree.root,
          .size = l1_to_l2_message_tree.size,
        },
        .note_hash_tree = {
          .root = note_hash_tree.root,
          .size = note_hash_tree.size,
        },
        .nullifier_tree = {
          .root = nullifier_tree.root,
          .size = nullifier_tree.size,
        },
        .public_data_tree = {
          .root = public_data_tree.root,
          .size = public_data_tree.size,
        },
      };
    }
};

inline void read(uint8_t const*& it, TreeSnapshots& tree_snapshots)
{
    using serialize::read;
    read(it, tree_snapshots.l1_to_l2_message_tree);
    read(it, tree_snapshots.note_hash_tree);
    read(it, tree_snapshots.nullifier_tree);
    read(it, tree_snapshots.public_data_tree);
}

struct PublicCallRequest {
    /**
     * Address of the account which represents the entity who invoked the call.
     */
    FF msg_sender{};
    /**
     * The contract address being called.
     */
    FF contract_address{};
    /**
     * Function selector of the function being called.
     */
    uint32_t function_selector = 0;
    /**
     * Determines whether the call is modifying state.
     */
    bool is_static_call = false;
    FF args_hash{};
    inline bool is_empty() const
    {
        return msg_sender == 0 && contract_address == 0 && function_selector == 0 && !is_static_call && args_hash == 0;
    }
};

inline void read(uint8_t const*& it, PublicCallRequest& public_call_request)
{
    using serialize::read;
    read(it, public_call_request.msg_sender);
    read(it, public_call_request.contract_address);
    read(it, public_call_request.function_selector);
    read(it, public_call_request.is_static_call);
    read(it, public_call_request.args_hash);
}

struct PrivateToAvmAccumulatedDataArrayLengths {
    uint32_t note_hashes = 0;
    uint32_t nullifiers = 0;
    uint32_t l2_to_l1_msgs = 0;
};

inline void read(uint8_t const*& it, PrivateToAvmAccumulatedDataArrayLengths& lengths)
{
    using serialize::read;
    read(it, lengths.note_hashes);
    read(it, lengths.nullifiers);
    read(it, lengths.l2_to_l1_msgs);
}
struct L2ToL1Message {
    FF recipient{}; // This is an eth address so it's actually only 20 bytes
    FF content{};
    uint32_t counter = 0;
};

inline void read(uint8_t const*& it, L2ToL1Message& l2_to_l1_message)
{
    using serialize::read;
    std::array<uint8_t, 20> recipient;
    read(it, recipient);
    l2_to_l1_message.recipient = FF::serialize_from_buffer(recipient.data());
    read(it, l2_to_l1_message.content);
    read(it, l2_to_l1_message.counter);
}

struct ScopedL2ToL1Message {
    L2ToL1Message l2_to_l1_message{};
    FF contract_address{};
};

inline void read(uint8_t const*& it, ScopedL2ToL1Message& l2_to_l1_message)
{
    using serialize::read;
    read(it, l2_to_l1_message.l2_to_l1_message);
    read(it, l2_to_l1_message.contract_address);
}

struct PrivateToAvmAccumulatedData {
    std::array<FF, MAX_NOTE_HASHES_PER_TX> note_hashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> l2_to_l1_msgs;
};

inline void read(uint8_t const*& it, PrivateToAvmAccumulatedData& accumulated_data)
{
    using serialize::read;
    read(it, accumulated_data.note_hashes);
    read(it, accumulated_data.nullifiers);
    read(it, accumulated_data.l2_to_l1_msgs);
}

struct LogHash {
    FF value{};
    uint32_t counter = 0;
    FF length{};
};

inline void read(uint8_t const*& it, LogHash& log_hash)
{
    using serialize::read;
    read(it, log_hash.value);
    read(it, log_hash.counter);
    read(it, log_hash.length);
}

struct ScopedLogHash {
    LogHash log_hash;
    FF contract_address{};
};

inline void read(uint8_t const*& it, ScopedLogHash& scoped_log_hash)
{
    using serialize::read;
    read(it, scoped_log_hash.log_hash);
    read(it, scoped_log_hash.contract_address);
}

struct PublicDataWrite {
    FF leaf_slot{};
    FF value{};
};

inline void read(uint8_t const*& it, PublicDataWrite& public_data_write)
{
    using serialize::read;
    read(it, public_data_write.leaf_slot);
    read(it, public_data_write.value);
}

struct AvmAccumulatedData {
    /**
     * The note hashes from private combining with those made in the AVM execution.
     */
    std::array<FF, MAX_NOTE_HASHES_PER_TX> note_hashes{};
    /**
     * The nullifiers from private combining with those made in the AVM execution.
     */
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    /**
     * The L2 to L1 messages from private combining with those made in the AVM execution.
     */
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> l2_to_l1_msgs{};
    /**
     * The unencrypted logs emitted from the AVM execution.
     */
    std::array<ScopedLogHash, MAX_UNENCRYPTED_LOGS_PER_TX> unencrypted_logs_hashes{};
    /**
     * The public data writes made in the AVM execution.
     */
    std::array<PublicDataWrite, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX> public_data_writes{};
};

inline void read(uint8_t const*& it, AvmAccumulatedData& accumulated_data)
{
    using serialize::read;

    read(it, accumulated_data.note_hashes);
    read(it, accumulated_data.nullifiers);
    read(it, accumulated_data.l2_to_l1_msgs);
    read(it, accumulated_data.unencrypted_logs_hashes);
    read(it, accumulated_data.public_data_writes);
};

class AvmPublicInputs {
  public:
    GlobalVariables global_variables;
    TreeSnapshots start_tree_snapshots;
    Gas start_gas_used;
    GasSettings gas_settings;
    FF fee_payer;
    std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX> public_setup_call_requests;
    std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX> public_app_logic_call_requests;
    PublicCallRequest public_teardown_call_request;
    PrivateToAvmAccumulatedDataArrayLengths previous_non_revertible_accumulated_data_array_lengths;
    PrivateToAvmAccumulatedDataArrayLengths previous_revertible_accumulated_data_array_lengths;
    PrivateToAvmAccumulatedData previous_non_revertible_accumulated_data;
    PrivateToAvmAccumulatedData previous_revertible_accumulated_data;
    TreeSnapshots end_tree_snapshots;
    Gas end_gas_used;
    AvmAccumulatedData accumulated_data;
    FF transaction_fee{};
    bool reverted = false;

    AvmPublicInputs() = default;
    static AvmPublicInputs from(const std::vector<uint8_t>& data)
    {
        AvmPublicInputs public_inputs;

        using serialize::read;
        const auto* it = data.data();
        read(it, public_inputs.global_variables);
        read(it, public_inputs.start_tree_snapshots);
        read(it, public_inputs.start_gas_used);
        read(it, public_inputs.gas_settings);
        read(it, public_inputs.fee_payer);
        read(it, public_inputs.public_setup_call_requests);
        read(it, public_inputs.public_app_logic_call_requests);
        read(it, public_inputs.public_teardown_call_request);
        read(it, public_inputs.previous_non_revertible_accumulated_data_array_lengths);
        read(it, public_inputs.previous_revertible_accumulated_data_array_lengths);
        read(it, public_inputs.previous_non_revertible_accumulated_data);
        read(it, public_inputs.previous_revertible_accumulated_data);
        read(it, public_inputs.end_tree_snapshots);
        read(it, public_inputs.end_gas_used);
        read(it, public_inputs.accumulated_data);
        read(it, public_inputs.transaction_fee);
        read(it, public_inputs.reverted);
        return public_inputs;
    }
};
