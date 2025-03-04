// NOTE: names are in camel-case because they matter to messagepack.
// DO NOT use camel-case outside of these structures.
#pragma once

#include <vector>

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

////////////////////////////////////////////////////////////////////////////
// Hints
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
    AztecAddress address;
    bool exists;
    FF salt;
    AztecAddress deployer;
    ContractClassId currentContractClassId;
    ContractClassId originalContractClassId;
    FF initializationHash;
    PublicKeysHint publicKeys;
    // TODO: missing membership hints.

    bool operator==(const ContractInstanceHint& other) const = default;

    MSGPACK_FIELDS(address,
                   exists,
                   salt,
                   deployer,
                   currentContractClassId,
                   originalContractClassId,
                   initializationHash,
                   publicKeys);
};

struct ContractClassHint {
    FF classId;
    FF artifactHash;
    FF privateFunctionsRoot;
    FF publicBytecodeCommitment;
    std::vector<uint8_t> packedBytecode;

    bool operator==(const ContractClassHint& other) const = default;

    MSGPACK_FIELDS(classId, artifactHash, privateFunctionsRoot, publicBytecodeCommitment, packedBytecode);
};

struct EnqueuedCallHint {
    AztecAddress contractAddress;
    std::vector<FF> calldata;

    bool operator==(const EnqueuedCallHint& other) const = default;

    MSGPACK_FIELDS(contractAddress, calldata);
};

struct ExecutionHints {
    std::vector<EnqueuedCallHint> enqueuedCalls;
    std::vector<ContractInstanceHint> contractInstances;
    std::vector<ContractClassHint> contractClasses;

    bool operator==(const ExecutionHints& other) const = default;

    MSGPACK_FIELDS(enqueuedCalls, contractInstances, contractClasses);
};

////////////////////////////////////////////////////////////////////////////
// Public Inputs
////////////////////////////////////////////////////////////////////////////
struct AppendOnlyTreeSnapshot {
    FF root;
    uint32_t nextAvailableLeafIndex;

    bool operator==(const AppendOnlyTreeSnapshot& other) const = default;

    MSGPACK_FIELDS(root, nextAvailableLeafIndex);
};

struct TreeSnapshots {
    AppendOnlyTreeSnapshot l1ToL2MessageTree;
    AppendOnlyTreeSnapshot noteHashTree;
    AppendOnlyTreeSnapshot nullifierTree;
    AppendOnlyTreeSnapshot publicDataTree;

    bool operator==(const TreeSnapshots& other) const = default;

    MSGPACK_FIELDS(l1ToL2MessageTree, noteHashTree, nullifierTree, publicDataTree);
};

struct PublicInputs {
    TreeSnapshots startTreeSnapshots;
    bool reverted;

    static PublicInputs from(const std::vector<uint8_t>& data);
    std::vector<std::vector<FF>> to_columns() const { return { { reverted } }; }
    bool operator==(const PublicInputs& other) const = default;

    MSGPACK_FIELDS(startTreeSnapshots, reverted);
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

} // namespace bb::avm2
