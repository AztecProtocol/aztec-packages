#pragma once
/**
 * @file wsdb_commands.hpp
 * @brief NamedUnion command structs for the aztec-wsdb world state database API.
 *
 * Each command follows the bbapi pattern:
 *   - static constexpr MSGPACK_SCHEMA_NAME for NamedUnion dispatch
 *   - Nested Response struct with its own MSGPACK_SCHEMA_NAME
 *   - Request fields with SERIALIZATION_FIELDS
 *   - execute(WsdbRequest&) && method (implemented in wsdb_execute.cpp)
 */

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/fork.hpp"
#include "barretenberg/world_state/types.hpp"
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

// Forward declaration
struct WsdbRequest;

// ---------------------------------------------------------------------------
// Tree info / state queries
// ---------------------------------------------------------------------------

struct WsdbGetTreeInfo {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetTreeInfo";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetTreeInfoResponse";
        MerkleTreeId treeId;
        fr root;
        index_t size;
        uint32_t depth;
        SERIALIZATION_FIELDS(treeId, root, size, depth);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    WorldStateRevision revision;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, revision);
    bool operator==(const WsdbGetTreeInfo&) const = default;
};

struct WsdbGetStateReference {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetStateReference";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetStateReferenceResponse";
        StateReference state;
        SERIALIZATION_FIELDS(state);
        bool operator==(const Response&) const = default;
    };
    WorldStateRevision revision;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(revision);
    bool operator==(const WsdbGetStateReference&) const = default;
};

struct WsdbGetInitialStateReference {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetInitialStateReference";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetInitialStateReferenceResponse";
        StateReference state;
        SERIALIZATION_FIELDS(state);
        bool operator==(const Response&) const = default;
    };
    Response execute(WsdbRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const WsdbGetInitialStateReference&) const = default;
};

// ---------------------------------------------------------------------------
// Leaf queries
// ---------------------------------------------------------------------------

struct WsdbGetLeafValue {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetLeafValue";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetLeafValueResponse";
        // Polymorphic: Fr, NullifierLeafValue, or PublicDataLeafValue serialized as bytes
        std::optional<std::vector<uint8_t>> value;
        SERIALIZATION_FIELDS(value);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    WorldStateRevision revision;
    index_t leafIndex;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, revision, leafIndex);
    bool operator==(const WsdbGetLeafValue&) const = default;
};

struct WsdbGetLeafPreimage {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetLeafPreimage";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetLeafPreimageResponse";
        // Serialized indexed leaf (NullifierLeafValue or PublicDataLeafValue)
        std::optional<std::vector<uint8_t>> preimage;
        SERIALIZATION_FIELDS(preimage);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    WorldStateRevision revision;
    index_t leafIndex;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, revision, leafIndex);
    bool operator==(const WsdbGetLeafPreimage&) const = default;
};

struct WsdbGetSiblingPath {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetSiblingPath";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetSiblingPathResponse";
        fr_sibling_path path;
        SERIALIZATION_FIELDS(path);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    WorldStateRevision revision;
    index_t leafIndex;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, revision, leafIndex);
    bool operator==(const WsdbGetSiblingPath&) const = default;
};

struct WsdbGetBlockNumbersForLeafIndices {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetBlockNumbersForLeafIndices";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetBlockNumbersForLeafIndicesResponse";
        std::vector<std::optional<block_number_t>> blockNumbers;
        SERIALIZATION_FIELDS(blockNumbers);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    WorldStateRevision revision;
    std::vector<index_t> leafIndices;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, revision, leafIndices);
    bool operator==(const WsdbGetBlockNumbersForLeafIndices&) const = default;
};

// ---------------------------------------------------------------------------
// Leaf search operations
// ---------------------------------------------------------------------------

struct WsdbFindLeafIndices {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbFindLeafIndices";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbFindLeafIndicesResponse";
        std::vector<std::optional<index_t>> indices;
        SERIALIZATION_FIELDS(indices);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    WorldStateRevision revision;
    // Polymorphic leaves: each leaf is serialized as bytes
    std::vector<std::vector<uint8_t>> leaves;
    index_t startIndex;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, revision, leaves, startIndex);
    bool operator==(const WsdbFindLeafIndices&) const = default;
};

