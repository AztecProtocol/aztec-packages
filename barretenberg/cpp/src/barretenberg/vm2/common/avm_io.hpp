#pragma once

#include <cstdint>
#include <ostream>
#include <vector>

#include "barretenberg/common/streams.hpp" // Derives operator<< from SERIALIZATION_FIELDS.
#include "barretenberg/common/utils.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/world_state.hpp" // For MSGPACK_ADD_ENUM(MerkleTreeId)

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/world_state/types.hpp"
#include "msgpack/adaptor/define_decl.hpp"

namespace bb::avm2 {

////////////////////////////////////////////////////////////////////////////
// Avm Circuit Public Inputs
////////////////////////////////////////////////////////////////////////////

struct PublicInputs {
    ///////////////////////////////////
    // Inputs
    GlobalVariables global_variables;
    ProtocolContracts protocol_contracts;
    TreeSnapshots start_tree_snapshots;
    Gas start_gas_used;
    GasSettings gas_settings;
    GasFees effective_gas_fees;
    AztecAddress fee_payer;
    FF prover_id;
    PublicCallRequestArrayLengths public_call_request_array_lengths;
    std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX> public_setup_call_requests{};
    std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX> public_app_logic_call_requests{};
    PublicCallRequest public_teardown_call_request;
    PrivateToAvmAccumulatedDataArrayLengths previous_non_revertible_accumulated_data_array_lengths;
    PrivateToAvmAccumulatedDataArrayLengths previous_revertible_accumulated_data_array_lengths;
    PrivateToAvmAccumulatedData previous_non_revertible_accumulated_data;
    PrivateToAvmAccumulatedData previous_revertible_accumulated_data;
    ///////////////////////////////////
    // Outputs
    TreeSnapshots end_tree_snapshots;
    Gas end_gas_used;
    AvmAccumulatedDataArrayLengths accumulated_data_array_lengths;
    AvmAccumulatedData accumulated_data;
    FF transaction_fee;
    bool reverted;

    static PublicInputs from(const std::vector<uint8_t>& data);

    // A vector per public inputs column
    std::vector<std::vector<FF>> to_columns() const;

    // Flatten public input columns as a single vector
    static std::vector<FF> columns_to_flat(std::vector<std::vector<FF>> const& columns);

