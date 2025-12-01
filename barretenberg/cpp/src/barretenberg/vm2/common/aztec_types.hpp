#pragma once

#include <cstdint>
#include <stdexcept>
#include <vector>

#include "barretenberg/common/streams.hpp" // Derives operator<< from MSGPACK_FIELDS.
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/uint_128_t_adaptor.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "msgpack/adaptor/define_decl.hpp"

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

// The Tx phases are executed in increasing order defined by these enum values.
// Do not change the order of the enum values.
// pil constraints rely on these constants being in consecutive order (increment by 1).
enum class TransactionPhase : uint8_t {
    NR_NULLIFIER_INSERTION = 0,
    NR_NOTE_INSERTION = 1,
    NR_L2_TO_L1_MESSAGE = 2,
    SETUP = 3,
    R_NULLIFIER_INSERTION = 4,
    R_NOTE_INSERTION = 5,
    R_L2_TO_L1_MESSAGE = 6,
    APP_LOGIC = 7,
    TEARDOWN = 8,
    COLLECT_GAS_FEES = 9,
    TREE_PADDING = 10,
    CLEANUP = 11,
    LAST = CLEANUP,
};

// The three following constants are used in .pil files and need to match the enum counterpart.
static_assert(static_cast<uint8_t>(TransactionPhase::SETUP) == AVM_TX_PHASE_VALUE_SETUP,
              "TransactionPhase::LAST must match AVM_TX_PHASE_VALUE_SETUP");
static_assert(static_cast<uint8_t>(TransactionPhase::NR_NULLIFIER_INSERTION) == AVM_TX_PHASE_VALUE_START,
              "TransactionPhase::NR_NULLIFIER_INSERTION must match AVM_TX_PHASE_VALUE_START");
static_assert(static_cast<uint8_t>(TransactionPhase::LAST) == AVM_TX_PHASE_VALUE_LAST,
              "TransactionPhase::LAST must match AVM_TX_PHASE_VALUE_LAST");

using InternalCallId = uint32_t;

/**
 * Enum for environment variables, representing the various environment values
 * that can be accessed by the AVM GETENVVAR opcode.
 */
enum class EnvironmentVariable : uint8_t {
    ADDRESS = 0,
    SENDER = 1,
    TRANSACTIONFEE = 2,
    CHAINID = 3,
    VERSION = 4,
    BLOCKNUMBER = 5,
    TIMESTAMP = 6,
    BASEFEEPERL2GAS = 7,
    BASEFEEPERDAGAS = 8,
    ISSTATICCALL = 9,
    L2GASLEFT = 10,
    DAGASLEFT = 11,
    MAX = DAGASLEFT,
};

enum class ContractInstanceMember : uint8_t {
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
    FF salt = 0;
    AztecAddress deployer = 0;
    ContractClassId current_contract_class_id = 0;
    ContractClassId original_contract_class_id = 0;
    FF initialization_hash = 0;
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
    FF id = 0;
    FF artifact_hash = 0;
    FF private_functions_root = 0;
    std::vector<uint8_t> packed_bytecode;
    FF public_bytecode_commitment = 0;

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
    FF id = 0;
    FF artifact_hash = 0;
    FF private_functions_root = 0;
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
    EthAddress recipient = 0;
    FF content = 0;

    bool operator==(const L2ToL1Message& other) const = default;

    MSGPACK_FIELDS(recipient, content);
};

struct ScopedL2ToL1Message {
    L2ToL1Message message;
    AztecAddress contract_address = 0;

    bool operator==(const ScopedL2ToL1Message& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(message, contract_address);
};

struct PublicLog {
    std::vector<FF> fields;
    AztecAddress contract_address = 0;

