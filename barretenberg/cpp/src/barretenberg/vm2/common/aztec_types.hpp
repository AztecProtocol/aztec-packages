#pragma once

#include <cstdint>
#include <stdexcept>
#include <vector>

#include "barretenberg/common/streams.hpp" // Derives operator<< from MSGPACK_FIELDS.
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

using AztecAddress = FF;
using BytecodeId = FF;
using ContractClassId = FF;
using PC = uint32_t;
using AffinePoint = grumpkin::g1::affine_element;
// In typescript the EthAddress is a byte vector, but in our circuit implementation
// it's represented as a field element for simplicity
using EthAddress = FF;

using FunctionSelector = FF; // really a 4-byte BE buffer in TS, but we use FF for simplicity

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
    TREE_PADDING = 11,
    CLEANUP = 12,
    LAST = CLEANUP,
};

using InternalCallId = uint32_t;

/**
 * Enum for environment variables, representing the various environment values
 * that can be accessed by the AVM GETENVVAR opcode.
 */
enum class EnvironmentVariable {
    ADDRESS,
    SENDER,
    TRANSACTIONFEE,
    CHAINID,
    VERSION,
    BLOCKNUMBER,
    TIMESTAMP,
    BASEFEEPERL2GAS,
    BASEFEEPERDAGAS,
    ISSTATICCALL,
    L2GASLEFT,
    DAGASLEFT,
    MAX = DAGASLEFT,
};

enum class ContractInstanceMember {
    DEPLOYER = 0,
    CLASS_ID = 1,
    INIT_HASH = 2,
    MAX = INIT_HASH,
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

    // Custom msgpack with TS camelCase field names
    // TODO(fcarreiro): solve with macro
    void msgpack(auto pack_fn)
    {
        pack_fn("masterNullifierPublicKey",
                nullifier_key,
                "masterIncomingViewingPublicKey",
                incoming_viewing_key,
                "masterOutgoingViewingPublicKey",
                outgoing_viewing_key,
                "masterTaggingPublicKey",
                tagging_key);
    }
};

struct ContractInstance {
    FF salt;
    AztecAddress deployer;
    ContractClassId current_contract_class_id;
    ContractClassId original_contract_class_id;
    FF initialization_hash;
    PublicKeys public_keys;

    bool operator==(const ContractInstance& other) const = default;

    // Custom msgpack with TS camelCase field names
    // TODO(fcarreiro): solve with macro
    void msgpack(auto pack_fn)
    {
        pack_fn(NVP(salt),
                "deployer",
                deployer,
                "currentContractClassId",
                current_contract_class_id,
                "originalContractClassId",
                original_contract_class_id,
                "initializationHash",
                initialization_hash,
                "publicKeys",
                public_keys);
    }
};

// Similar to ContractClassPublicWithCommitment in TS but without:
// - version
// - privateFunctions[]
// - utilityFunctions[]
struct ContractClassWithCommitment {
    FF id;
    FF artifact_hash;
    FF private_functions_root;
    std::vector<uint8_t> packed_bytecode;
    FF public_bytecode_commitment;

    bool operator==(const ContractClassWithCommitment& other) const = default;

    // Custom msgpack with TS camelCase field names
    // TODO(fcarreiro): solve with macro
    void msgpack(auto pack_fn)
    {
        pack_fn(NVP(id),
                "artifactHash",
                artifact_hash,
                "privateFunctionsRoot",
                private_functions_root,
                "packedBytecode",
                packed_bytecode,
                "publicBytecodeCommitment",
                public_bytecode_commitment);
    }
};

// Similar to ContractClassPublic in TS but without:
// - version
// - privateFunctions[]
// - utilityFunctions[]
struct ContractClass {
    FF id;
    FF artifact_hash;
    FF private_functions_root;
    std::vector<uint8_t> packed_bytecode;

    bool operator==(const ContractClass& other) const = default;

    // Custom msgpack with TS camelCase field names
    // TODO(fcarreiro): solve with macro
    void msgpack(auto pack_fn)
    {
        pack_fn(NVP(id),
                "artifactHash",
                artifact_hash,
                "privateFunctionsRoot",
                private_functions_root,
                "packedBytecode",
                packed_bytecode);
    }

    ContractClassWithCommitment with_commitment(const FF& public_bytecode_commitment) const
    {
        return {
            .id = id,
            .artifact_hash = artifact_hash,
            .private_functions_root = private_functions_root,
            .packed_bytecode = packed_bytecode,
            .public_bytecode_commitment = public_bytecode_commitment,
        };
    }
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
    std::vector<FF> fields;
    AztecAddress contractAddress;

    bool operator==(const PublicLog& other) const = default;

    MSGPACK_FIELDS(fields, contractAddress);
};

struct PublicLogs {
    uint32_t length = 0;
    std::array<FF, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH> payload{};
    bool operator==(const PublicLogs& other) const = default;

    PublicLogs() = default;
    PublicLogs(uint32_t length, const std::array<FF, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH>& payload)
        : length(length)
        , payload(payload)
    {}
    PublicLogs(const std::vector<PublicLog>& logs)
        : PublicLogs(from_logs(logs))
    {}

    void add_log(const PublicLog& log)
    {
        // Header
        payload[length] = log.fields.size();
        payload[length + 1] = log.contractAddress;
        // Payload
        for (size_t i = 0; i < log.fields.size(); ++i) {
            payload[length + PUBLIC_LOG_HEADER_LENGTH + i] = log.fields[i];
        }
        length += log.fields.size() + PUBLIC_LOG_HEADER_LENGTH;
    }

