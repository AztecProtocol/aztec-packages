#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

using AztecAddress = FF;
using ContractClassId = FF;
using AffinePoint = grumpkin::g1::affine_element;
// In typescript the EthAddress is a byte vector, but in our circuit implementation
// it's represented as a field element for simplicity
using EthAddress = FF;

enum TransactionPhase {
    NR_NULLIFIER_INSERTION = 1,
    NR_NOTE_INSERTION = 2,
    NR_L2_TO_L1_MESSAGE = 3,
    SETUP = 4,
    R_NULLIFIER_INSERTION = 5,
    R_NOTE_INSERTION = 6,
    R_L2_TO_L1_MESSAGE = 7,
    APP_LOGIC = 8,
    TEARDOWN = 9,
    COLLECT_GAS_FEES = 10,
};

////////////////////////////////////////////////////////////////////////////
// Keys, Instances, Classes
////////////////////////////////////////////////////////////////////////////

struct PublicKeys {
    AffinePoint nullifier_key;
    AffinePoint incoming_viewing_key;
    AffinePoint outgoing_viewing_key;
    AffinePoint tagging_key;

    std::vector<FF> to_fields() const
    {
        return { nullifier_key.x,        nullifier_key.y,        incoming_viewing_key.x, incoming_viewing_key.y,
                 outgoing_viewing_key.x, outgoing_viewing_key.y, tagging_key.x,          tagging_key.y };
    }

    bool operator==(const PublicKeys& other) const = default;
};

struct ContractInstance {
    FF salt;
    AztecAddress deployer_addr;
    ContractClassId current_class_id;
    ContractClassId original_class_id;
    FF initialisation_hash;
    PublicKeys public_keys;

    bool operator==(const ContractInstance& other) const = default;
};

struct ContractClass {
    FF artifact_hash;
    FF private_function_root;
    FF public_bytecode_commitment;
    std::vector<uint8_t> packed_bytecode;
};

////////////////////////////////////////////////////////////////////////////
// Size Effect Types
////////////////////////////////////////////////////////////////////////////

struct L2ToL1Message {
    EthAddress recipient;
    FF content;

    bool operator==(const L2ToL1Message& other) const = default;

    MSGPACK_FIELDS(recipient, content);
};

struct ScopedL2ToL1Message {
    L2ToL1Message message;
    AztecAddress contractAddress;

    bool operator==(const ScopedL2ToL1Message& other) const = default;

    MSGPACK_FIELDS(message, contractAddress);
};

struct PublicLog {
    AztecAddress contractAddress;
    std::array<FF, PUBLIC_LOG_SIZE_IN_FIELDS> fields;
    uint32_t emittedLength;

    bool operator==(const PublicLog& other) const = default;

    MSGPACK_FIELDS(contractAddress, fields, emittedLength);
};

struct PublicDataWrite {
    FF leafSlot;
    FF value;

    bool operator==(const PublicDataWrite& other) const = default;

    MSGPACK_FIELDS(leafSlot, value);
};

////////////////////////////////////////////////////////////////////////////
// Gas Types
////////////////////////////////////////////////////////////////////////////

struct GasFees {
    uint128_t feePerDaGas;
    uint128_t feePerL2Gas;

    bool operator==(const GasFees& other) const = default;

    MSGPACK_FIELDS(feePerDaGas, feePerL2Gas);
};

struct Gas {
    uint32_t l2Gas;
    uint32_t daGas;

    bool operator==(const Gas& other) const = default;

    Gas operator+(const Gas& other) const { return { l2Gas + other.l2Gas, daGas + other.daGas }; }
    Gas operator-(const Gas& other) const { return { l2Gas - other.l2Gas, daGas - other.daGas }; }

    MSGPACK_FIELDS(l2Gas, daGas);
};

struct GasSettings {
    Gas gasLimits;
    Gas teardownGasLimits;
    GasFees maxFeesPerGas;
    GasFees maxPriorityFeesPerGas;

    bool operator==(const GasSettings& other) const = default;

    MSGPACK_FIELDS(gasLimits, teardownGasLimits, maxFeesPerGas, maxPriorityFeesPerGas);
};

