#pragma once
/**
 * @file cdb_commands.hpp
 * @brief NamedUnion command structs for the aztec-cdb contracts database API.
 *
 * Each command follows the bbapi pattern:
 *   - static constexpr MSGPACK_SCHEMA_NAME for NamedUnion dispatch
 *   - Nested Response struct with its own MSGPACK_SCHEMA_NAME
 *   - Request fields with SERIALIZATION_FIELDS
 *   - execute(CdbRequest&) && method (implemented in cdb_execute.cpp)
 */

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

#include <optional>
#include <string>
#include <vector>

namespace bb::cdb {

// Forward declaration
struct CdbRequest;

// ---------------------------------------------------------------------------
// Contract queries (matching ContractDBInterface)
// ---------------------------------------------------------------------------

struct CdbGetContractInstance {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetContractInstance";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetContractInstanceResponse";
        std::optional<avm2::ContractInstance> instance;
        SERIALIZATION_FIELDS(instance);
        bool operator==(const Response&) const = default;
    };
    avm2::AztecAddress address;
    uint64_t forkId = 0;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(address, forkId);
    bool operator==(const CdbGetContractInstance&) const = default;
};

struct CdbGetContractClass {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetContractClass";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetContractClassResponse";
        std::optional<avm2::ContractClass> contractClass;
        SERIALIZATION_FIELDS(contractClass);
        bool operator==(const Response&) const = default;
    };
    avm2::ContractClassId classId;
    uint64_t forkId = 0;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(classId, forkId);
    bool operator==(const CdbGetContractClass&) const = default;
};

struct CdbGetBytecodeCommitment {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetBytecodeCommitment";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetBytecodeCommitmentResponse";
        std::optional<avm2::FF> commitment;
        SERIALIZATION_FIELDS(commitment);
        bool operator==(const Response&) const = default;
    };
    avm2::ContractClassId classId;
    uint64_t forkId = 0;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(classId, forkId);
    bool operator==(const CdbGetBytecodeCommitment&) const = default;
};

struct CdbGetDebugFunctionName {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetDebugFunctionName";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetDebugFunctionNameResponse";
        std::optional<std::string> name;
        SERIALIZATION_FIELDS(name);
        bool operator==(const Response&) const = default;
    };
    avm2::AztecAddress address;
    avm2::FunctionSelector selector;
    uint64_t forkId = 0;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(address, selector, forkId);
    bool operator==(const CdbGetDebugFunctionName&) const = default;
};

// ---------------------------------------------------------------------------
// Contract mutation (used by AVM during simulation)
// ---------------------------------------------------------------------------

struct CdbAddContracts {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbAddContracts";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbAddContractsResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    avm2::ContractDeploymentData contractDeploymentData;
    uint64_t forkId = 0;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(contractDeploymentData, forkId);
    bool operator==(const CdbAddContracts&) const = default;
};

// ---------------------------------------------------------------------------
// Checkpoint operations (tx-scoped rollback support)
// ---------------------------------------------------------------------------

struct CdbCreateCheckpoint {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbCreateCheckpoint";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbCreateCheckpointResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId = 0;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const CdbCreateCheckpoint&) const = default;
};

struct CdbCommitCheckpoint {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbCommitCheckpoint";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbCommitCheckpointResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId = 0;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const CdbCommitCheckpoint&) const = default;
};

struct CdbRevertCheckpoint {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbRevertCheckpoint";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbRevertCheckpointResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId = 0;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const CdbRevertCheckpoint&) const = default;
};

// ---------------------------------------------------------------------------
// Management operations (used by TS node to populate store)
// ---------------------------------------------------------------------------

struct CdbAddContractClass {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbAddContractClass";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbAddContractClassResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    avm2::ContractClass contractClass;
    avm2::FF bytecodeCommitment;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(contractClass, bytecodeCommitment);
    bool operator==(const CdbAddContractClass&) const = default;
};

struct CdbAddContractInstance {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbAddContractInstance";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbAddContractInstanceResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    avm2::AztecAddress address;
    avm2::ContractInstance instance;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(address, instance);
    bool operator==(const CdbAddContractInstance&) const = default;
};

struct CdbRegisterFunctionSignatures {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbRegisterFunctionSignatures";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbRegisterFunctionSignaturesResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    std::vector<std::string> signatures;
    Response execute(CdbRequest& request) &&;
    SERIALIZATION_FIELDS(signatures);
    bool operator==(const CdbRegisterFunctionSignatures&) const = default;
};

struct CdbGetContractClassIds {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetContractClassIds";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbGetContractClassIdsResponse";
        std::vector<avm2::FF> classIds;
        SERIALIZATION_FIELDS(classIds);
        bool operator==(const Response&) const = default;
    };
    Response execute(CdbRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const CdbGetContractClassIds&) const = default;
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

struct CdbShutdown {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbShutdown";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbShutdownResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    void msgpack(auto&& pack_fn) { pack_fn(); }
    Response execute(CdbRequest& request) &&;
    bool operator==(const CdbShutdown&) const = default;
};

} // namespace bb::cdb