    // From flattened public inputs columns to vector per-column
    // Reverse direction as the above but needs to be templated as
    // recursive verifier needs it with a circuit type.
    template <typename FF_> static std::vector<std::vector<FF_>> flat_to_columns(const std::vector<FF_>& input)
    {
        if (input.size() != AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH) {
            throw std::invalid_argument(
                "Flattened public inputs vector size does not match the expected combined length.");
        }

        std::vector<std::vector<FF_>> cols(AVM_NUM_PUBLIC_INPUT_COLUMNS);

        for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; ++i) {
            typename std::vector<FF_>::const_iterator start =
                input.begin() +
                static_cast<typename std::vector<FF_>::difference_type>(i * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
            typename std::vector<FF_>::const_iterator end =
                input.begin() +
                static_cast<typename std::vector<FF_>::difference_type>((i + 1) * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
            cols[i] = std::vector<FF_>(start, end);
        }

        return cols;
    }

    bool operator==(const PublicInputs& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(global_variables,
                              protocol_contracts,
                              start_tree_snapshots,
                              start_gas_used,
                              gas_settings,
                              effective_gas_fees,
                              fee_payer,
                              prover_id,
                              public_call_request_array_lengths,
                              public_setup_call_requests,
                              public_app_logic_call_requests,
                              public_teardown_call_request,
                              previous_non_revertible_accumulated_data_array_lengths,
                              previous_revertible_accumulated_data_array_lengths,
                              previous_non_revertible_accumulated_data,
                              previous_revertible_accumulated_data,
                              end_tree_snapshots,
                              end_gas_used,
                              accumulated_data_array_lengths,
                              accumulated_data,
                              transaction_fee,
                              reverted);
};

////////////////////////////////////////////////////////////////////////////
// Hints (contracts)
////////////////////////////////////////////////////////////////////////////
// Only ivpk_m is sent as a point; the others are field-element hashes.
struct PublicKeysHint {
    FF npk_m_hash;
    AffinePoint ivpk_m;
    FF ovpk_m_hash;
    FF tpk_m_hash;
    FF mspk_m_hash;
    FF fbpk_m_hash;

    bool operator==(const PublicKeysHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(npk_m_hash, ivpk_m, ovpk_m_hash, tpk_m_hash, mspk_m_hash, fbpk_m_hash);
};

struct ContractInstanceHint {
    uint32_t hint_key;
    AztecAddress address;
    FF salt;
    AztecAddress deployer;
    ContractClassId current_contract_class_id;
    ContractClassId original_contract_class_id;
    FF initialization_hash;
    FF immutables_hash;
    PublicKeysHint public_keys;

    bool operator==(const ContractInstanceHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key,
                              address,
                              salt,
                              deployer,
                              current_contract_class_id,
                              original_contract_class_id,
                              initialization_hash,
                              immutables_hash,
                              public_keys);
};

struct ContractClassHint {
    uint32_t hint_key;
    FF class_id;
    FF artifact_hash;
    FF private_functions_root;
    std::vector<uint8_t> packed_bytecode;

    bool operator==(const ContractClassHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key, class_id, artifact_hash, private_functions_root, packed_bytecode);
};

struct BytecodeCommitmentHint {
    uint32_t hint_key;
    FF class_id;
    FF commitment;

    bool operator==(const BytecodeCommitmentHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key, class_id, commitment);
};

struct DebugFunctionNameHint {
    AztecAddress address;
    FunctionSelector selector;
    std::string name;

    bool operator==(const DebugFunctionNameHint& other) const = default;

    SERIALIZATION_FIELDS(address, selector, name);
};

////////////////////////////////////////////////////////////////////////////
// Hints (merkle db)
////////////////////////////////////////////////////////////////////////////
struct GetSiblingPathHint {
    AppendOnlyTreeSnapshot hint_key;
    // params
    world_state::MerkleTreeId tree_id;
    uint64_t index;
    // return
    std::vector<FF> path;

    bool operator==(const GetSiblingPathHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key, tree_id, index, path);
};

struct GetPreviousValueIndexHint {
    AppendOnlyTreeSnapshot hint_key;
    // params
    world_state::MerkleTreeId tree_id;
    FF value;
    // return
    uint64_t index;
    bool already_present;

    bool operator==(const GetPreviousValueIndexHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key, tree_id, value, index, already_present);
};

template <typename LeafPreimage_> struct GetLeafPreimageHint {
    AppendOnlyTreeSnapshot hint_key;
    // params (tree id will be implicit)
    uint64_t index;
    // return
    LeafPreimage_ leaf_preimage;

    bool operator==(const GetLeafPreimageHint<LeafPreimage_>& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key, index, leaf_preimage);
};

struct GetLeafValueHint {
    AppendOnlyTreeSnapshot hint_key;
    // params
    world_state::MerkleTreeId tree_id;
    uint64_t index;
    // return
    FF value;

    bool operator==(const GetLeafValueHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key, tree_id, index, value);
};

template <typename Leaf> struct SequentialInsertHint {
    AppendOnlyTreeSnapshot hint_key;
    // params
    world_state::MerkleTreeId tree_id;
    Leaf leaf;
    // return
    crypto::merkle_tree::LeafUpdateWitnessData<Leaf> low_leaves_witness_data;
    crypto::merkle_tree::LeafUpdateWitnessData<Leaf> insertion_witness_data;
    // evolved state
    AppendOnlyTreeSnapshot state_after;

    bool operator==(const SequentialInsertHint<Leaf>& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key, tree_id, leaf, low_leaves_witness_data, insertion_witness_data, state_after);
};

// Hint for MerkleTreeDB.appendLeaves.
// Note: only supported for NOTE_HASH_TREE and L1_TO_L2_MESSAGE_TREE.
struct AppendLeavesHint {
    AppendOnlyTreeSnapshot hint_key;
    AppendOnlyTreeSnapshot state_after;
    // params
    world_state::MerkleTreeId tree_id;
    std::vector<FF> leaves;

    bool operator==(const AppendLeavesHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key, state_after, tree_id, leaves);
};

struct CheckpointActionNoStateChangeHint {
    // key
    uint32_t action_counter;
    // current checkpoint evolution
    uint32_t old_checkpoint_id;
    uint32_t new_checkpoint_id;

    bool operator==(const CheckpointActionNoStateChangeHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(action_counter, old_checkpoint_id, new_checkpoint_id);
};

using CreateCheckpointHint = CheckpointActionNoStateChangeHint;
using CommitCheckpointHint = CheckpointActionNoStateChangeHint;

struct RevertCheckpointHint {
    // key
    uint32_t action_counter;
    // current checkpoint evolution
    uint32_t old_checkpoint_id;
    uint32_t new_checkpoint_id;
    // state evolution
    TreeSnapshots state_before;
    TreeSnapshots state_after;

    bool operator==(const RevertCheckpointHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(action_counter, old_checkpoint_id, new_checkpoint_id, state_before, state_after);
};

using ContractDBCreateCheckpointHint = CheckpointActionNoStateChangeHint;
using ContractDBCommitCheckpointHint = CheckpointActionNoStateChangeHint;
using ContractDBRevertCheckpointHint = CheckpointActionNoStateChangeHint;

////////////////////////////////////////////////////////////////////////////
// Hints (other)
////////////////////////////////////////////////////////////////////////////

struct PublicCallRequestWithCalldata {
    PublicCallRequest request;
    std::vector<FF> calldata;

    bool operator==(const PublicCallRequestWithCalldata& other) const = default;

    SERIALIZATION_FIELDS(request, calldata);
};

struct AccumulatedData {
    // TODO: add as needed.
    std::vector<FF> note_hashes;
    std::vector<FF> nullifiers;
    std::vector<ScopedL2ToL1Message> l2_to_l1_messages;

    bool operator==(const AccumulatedData& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(note_hashes, nullifiers, l2_to_l1_messages);
};

// We are currently using this structure as the input to TX simulation.
// That's why I'm not calling it TxHint. We can reconsider if the inner types seem to dirty.
struct Tx {
    std::string hash;
    GasSettings gas_settings;
    GasFees effective_gas_fees;
    ContractDeploymentData non_revertible_contract_deployment_data;
    ContractDeploymentData revertible_contract_deployment_data;
    AccumulatedData non_revertible_accumulated_data;
    AccumulatedData revertible_accumulated_data;
    std::vector<PublicCallRequestWithCalldata> setup_enqueued_calls;
    std::vector<PublicCallRequestWithCalldata> app_logic_enqueued_calls;
    std::optional<PublicCallRequestWithCalldata> teardown_enqueued_call;
    Gas gas_used_by_private;
    AztecAddress fee_payer;
    bool operator==(const Tx& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hash,
                              gas_settings,
                              effective_gas_fees,
                              non_revertible_contract_deployment_data,
                              revertible_contract_deployment_data,
                              non_revertible_accumulated_data,
                              revertible_accumulated_data,
                              setup_enqueued_calls,
                              app_logic_enqueued_calls,
                              teardown_enqueued_call,
                              gas_used_by_private,
                              fee_payer);
};

struct ExecutionHints {
    GlobalVariables global_variables;
    Tx tx;
    // Protocol Contracts
    ProtocolContracts protocol_contracts;
    // Contracts.
    std::vector<ContractInstanceHint> contract_instances;
    std::vector<ContractClassHint> contract_classes;
    std::vector<BytecodeCommitmentHint> bytecode_commitments;
    std::vector<DebugFunctionNameHint> debug_function_names;
    std::vector<ContractDBCreateCheckpointHint> contract_db_create_checkpoint_hints;
    std::vector<ContractDBCommitCheckpointHint> contract_db_commit_checkpoint_hints;
    std::vector<ContractDBRevertCheckpointHint> contract_db_revert_checkpoint_hints;
    // Merkle DB.
    TreeSnapshots starting_tree_roots;
    std::vector<GetSiblingPathHint> get_sibling_path_hints;
    std::vector<GetPreviousValueIndexHint> get_previous_value_index_hints;
    std::vector<GetLeafPreimageHint<crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue>>>
        get_leaf_preimage_hints_public_data_tree;
    std::vector<GetLeafPreimageHint<crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>>>
        get_leaf_preimage_hints_nullifier_tree;
    std::vector<GetLeafValueHint> get_leaf_value_hints;
    std::vector<SequentialInsertHint<crypto::merkle_tree::PublicDataLeafValue>>
        sequential_insert_hints_public_data_tree;
    std::vector<SequentialInsertHint<crypto::merkle_tree::NullifierLeafValue>> sequential_insert_hints_nullifier_tree;
    std::vector<AppendLeavesHint> append_leaves_hints;
    std::vector<CreateCheckpointHint> create_checkpoint_hints;
    std::vector<CommitCheckpointHint> commit_checkpoint_hints;
    std::vector<RevertCheckpointHint> revert_checkpoint_hints;

    bool operator==(const ExecutionHints& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(global_variables,
                              tx,
                              protocol_contracts,
                              contract_instances,
                              contract_classes,
                              bytecode_commitments,
                              debug_function_names,
                              contract_db_create_checkpoint_hints,
                              contract_db_commit_checkpoint_hints,
                              contract_db_revert_checkpoint_hints,
                              starting_tree_roots,
                              get_sibling_path_hints,
                              get_previous_value_index_hints,
                              get_leaf_preimage_hints_public_data_tree,
                              get_leaf_preimage_hints_nullifier_tree,
                              get_leaf_value_hints,
                              sequential_insert_hints_public_data_tree,
                              sequential_insert_hints_nullifier_tree,
                              append_leaves_hints,
                              create_checkpoint_hints,
                              commit_checkpoint_hints,
                              revert_checkpoint_hints);
};

////////////////////////////////////////////////////////////////////////////
// AVM Inputs
////////////////////////////////////////////////////////////////////////////
struct AvmProvingInputs {
    PublicInputs public_inputs;
    ExecutionHints hints;

    static AvmProvingInputs from(const std::vector<uint8_t>& data);
    bool operator==(const AvmProvingInputs& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(public_inputs, hints);
};

struct CollectionLimitsConfig {
    uint32_t max_debug_log_memory_reads = 0;
    uint32_t max_calldata_size_in_fields = 0;
    uint32_t max_returndata_size_in_fields = 0;
    uint32_t max_call_stack_depth = 0;
    uint32_t max_call_stack_items = 0;

    bool operator==(const CollectionLimitsConfig& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(max_debug_log_memory_reads,
                              max_calldata_size_in_fields,
                              max_returndata_size_in_fields,
                              max_call_stack_depth,
                              max_call_stack_items);
};

struct PublicSimulatorConfig {
    FF prover_id = 0;
    bool skip_fee_enforcement = false;
    bool collect_call_metadata = false;
    bool collect_hints = false;
    bool collect_public_inputs = false;
    bool collect_debug_logs = false;
    bool collect_statistics = false;
    CollectionLimitsConfig collection_limits;

    bool operator==(const PublicSimulatorConfig& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(prover_id,
                              skip_fee_enforcement,
                              collect_call_metadata,
                              collect_hints,
                              collect_public_inputs,
                              collect_debug_logs,
                              collect_statistics,
                              collection_limits);
};

struct AvmFastSimulationInputs {
    world_state::WorldStateRevision ws_revision;
    PublicSimulatorConfig config;
    Tx tx;
    GlobalVariables global_variables;
    ProtocolContracts protocol_contracts;

    static AvmFastSimulationInputs from(const std::vector<uint8_t>& data);
    bool operator==(const AvmFastSimulationInputs& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(ws_revision, config, tx, global_variables, protocol_contracts);
};

////////////////////////////////////////////////////////////////////////////
// Tx Simulation Result
////////////////////////////////////////////////////////////////////////////

enum class CoarseTransactionPhase : uint8_t {
    SETUP,
    APP_LOGIC,
    TEARDOWN,
};

inline std::ostream& operator<<(std::ostream& os, const CoarseTransactionPhase& phase)
{
    switch (phase) {
    case CoarseTransactionPhase::SETUP:
        return os << "SETUP";
    case CoarseTransactionPhase::APP_LOGIC:
        return os << "APP_LOGIC";
    case CoarseTransactionPhase::TEARDOWN:
        return os << "TEARDOWN";
    default:
        return os << "UNKNOWN";
    }
}

// Metadata about a given (enqueued or external) call.
struct CallStackMetadata {
    uint32_t timestamp;
    CoarseTransactionPhase phase;
    FF contract_address;
    PC caller_pc;
    std::vector<FF> calldata;
    bool is_static_call;
    Gas gas_limit;
    std::vector<FF> output; // returndata or revertdata.

    bool reverted;
    std::vector<CallStackMetadata> nested;
    std::vector<PC> internal_call_stack_at_exit; // At return/revert time. Last one is exit PC.
    std::optional<std::string> halting_message;
    uint32_t num_nested_calls; // This will be different from the size of the nested vector if we went past some limit.

    bool operator==(const CallStackMetadata& other) const = default;
    MSGPACK_CAMEL_CASE_FIELDS(timestamp,
                              phase,
                              contract_address,
                              caller_pc,
                              calldata,
                              is_static_call,
                              gas_limit,
                              output,
                              reverted,
                              nested,
                              internal_call_stack_at_exit,
                              halting_message,
                              num_nested_calls);
};

struct PublicTxEffect {
    FF transaction_fee;
    std::vector<FF> note_hashes;
    std::vector<FF> nullifiers;
    std::vector<ScopedL2ToL1Message> l2_to_l1_msgs;
    std::vector<PublicLog> public_logs;
    std::vector<PublicDataWrite> public_data_writes;

    bool operator==(const PublicTxEffect& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(transaction_fee, note_hashes, nullifiers, l2_to_l1_msgs, public_logs, public_data_writes);
};

struct TxSimulationResult {
    // Simulation.
    GasUsed gas_used;
    RevertCode revert_code;
    PublicTxEffect public_tx_effect;
    // The following fields are only guaranteed to be present if the simulator is configured to collect them.
    std::vector<CallStackMetadata> call_stack_metadata; // One per enqueued call. All phases.
    std::optional<std::vector<DebugLog>> logs;
    // Proving request data.
    std::optional<PublicInputs> public_inputs;
    std::optional<ExecutionHints> hints;

    bool operator==(const TxSimulationResult& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(gas_used, revert_code, public_tx_effect, call_stack_metadata, logs, public_inputs, hints);
};

} // namespace bb::avm2

MSGPACK_ADD_ENUM(bb::avm2::CoarseTransactionPhase)
