// NOTE: names are in camel-case because they matter to messagepack.
// DO NOT use camel-case outside of these structures.
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
    GlobalVariables globalVariables;
    ProtocolContracts protocolContracts;
    TreeSnapshots startTreeSnapshots;
    Gas startGasUsed;
    GasSettings gasSettings;
    GasFees effectiveGasFees;
    AztecAddress feePayer;
    FF proverId;
    PublicCallRequestArrayLengths publicCallRequestArrayLengths;
    std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX> publicSetupCallRequests{};
    std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX> publicAppLogicCallRequests{};
    PublicCallRequest publicTeardownCallRequest;
    PrivateToAvmAccumulatedDataArrayLengths previousNonRevertibleAccumulatedDataArrayLengths;
    PrivateToAvmAccumulatedDataArrayLengths previousRevertibleAccumulatedDataArrayLengths;
    PrivateToAvmAccumulatedData previousNonRevertibleAccumulatedData;
    PrivateToAvmAccumulatedData previousRevertibleAccumulatedData;
    ///////////////////////////////////
    // Outputs
    TreeSnapshots endTreeSnapshots;
    Gas endGasUsed;
    AvmAccumulatedDataArrayLengths accumulatedDataArrayLengths;
    AvmAccumulatedData accumulatedData;
    FF transactionFee;
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

    MSGPACK_FIELDS(globalVariables,
                   protocolContracts,
                   startTreeSnapshots,
                   startGasUsed,
                   gasSettings,
                   effectiveGasFees,
                   feePayer,
                   proverId,
                   publicCallRequestArrayLengths,
                   publicSetupCallRequests,
                   publicAppLogicCallRequests,
                   publicTeardownCallRequest,
                   previousNonRevertibleAccumulatedDataArrayLengths,
                   previousRevertibleAccumulatedDataArrayLengths,
                   previousNonRevertibleAccumulatedData,
                   previousRevertibleAccumulatedData,
                   endTreeSnapshots,
                   endGasUsed,
                   accumulatedDataArrayLengths,
                   accumulatedData,
                   transactionFee,
                   reverted);
};

////////////////////////////////////////////////////////////////////////////
// Hints (contracts)
////////////////////////////////////////////////////////////////////////////
struct PublicKeysHint {
    AffinePoint masterNullifierPublicKey;
    AffinePoint masterIncomingViewingPublicKey;
    AffinePoint masterOutgoingViewingPublicKey;
    AffinePoint masterTaggingPublicKey;

    bool operator==(const PublicKeysHint& other) const = default;

    MSGPACK_FIELDS(masterNullifierPublicKey,
                   masterIncomingViewingPublicKey,
                   masterOutgoingViewingPublicKey,
                   masterTaggingPublicKey);
};

struct ContractInstanceHint {
    uint32_t hintKey;
    AztecAddress address;
    FF salt;
    AztecAddress deployer;
    ContractClassId currentContractClassId;
    ContractClassId originalContractClassId;
    FF initializationHash;
    PublicKeysHint publicKeys;

    bool operator==(const ContractInstanceHint& other) const = default;

    MSGPACK_FIELDS(hintKey,
                   address,
                   salt,
                   deployer,
                   currentContractClassId,
                   originalContractClassId,
                   initializationHash,
                   publicKeys);
};

struct ContractClassHint {
    uint32_t hintKey;
    FF classId;
    FF artifactHash;
    FF privateFunctionsRoot;
    std::vector<uint8_t> packedBytecode;

    bool operator==(const ContractClassHint& other) const = default;

    MSGPACK_FIELDS(hintKey, classId, artifactHash, privateFunctionsRoot, packedBytecode);
};

struct BytecodeCommitmentHint {
    uint32_t hintKey;
    FF classId;
    FF commitment;

    bool operator==(const BytecodeCommitmentHint& other) const = default;

    MSGPACK_FIELDS(hintKey, classId, commitment);
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
    AppendOnlyTreeSnapshot hintKey;
    // params
    world_state::MerkleTreeId treeId;
    uint64_t index;
    // return
    std::vector<FF> path;

    bool operator==(const GetSiblingPathHint& other) const = default;

    MSGPACK_FIELDS(hintKey, treeId, index, path);
};

struct GetPreviousValueIndexHint {
    AppendOnlyTreeSnapshot hintKey;
    // params
    world_state::MerkleTreeId treeId;
    FF value;
    // return
    uint64_t index;
    bool alreadyPresent;

    bool operator==(const GetPreviousValueIndexHint& other) const = default;

    MSGPACK_FIELDS(hintKey, treeId, value, index, alreadyPresent);
};