    static PublicLogs from_logs(const std::vector<PublicLog>& logs)
    {
        PublicLogs public_logs;
        for (const auto& log : logs) {
            public_logs.add_log(log);
        }
        return public_logs;
    }

    MSGPACK_FIELDS(length, payload);
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
    uint32_t publicDataWrites;

    bool operator==(const AvmAccumulatedDataArrayLengths& other) const = default;

    MSGPACK_FIELDS(noteHashes, nullifiers, l2ToL1Msgs, publicDataWrites);
};

////////////////////////////////////////////////////////////////////////////
// Contract Deployment Data Types
////////////////////////////////////////////////////////////////////////////

struct ContractClassLogFields {
    std::vector<FF> fields;

    bool operator==(const ContractClassLogFields& other) const = default;

    MSGPACK_FIELDS(fields);
};

struct ContractClassLog {
    AztecAddress contractAddress;
    ContractClassLogFields fields;
    uint32_t emittedLength;

    bool operator==(const ContractClassLog& other) const = default;

    MSGPACK_FIELDS(contractAddress, fields, emittedLength);
};

struct PrivateLog {
    std::vector<FF> fields;
    uint32_t emittedLength;

    bool operator==(const PrivateLog& other) const = default;

    MSGPACK_FIELDS(fields, emittedLength);
};

struct ContractDeploymentData {
    std::vector<ContractClassLog> contractClassLogs;
    std::vector<PrivateLog> privateLogs;

    bool operator==(const ContractDeploymentData& other) const = default;

    MSGPACK_FIELDS(contractClassLogs, privateLogs);
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
    std::array<FF, MAX_NOTE_HASHES_PER_TX> noteHashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> l2ToL1Msgs{};

    bool operator==(const PrivateToAvmAccumulatedData& other) const = default;

    MSGPACK_FIELDS(noteHashes, nullifiers, l2ToL1Msgs);
};

struct AvmAccumulatedData {
    std::array<FF, MAX_NOTE_HASHES_PER_TX> noteHashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> l2ToL1Msgs{};
    PublicLogs publicLogs;
    std::array<PublicDataWrite, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX> publicDataWrites{};

    bool operator==(const AvmAccumulatedData& other) const = default;

    MSGPACK_FIELDS(noteHashes, nullifiers, l2ToL1Msgs, publicLogs, publicDataWrites);
};

////////////////////////////////////////////////////////////////////////////
// Global Variables
////////////////////////////////////////////////////////////////////////////

struct GlobalVariables {
    FF chainId;
    FF version;
    uint32_t blockNumber;
    FF slotNumber;
    uint64_t timestamp;
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
    MSGPACK_FIELDS(tree, counter);
};

struct TreeStates {
    TreeState noteHashTree;
    TreeState nullifierTree;
    TreeState l1ToL2MessageTree;
    TreeState publicDataTree;

    bool operator==(const TreeStates& other) const = default;
    MSGPACK_FIELDS(noteHashTree, nullifierTree, l1ToL2MessageTree, publicDataTree);
};

////////////////////////////////////////////////////////////////////////////
// Misc Types
////////////////////////////////////////////////////////////////////////////

enum class DebugLogLevel {
    SILENT = 0,
    FATAL = 1,
    ERROR = 2,
    WARN = 3,
    INFO = 4,
    VERBOSE = 5,
    DEBUG = 6,
    TRACE = 7,
    LAST = TRACE
};

inline bool is_valid_debug_log_level(uint8_t v)
{
    return v <= static_cast<uint8_t>(DebugLogLevel::LAST);
}

inline std::string debug_log_level_to_string(DebugLogLevel lvl)
{
    switch (lvl) {
    case DebugLogLevel::SILENT:
        return "silent";
    case DebugLogLevel::FATAL:
        return "fatal";
    case DebugLogLevel::ERROR:
        return "error";
    case DebugLogLevel::WARN:
        return "warn";
    case DebugLogLevel::INFO:
        return "info";
    case DebugLogLevel::VERBOSE:
        return "verbose";
    case DebugLogLevel::DEBUG:
        return "debug";
    case DebugLogLevel::TRACE:
        return "trace";
    }
}

struct DebugLog {
    AztecAddress contractAddress;
    // Level is a string since on the TS side is a union type of strings
    // We could make it a number but we'd need to/from validation and conversion on the TS side.
    // Consider doing that if it becomes a performance problem.
    std::string level;
    std::string message;
    std::vector<FF> fields;

    bool operator==(const DebugLog& other) const = default;
    MSGPACK_FIELDS(contractAddress, level, message, fields);
};

struct ProtocolContracts {
    std::array<AztecAddress, MAX_PROTOCOL_CONTRACTS> derivedAddresses{};

    bool operator==(const ProtocolContracts& other) const = default;

    MSGPACK_FIELDS(derivedAddresses);
};

inline bool is_protocol_contract_address(const AztecAddress& address)
{
    return !address.is_zero() && static_cast<uint256_t>(address) <= MAX_PROTOCOL_CONTRACTS;
}

inline std::optional<AztecAddress> get_derived_address(const ProtocolContracts& protocol_contracts,
                                                       const AztecAddress& canonical_address)
{
    assert(is_protocol_contract_address(canonical_address) && "Protocol contract canonical address out of bounds");
    AztecAddress derived_address = protocol_contracts.derivedAddresses.at(static_cast<uint32_t>(canonical_address) - 1);
    if (derived_address.is_zero()) {
        return std::nullopt;
    }
    return derived_address;
}

} // namespace bb::avm2
