#pragma once

#include <cstdint>
#include <ostream>
#include <vector>

#include "barretenberg/common/streams.hpp" // Derives operator<< from MSGPACK_FIELDS.
#include "barretenberg/common/utils.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/world_state.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
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
struct PublicKeysHint {
    AffinePoint master_nullifier_public_key;
    AffinePoint master_incoming_viewing_public_key;
    AffinePoint master_outgoing_viewing_public_key;
    AffinePoint master_tagging_public_key;

    bool operator==(const PublicKeysHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(master_nullifier_public_key,
                              master_incoming_viewing_public_key,
                              master_outgoing_viewing_public_key,
                              master_tagging_public_key);
};

struct ContractInstanceHint {
    uint32_t hint_key;
    AztecAddress address;
    FF salt;
    AztecAddress deployer;
    ContractClassId current_contract_class_id;
    ContractClassId original_contract_class_id;
    FF initialization_hash;
    PublicKeysHint public_keys;

    bool operator==(const ContractInstanceHint& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(hint_key,
                              address,
                              salt,
                              deployer,
                              current_contract_class_id,
                              original_contract_class_id,
                              initialization_hash,
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

    MSGPACK_FIELDS(address, selector, name);
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

    MSGPACK_FIELDS(request, calldata);
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

struct PublicSimulatorConfig {
    FF prover_id = 0;
    bool skip_fee_enforcement = false;
    bool collect_call_metadata = false;
    bool collect_hints = false;
    bool collect_debug_logs = false;
    uint32_t max_debug_log_memory_reads = 0;
    bool collect_statistics = false;

    bool operator==(const PublicSimulatorConfig& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(prover_id,
                              skip_fee_enforcement,
                              collect_call_metadata,
                              collect_hints,
                              collect_debug_logs,
                              max_debug_log_memory_reads,
                              collect_statistics);
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

// Metadata about a given call.
// NOTE: This is currently a superset of the NestedProcessReturnValues class in TS
// but it will likely be extended to include more information.
struct CallStackMetadata {
    std::vector<FF> calldata;
    std::optional<std::vector<FF>> values;
    std::vector<CallStackMetadata> nested;

    bool operator==(const CallStackMetadata& other) const = default;
    MSGPACK_CAMEL_CASE_FIELDS(calldata, values, nested);
};

// TODO(fcarreiro/mwood): add.
using SimulationError = bool;

struct TxSimulationResult {
    // Simulation.
    GasUsed gas_used;
    RevertCode revert_code;
    std::optional<SimulationError> revert_reason;
    // The following fields are only guaranteed to be present if the simulator is configured to collect them.
    // NOTE: This vector will be populated with one CallStackMetadata per app logic enqueued call.
    // IMPORTANT: The nesting will only be 1 level deep! You will get one result per enqueued call
    // but no information about nested calls. This can be added later.
    std::vector<CallStackMetadata> app_logic_return_values;
    std::optional<std::vector<DebugLog>> logs;
    // Proving request data.
    PublicInputs public_inputs;
    std::optional<ExecutionHints> hints;

    bool operator==(const TxSimulationResult& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(
        gas_used, revert_code, revert_reason, app_logic_return_values, logs, public_inputs, hints);
};

} // namespace bb::avm2