template <typename LeafPreimage_> struct GetLeafPreimageHint {
    AppendOnlyTreeSnapshot hintKey;
    // params (tree id will be implicit)
    uint64_t index;
    // return
    LeafPreimage_ leafPreimage;

    bool operator==(const GetLeafPreimageHint<LeafPreimage_>& other) const = default;

    MSGPACK_FIELDS(hintKey, index, leafPreimage);
};

struct GetLeafValueHint {
    AppendOnlyTreeSnapshot hintKey;
    // params
    world_state::MerkleTreeId treeId;
    uint64_t index;
    // return
    FF value;

    bool operator==(const GetLeafValueHint& other) const = default;

    MSGPACK_FIELDS(hintKey, treeId, index, value);
};

template <typename Leaf> struct SequentialInsertHint {
    AppendOnlyTreeSnapshot hintKey;
    // params
    world_state::MerkleTreeId treeId;
    Leaf leaf;
    // return
    crypto::merkle_tree::LeafUpdateWitnessData<Leaf> lowLeavesWitnessData;
    crypto::merkle_tree::LeafUpdateWitnessData<Leaf> insertionWitnessData;
    // evolved state
    AppendOnlyTreeSnapshot stateAfter;

    bool operator==(const SequentialInsertHint<Leaf>& other) const = default;

    MSGPACK_FIELDS(hintKey, treeId, leaf, lowLeavesWitnessData, insertionWitnessData, stateAfter);
};

// Hint for MerkleTreeDB.appendLeaves.
// Note: only supported for NOTE_HASH_TREE and L1_TO_L2_MESSAGE_TREE.
struct AppendLeavesHint {
    AppendOnlyTreeSnapshot hintKey;
    AppendOnlyTreeSnapshot stateAfter;
    // params
    world_state::MerkleTreeId treeId;
    std::vector<FF> leaves;

    bool operator==(const AppendLeavesHint& other) const = default;

    MSGPACK_FIELDS(hintKey, stateAfter, treeId, leaves);
};

struct CheckpointActionNoStateChangeHint {
    // key
    uint32_t actionCounter;
    // current checkpoint evolution
    uint32_t oldCheckpointId;
    uint32_t newCheckpointId;

    bool operator==(const CheckpointActionNoStateChangeHint& other) const = default;

    MSGPACK_FIELDS(actionCounter, oldCheckpointId, newCheckpointId);
};

using CreateCheckpointHint = CheckpointActionNoStateChangeHint;
using CommitCheckpointHint = CheckpointActionNoStateChangeHint;

struct RevertCheckpointHint {
    // key
    uint32_t actionCounter;
    // current checkpoint evolution
    uint32_t oldCheckpointId;
    uint32_t newCheckpointId;
    // state evolution
    TreeSnapshots stateBefore;
    TreeSnapshots stateAfter;

    bool operator==(const RevertCheckpointHint& other) const = default;

    MSGPACK_FIELDS(actionCounter, oldCheckpointId, newCheckpointId, stateBefore, stateAfter);
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
    std::vector<FF> noteHashes;
    std::vector<FF> nullifiers;
    std::vector<ScopedL2ToL1Message> l2ToL1Messages;

    bool operator==(const AccumulatedData& other) const = default;

    MSGPACK_FIELDS(noteHashes, nullifiers, l2ToL1Messages);
};

// We are currently using this structure as the input to TX simulation.
// That's why I'm not calling it TxHint. We can reconsider if the inner types seem to dirty.
struct Tx {
    std::string hash;
    GasSettings gasSettings;
    GasFees effectiveGasFees;
    ContractDeploymentData nonRevertibleContractDeploymentData;
    ContractDeploymentData revertibleContractDeploymentData;
    AccumulatedData nonRevertibleAccumulatedData;
    AccumulatedData revertibleAccumulatedData;
    std::vector<PublicCallRequestWithCalldata> setupEnqueuedCalls;
    std::vector<PublicCallRequestWithCalldata> appLogicEnqueuedCalls;
    std::optional<PublicCallRequestWithCalldata> teardownEnqueuedCall;
    Gas gasUsedByPrivate;
    AztecAddress feePayer;
    bool operator==(const Tx& other) const = default;

    MSGPACK_FIELDS(hash,
                   gasSettings,
                   effectiveGasFees,
                   nonRevertibleContractDeploymentData,
                   revertibleContractDeploymentData,
                   nonRevertibleAccumulatedData,
                   revertibleAccumulatedData,
                   setupEnqueuedCalls,
                   appLogicEnqueuedCalls,
                   teardownEnqueuedCall,
                   gasUsedByPrivate,
                   feePayer);
};