struct WsdbFindLowLeaf {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbFindLowLeaf";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbFindLowLeafResponse";
        bool alreadyPresent;
        index_t index;
        SERIALIZATION_FIELDS(alreadyPresent, index);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    WorldStateRevision revision;
    fr key;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, revision, key);
    bool operator==(const WsdbFindLowLeaf&) const = default;
};

struct WsdbFindSiblingPaths {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbFindSiblingPaths";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbFindSiblingPathsResponse";
        std::vector<std::optional<SiblingPathAndIndex>> paths;
        SERIALIZATION_FIELDS(paths);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    WorldStateRevision revision;
    // Polymorphic leaves
    std::vector<std::vector<uint8_t>> leaves;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, revision, leaves);
    bool operator==(const WsdbFindSiblingPaths&) const = default;
};

// ---------------------------------------------------------------------------
// Tree mutation operations
// ---------------------------------------------------------------------------

struct WsdbAppendLeaves {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbAppendLeaves";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbAppendLeavesResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    // Polymorphic leaves
    std::vector<std::vector<uint8_t>> leaves;
    Fork::Id forkId{ CANONICAL_FORK_ID };
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, leaves, forkId);
    bool operator==(const WsdbAppendLeaves&) const = default;
};

struct WsdbBatchInsert {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbBatchInsert";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbBatchInsertResponse";
        // Serialized BatchInsertionResult
        std::vector<uint8_t> result;
        SERIALIZATION_FIELDS(result);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    std::vector<std::vector<uint8_t>> leaves;
    uint32_t subtreeDepth;
    Fork::Id forkId{ CANONICAL_FORK_ID };
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, leaves, subtreeDepth, forkId);
    bool operator==(const WsdbBatchInsert&) const = default;
};

struct WsdbSequentialInsert {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbSequentialInsert";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbSequentialInsertResponse";
        // Serialized SequentialInsertionResult
        std::vector<uint8_t> result;
        SERIALIZATION_FIELDS(result);
        bool operator==(const Response&) const = default;
    };
    MerkleTreeId treeId;
    std::vector<std::vector<uint8_t>> leaves;
    Fork::Id forkId{ CANONICAL_FORK_ID };
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(treeId, leaves, forkId);
    bool operator==(const WsdbSequentialInsert&) const = default;
};

struct WsdbUpdateArchive {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbUpdateArchive";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbUpdateArchiveResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    StateReference blockStateRef;
    bb::fr blockHeaderHash;
    Fork::Id forkId{ CANONICAL_FORK_ID };
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(blockStateRef, blockHeaderHash, forkId);
    bool operator==(const WsdbUpdateArchive&) const = default;
};

// ---------------------------------------------------------------------------
// Transaction operations
// ---------------------------------------------------------------------------

struct WsdbCommit {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCommit";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCommitResponse";
        WorldStateStatusFull status;
        SERIALIZATION_FIELDS(status);
        bool operator==(const Response&) const = default;
    };
    Response execute(WsdbRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const WsdbCommit&) const = default;
};

struct WsdbRollback {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbRollback";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbRollbackResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    Response execute(WsdbRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const WsdbRollback&) const = default;
};

// ---------------------------------------------------------------------------
// Block synchronization
// ---------------------------------------------------------------------------

struct WsdbSyncBlock {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbSyncBlock";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbSyncBlockResponse";
        WorldStateStatusFull status;
        SERIALIZATION_FIELDS(status);
        bool operator==(const Response&) const = default;
    };
    block_number_t blockNumber;
    StateReference blockStateRef;
    bb::fr blockHeaderHash;
    bb::fr expectedArchiveRoot;
    bb::fr expectedPreviousArchiveRoot;
    std::vector<bb::fr> paddedNoteHashes;
    std::vector<bb::fr> paddedL1ToL2Messages;
    std::vector<NullifierLeafValue> paddedNullifiers;
    std::vector<PublicDataLeafValue> publicDataWrites;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(blockNumber,
                         blockStateRef,
                         blockHeaderHash,
                         expectedArchiveRoot,
                         expectedPreviousArchiveRoot,
                         paddedNoteHashes,
                         paddedL1ToL2Messages,
                         paddedNullifiers,
                         publicDataWrites);
    bool operator==(const WsdbSyncBlock&) const = default;
};