////////////////////////////////////////////////////////////////////////////
// Public Call Requests
////////////////////////////////////////////////////////////////////////////

struct PublicCallRequest {
    AztecAddress msgSender;
    AztecAddress contractAddress;
    bool isStaticCall;
    FF calldataHash;

    bool operator==(const PublicCallRequest& other) const = default;

    MSGPACK_FIELDS(msgSender, contractAddress, isStaticCall, calldataHash);
};

struct PublicCallRequestArrayLengths {
    uint32_t setupCalls;
    uint32_t appLogicCalls;
    bool teardownCall;

    bool operator==(const PublicCallRequestArrayLengths& other) const = default;

    MSGPACK_FIELDS(setupCalls, appLogicCalls, teardownCall);
};

struct AvmAccumulatedDataArrayLengths {
    uint32_t noteHashes;
    uint32_t nullifiers;
    uint32_t l2ToL1Msgs;
    uint32_t publicLogs;
    uint32_t publicDataWrites;

    bool operator==(const AvmAccumulatedDataArrayLengths& other) const = default;

    MSGPACK_FIELDS(noteHashes, nullifiers, l2ToL1Msgs, publicLogs, publicDataWrites);
};

////////////////////////////////////////////////////////////////////////////
// Accumulated Data Types
////////////////////////////////////////////////////////////////////////////

struct PrivateToAvmAccumulatedDataArrayLengths {
    uint32_t noteHashes;
    uint32_t nullifiers;
    uint32_t l2ToL1Msgs;

    bool operator==(const PrivateToAvmAccumulatedDataArrayLengths& other) const = default;

    MSGPACK_FIELDS(noteHashes, nullifiers, l2ToL1Msgs);
};

struct PrivateToAvmAccumulatedData {
    std::array<FF, MAX_NOTE_HASHES_PER_TX> noteHashes;
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers;
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> l2ToL1Msgs;

    bool operator==(const PrivateToAvmAccumulatedData& other) const = default;

    MSGPACK_FIELDS(noteHashes, nullifiers, l2ToL1Msgs);
};

struct AvmAccumulatedData {
    std::array<FF, MAX_NOTE_HASHES_PER_TX> noteHashes;
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers;
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> l2ToL1Msgs;
    std::array<PublicLog, MAX_PUBLIC_LOGS_PER_TX> publicLogs;
    std::array<PublicDataWrite, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX> publicDataWrites;

    bool operator==(const AvmAccumulatedData& other) const = default;

    MSGPACK_FIELDS(noteHashes, nullifiers, l2ToL1Msgs, publicLogs, publicDataWrites);
};

////////////////////////////////////////////////////////////////////////////
// Global Variables
////////////////////////////////////////////////////////////////////////////

struct GlobalVariables {
    FF chainId;
    FF version;
    FF blockNumber;
    FF slotNumber;
    FF timestamp;
    EthAddress coinbase;
    AztecAddress feeRecipient;
    GasFees gasFees;

    bool operator==(const GlobalVariables& other) const = default;

    MSGPACK_FIELDS(chainId, version, blockNumber, slotNumber, timestamp, coinbase, feeRecipient, gasFees);
};

////////////////////////////////////////////////////////////////////////////
// Tree Snapshots
////////////////////////////////////////////////////////////////////////////

struct AppendOnlyTreeSnapshot {
    FF root;
    uint64_t nextAvailableLeafIndex;

    std::size_t hash() const noexcept { return utils::hash_as_tuple(root, nextAvailableLeafIndex); }
    bool operator==(const AppendOnlyTreeSnapshot& other) const = default;
    friend std::ostream& operator<<(std::ostream& os, const AppendOnlyTreeSnapshot& obj)
    {
        os << "root: " << obj.root << ", nextAvailableLeafIndex: " << obj.nextAvailableLeafIndex;
        return os;
    }

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

struct TreeState {
    AppendOnlyTreeSnapshot tree;
    uint32_t counter;

    bool operator==(const TreeState& other) const = default;
};

struct TreeStates {
    TreeState noteHashTree;
    TreeState nullifierTree;
    TreeState l1ToL2MessageTree;
    TreeState publicDataTree;

    bool operator==(const TreeStates& other) const = default;
};

} // namespace bb::avm2