struct ExecutionHints {
    GlobalVariables globalVariables;
    Tx tx;
    // Protocol Contracts
    ProtocolContracts protocolContracts;
    // Contracts.
    std::vector<ContractInstanceHint> contractInstances;
    std::vector<ContractClassHint> contractClasses;
    std::vector<BytecodeCommitmentHint> bytecodeCommitments;
    std::vector<DebugFunctionNameHint> debugFunctionNames;
    // Merkle DB.
    TreeSnapshots startingTreeRoots;
    std::vector<GetSiblingPathHint> getSiblingPathHints;
    std::vector<GetPreviousValueIndexHint> getPreviousValueIndexHints;
    std::vector<GetLeafPreimageHint<crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue>>>
        getLeafPreimageHintsPublicDataTree;
    std::vector<GetLeafPreimageHint<crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>>>
        getLeafPreimageHintsNullifierTree;
    std::vector<GetLeafValueHint> getLeafValueHints;
    std::vector<SequentialInsertHint<crypto::merkle_tree::PublicDataLeafValue>> sequentialInsertHintsPublicDataTree;
    std::vector<SequentialInsertHint<crypto::merkle_tree::NullifierLeafValue>> sequentialInsertHintsNullifierTree;
    std::vector<AppendLeavesHint> appendLeavesHints;
    std::vector<CreateCheckpointHint> createCheckpointHints;
    std::vector<CommitCheckpointHint> commitCheckpointHints;
    std::vector<RevertCheckpointHint> revertCheckpointHints;
    std::vector<ContractDBCreateCheckpointHint> contractDBCreateCheckpointHints;
    std::vector<ContractDBCommitCheckpointHint> contractDBCommitCheckpointHints;
    std::vector<ContractDBRevertCheckpointHint> contractDBRevertCheckpointHints;

    bool operator==(const ExecutionHints& other) const = default;

    MSGPACK_FIELDS(globalVariables,
                   tx,
                   protocolContracts,
                   contractInstances,
                   contractClasses,
                   bytecodeCommitments,
                   debugFunctionNames,
                   startingTreeRoots,
                   getSiblingPathHints,
                   getPreviousValueIndexHints,
                   getLeafPreimageHintsPublicDataTree,
                   getLeafPreimageHintsNullifierTree,
                   getLeafValueHints,
                   sequentialInsertHintsPublicDataTree,
                   sequentialInsertHintsNullifierTree,
                   appendLeavesHints,
                   createCheckpointHints,
                   commitCheckpointHints,
                   revertCheckpointHints,
                   contractDBCreateCheckpointHints,
                   contractDBCommitCheckpointHints,
                   contractDBRevertCheckpointHints);
};

////////////////////////////////////////////////////////////////////////////
// AVM Inputs
////////////////////////////////////////////////////////////////////////////
struct AvmProvingInputs {
    PublicInputs publicInputs;
    ExecutionHints hints;

    static AvmProvingInputs from(const std::vector<uint8_t>& data);
    bool operator==(const AvmProvingInputs& other) const = default;

    MSGPACK_FIELDS(publicInputs, hints);
};

struct AvmFastSimulationInputs {
    world_state::WorldStateRevision wsRevision;
    Tx tx;
    GlobalVariables globalVariables;
    ProtocolContracts protocolContracts;

    static AvmFastSimulationInputs from(const std::vector<uint8_t>& data);
    bool operator==(const AvmFastSimulationInputs& other) const = default;

    MSGPACK_FIELDS(wsRevision, tx, globalVariables, protocolContracts);
};

////////////////////////////////////////////////////////////////////////////
// Tx Simulation Result
////////////////////////////////////////////////////////////////////////////

// TODO(fcarreiro): Remove.
// I'm using this structure as dummy content for optionals and vectors that will be empty for now.
struct DummyStructure {
    bool dummy;
    bool operator==(const DummyStructure& other) const = default;
    MSGPACK_FIELDS(dummy);
};

struct TxSimulationResult {
    // Simulation.
    GasUsed gas_used;
    RevertCode revert_code;
    std::optional<DummyStructure> revert_reason;
    // These are only guaranteed to be present in "client initiated simulation" mode.
    // TODO(fcarreiro): Sort these out.
    std::optional<std::vector<DummyStructure>> processed_phases;
    std::optional<std::vector<FF>> app_logic_return_value;
    std::optional<std::vector<DebugLog>> logs;
    // Proving request data.
    PublicInputs public_inputs;
    std::optional<ExecutionHints> execution_hints;

    bool operator==(const TxSimulationResult& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(gas_used,
                              revert_code,
                              revert_reason,
                              processed_phases,
                              app_logic_return_value,
                              logs,
                              public_inputs,
                              execution_hints);
};

} // namespace bb::avm2