// ---------------------------------------------------------------------------
// Fork management
// ---------------------------------------------------------------------------

struct WsdbCreateFork {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCreateFork";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCreateForkResponse";
        uint64_t forkId;
        SERIALIZATION_FIELDS(forkId);
        bool operator==(const Response&) const = default;
    };
    bool latest;
    block_number_t blockNumber;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(latest, blockNumber);
    bool operator==(const WsdbCreateFork&) const = default;
};

struct WsdbDeleteFork {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbDeleteFork";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbDeleteForkResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const WsdbDeleteFork&) const = default;
};

// ---------------------------------------------------------------------------
// Block management
// ---------------------------------------------------------------------------

struct WsdbFinalizeBlocks {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbFinalizeBlocks";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbFinalizeBlocksResponse";
        WorldStateStatusSummary status;
        SERIALIZATION_FIELDS(status);
        bool operator==(const Response&) const = default;
    };
    block_number_t toBlockNumber;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(toBlockNumber);
    bool operator==(const WsdbFinalizeBlocks&) const = default;
};

struct WsdbUnwindBlocks {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbUnwindBlocks";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbUnwindBlocksResponse";
        WorldStateStatusFull status;
        SERIALIZATION_FIELDS(status);
        bool operator==(const Response&) const = default;
    };
    block_number_t toBlockNumber;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(toBlockNumber);
    bool operator==(const WsdbUnwindBlocks&) const = default;
};

struct WsdbRemoveHistoricalBlocks {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbRemoveHistoricalBlocks";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbRemoveHistoricalBlocksResponse";
        WorldStateStatusFull status;
        SERIALIZATION_FIELDS(status);
        bool operator==(const Response&) const = default;
    };
    block_number_t toBlockNumber;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(toBlockNumber);
    bool operator==(const WsdbRemoveHistoricalBlocks&) const = default;
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

struct WsdbGetStatus {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetStatus";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbGetStatusResponse";
        WorldStateStatusSummary status;
        SERIALIZATION_FIELDS(status);
        bool operator==(const Response&) const = default;
    };
    Response execute(WsdbRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const WsdbGetStatus&) const = default;
};

// ---------------------------------------------------------------------------
// Checkpoint operations
// ---------------------------------------------------------------------------

struct WsdbCreateCheckpoint {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCreateCheckpoint";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCreateCheckpointResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const WsdbCreateCheckpoint&) const = default;
};

struct WsdbCommitCheckpoint {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCommitCheckpoint";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCommitCheckpointResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const WsdbCommitCheckpoint&) const = default;
};

struct WsdbRevertCheckpoint {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbRevertCheckpoint";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbRevertCheckpointResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const WsdbRevertCheckpoint&) const = default;
};

struct WsdbCommitAllCheckpoints {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCommitAllCheckpoints";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCommitAllCheckpointsResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const WsdbCommitAllCheckpoints&) const = default;
};

struct WsdbRevertAllCheckpoints {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbRevertAllCheckpoints";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbRevertAllCheckpointsResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    uint64_t forkId;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(forkId);
    bool operator==(const WsdbRevertAllCheckpoints&) const = default;
};

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

struct WsdbCopyStores {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCopyStores";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbCopyStoresResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    std::string dstPath;
    std::optional<bool> compact;
    Response execute(WsdbRequest& request) &&;
    SERIALIZATION_FIELDS(dstPath, compact);
    bool operator==(const WsdbCopyStores&) const = default;
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

struct WsdbShutdown {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbShutdown";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbShutdownResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    void msgpack(auto&& pack_fn) { pack_fn(); }
    Response execute(WsdbRequest& request) &&;
    bool operator==(const WsdbShutdown&) const = default;
};

} // namespace bb::wsdb
