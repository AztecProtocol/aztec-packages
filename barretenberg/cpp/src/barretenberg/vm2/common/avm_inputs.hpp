// NOTE: names are in camel-case because they matter to messagepack.
// DO NOT use camel-case outside of these structures.
#pragma once

#include <vector>

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

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
    ContractClassId contractClassId;
    FF initializationHash;
    PublicKeysHint publicKeys;
    // TODO: missing membership hints.

    bool operator==(const ContractInstanceHint& other) const = default;

    MSGPACK_FIELDS(address, exists, salt, deployer, contractClassId, initializationHash, publicKeys);
};

struct ContractClassHint {
    FF artifactHash;
    FF privateFunctionsRoot;
    FF publicBytecodeCommitment;
    std::vector<uint8_t> packedBytecode;

    bool operator==(const ContractClassHint& other) const = default;

    MSGPACK_FIELDS(artifactHash, privateFunctionsRoot, publicBytecodeCommitment, packedBytecode);
};

struct TreeRoots {
    FF publicDataTree;
    FF nullifierTree;
    FF noteHashTree;
    FF l1ToL2MessageTree;

    bool operator==(const TreeRoots& other) const = default;

    MSGPACK_FIELDS(publicDataTree, nullifierTree, noteHashTree, l1ToL2MessageTree);
};

struct ExecutionHints {
    std::vector<ContractInstanceHint> contractInstances;
    std::vector<ContractClassHint> contractClasses;
    TreeRoots initialTreeRoots;

    bool operator==(const ExecutionHints& other) const = default;

    MSGPACK_FIELDS(contractInstances, contractClasses, initialTreeRoots);
};

struct PublicExecutionRequest {
    AztecAddress contractAddress;
    AztecAddress sender;
    std::vector<FF> args;
    bool isStatic;

    bool operator==(const PublicExecutionRequest& other) const = default;

    MSGPACK_FIELDS(contractAddress, sender, args, isStatic);
};

struct PublicInputs {
    // Nothing yet.
    std::vector<FF> dummy;

    static PublicInputs from(const std::vector<uint8_t>& data);
    std::vector<std::vector<FF>> to_columns() const { return { dummy }; }
    bool operator==(const PublicInputs& other) const = default;

    MSGPACK_FIELDS(dummy);
};

struct AvmProvingInputs {
    std::vector<PublicExecutionRequest> enqueuedCalls;
    PublicInputs publicInputs;
    ExecutionHints hints;

    static AvmProvingInputs from(const std::vector<uint8_t>& data);
    bool operator==(const AvmProvingInputs& other) const = default;

    MSGPACK_FIELDS(enqueuedCalls, publicInputs, hints);
};

} // namespace bb::avm2