    bool operator==(const PublicLog& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(fields, contract_address);
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
        payload[length + 1] = log.contract_address;
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
    FF leaf_slot = 0;
    FF value = 0;

    bool operator==(const PublicDataWrite& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(leaf_slot, value);
};

////////////////////////////////////////////////////////////////////////////
// Gas Types
////////////////////////////////////////////////////////////////////////////

struct GasFees {
    uint128_t fee_per_da_gas = 0;
    uint128_t fee_per_l2_gas = 0;

    bool operator==(const GasFees& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(fee_per_da_gas, fee_per_l2_gas);
};

struct Gas {
    uint32_t l2_gas = 0;
    uint32_t da_gas = 0;

    bool operator==(const Gas& other) const = default;

    Gas operator+(const Gas& other) const { return { l2_gas + other.l2_gas, da_gas + other.da_gas }; }
    Gas operator-(const Gas& other) const { return { l2_gas - other.l2_gas, da_gas - other.da_gas }; }

    MSGPACK_CAMEL_CASE_FIELDS(l2_gas, da_gas);
};

struct GasUsed {
    Gas total_gas;
    Gas teardown_gas;
    Gas public_gas;
    Gas billed_gas;

    bool operator==(const GasUsed& other) const = default;
    MSGPACK_CAMEL_CASE_FIELDS(total_gas, teardown_gas, public_gas, billed_gas);
};

struct GasSettings {
    Gas gas_limits;
    Gas teardown_gas_limits;
    GasFees max_fees_per_gas;
    GasFees max_priority_fees_per_gas;

    bool operator==(const GasSettings& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(gas_limits, teardown_gas_limits, max_fees_per_gas, max_priority_fees_per_gas);
};

////////////////////////////////////////////////////////////////////////////
// Public Call Requests
////////////////////////////////////////////////////////////////////////////

struct PublicCallRequest {
    AztecAddress msg_sender = 0;
    AztecAddress contract_address = 0;
    bool is_static_call = false;
    FF calldata_hash = 0;

    bool operator==(const PublicCallRequest& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(msg_sender, contract_address, is_static_call, calldata_hash);
};

struct PublicCallRequestArrayLengths {
    uint32_t setup_calls = 0;
    uint32_t app_logic_calls = 0;
    bool teardown_call = false;

    bool operator==(const PublicCallRequestArrayLengths& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(setup_calls, app_logic_calls, teardown_call);
};

struct AvmAccumulatedDataArrayLengths {
    uint32_t note_hashes = 0;
    uint32_t nullifiers = 0;
    uint32_t l2_to_l1_msgs = 0;
    uint32_t public_data_writes = 0;

    bool operator==(const AvmAccumulatedDataArrayLengths& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(note_hashes, nullifiers, l2_to_l1_msgs, public_data_writes);
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
    AztecAddress contract_address = 0;
    ContractClassLogFields fields;
    uint32_t emitted_length = 0;

    bool operator==(const ContractClassLog& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(contract_address, fields, emitted_length);
};

struct PrivateLog {
    std::vector<FF> fields;
    uint32_t emitted_length = 0;

    bool operator==(const PrivateLog& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(fields, emitted_length);
};

struct ContractDeploymentData {
    std::vector<ContractClassLog> contract_class_logs;
    std::vector<PrivateLog> private_logs;

    bool operator==(const ContractDeploymentData& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(contract_class_logs, private_logs);
};

////////////////////////////////////////////////////////////////////////////
// Accumulated Data Types
////////////////////////////////////////////////////////////////////////////

struct PrivateToAvmAccumulatedDataArrayLengths {
    uint32_t note_hashes = 0;
    uint32_t nullifiers = 0;
    uint32_t l2_to_l1_msgs = 0;

    bool operator==(const PrivateToAvmAccumulatedDataArrayLengths& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(note_hashes, nullifiers, l2_to_l1_msgs);
};

struct PrivateToAvmAccumulatedData {
    std::array<FF, MAX_NOTE_HASHES_PER_TX> note_hashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> l2_to_l1_msgs{};

    bool operator==(const PrivateToAvmAccumulatedData& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(note_hashes, nullifiers, l2_to_l1_msgs);
};

struct AvmAccumulatedData {
    std::array<FF, MAX_NOTE_HASHES_PER_TX> note_hashes{};
    std::array<FF, MAX_NULLIFIERS_PER_TX> nullifiers{};
    std::array<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> l2_to_l1_msgs{};
    PublicLogs public_logs;
    std::array<PublicDataWrite, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX> public_data_writes{};

    bool operator==(const AvmAccumulatedData& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(note_hashes, nullifiers, l2_to_l1_msgs, public_logs, public_data_writes);
};

////////////////////////////////////////////////////////////////////////////
// Global Variables
////////////////////////////////////////////////////////////////////////////

struct GlobalVariables {
    FF chain_id = 0;
    FF version = 0;
    uint32_t block_number = 0;
    FF slot_number = 0;
    uint64_t timestamp = 0;
    EthAddress coinbase = 0;
    AztecAddress fee_recipient = 0;
    GasFees gas_fees;

    bool operator==(const GlobalVariables& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(
        chain_id, version, block_number, slot_number, timestamp, coinbase, fee_recipient, gas_fees);
};

////////////////////////////////////////////////////////////////////////////
// Tree Snapshots
////////////////////////////////////////////////////////////////////////////

struct AppendOnlyTreeSnapshot {
    FF root = 0;
    uint64_t next_available_leaf_index = 0;

    std::size_t hash() const noexcept { return utils::hash_as_tuple(root, next_available_leaf_index); }
    bool operator==(const AppendOnlyTreeSnapshot& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(root, next_available_leaf_index);
};

struct TreeSnapshots {
    AppendOnlyTreeSnapshot l1_to_l2_message_tree;
    AppendOnlyTreeSnapshot note_hash_tree;
    AppendOnlyTreeSnapshot nullifier_tree;
    AppendOnlyTreeSnapshot public_data_tree;

    bool operator==(const TreeSnapshots& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(l1_to_l2_message_tree, note_hash_tree, nullifier_tree, public_data_tree);
};

struct TreeState {
    AppendOnlyTreeSnapshot tree;
    uint32_t counter = 0;

    bool operator==(const TreeState& other) const = default;
    MSGPACK_FIELDS(tree, counter);
};

struct TreeStates {
    TreeState note_hash_tree;
    TreeState nullifier_tree;
    TreeState l1_to_l2_message_tree;
    TreeState public_data_tree;

    bool operator==(const TreeStates& other) const = default;
    MSGPACK_CAMEL_CASE_FIELDS(note_hash_tree, nullifier_tree, l1_to_l2_message_tree, public_data_tree);
};

////////////////////////////////////////////////////////////////////////////
// Misc Types
////////////////////////////////////////////////////////////////////////////

enum class RevertCode : uint8_t {
    OK,
    APP_LOGIC_REVERTED,
    TEARDOWN_REVERTED,
    BOTH_REVERTED,
};

enum class DebugLogLevel : uint8_t {
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
    AztecAddress contract_address = 0;
    // Level is a string since on the TS side is a union type of strings
    // We could make it a number but we'd need to/from validation and conversion on the TS side.
    // Consider doing that if it becomes a performance problem.
    std::string level;
    std::string message;
    std::vector<FF> fields;

    bool operator==(const DebugLog& other) const = default;
    MSGPACK_CAMEL_CASE_FIELDS(contract_address, level, message, fields);
};

struct ProtocolContracts {
    std::array<AztecAddress, MAX_PROTOCOL_CONTRACTS> derived_addresses{};

    bool operator==(const ProtocolContracts& other) const = default;

    MSGPACK_CAMEL_CASE_FIELDS(derived_addresses);
};

inline bool is_protocol_contract_address(const AztecAddress& address)
{
    return !address.is_zero() && static_cast<uint256_t>(address) <= MAX_PROTOCOL_CONTRACTS;
}

inline std::optional<AztecAddress> get_derived_address(const ProtocolContracts& protocol_contracts,
                                                       const AztecAddress& canonical_address)
{
    assert(is_protocol_contract_address(canonical_address) && "Protocol contract canonical address out of bounds");
    AztecAddress derived_address =
        protocol_contracts.derived_addresses.at(static_cast<uint32_t>(canonical_address) - 1);
    if (derived_address.is_zero()) {
        return std::nullopt;
    }
    return derived_address;
}

} // namespace bb::avm2

MSGPACK_ADD_ENUM(bb::avm2::RevertCode)
