#pragma once
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/fork.hpp"
#include "barretenberg/world_state/types.hpp"
#include <cstdint>
#include <optional>
#include <string>

namespace bb::nodejs {

using namespace bb::messaging;
using namespace bb::world_state;

enum WorldStateMessageType {
    GET_TREE_INFO = FIRST_APP_MSG_TYPE,
    GET_STATE_REFERENCE,
    GET_INITIAL_STATE_REFERENCE,

    GET_LEAF_VALUE,
    GET_LEAF_PREIMAGE,
    GET_SIBLING_PATH,
    GET_BLOCK_NUMBERS_FOR_LEAF_INDICES,

    FIND_LEAF_INDICES,
    FIND_LOW_LEAF,
    FIND_SIBLING_PATHS,

    APPEND_LEAVES,
    BATCH_INSERT,
    SEQUENTIAL_INSERT,

    UPDATE_ARCHIVE,

    COMMIT,
    ROLLBACK,

    SYNC_BLOCK,

    CREATE_FORK,
    DELETE_FORK,

    FINALISE_BLOCKS,
    UNWIND_BLOCKS,
    REMOVE_HISTORICAL_BLOCKS,

    GET_STATUS,

    CREATE_CHECKPOINT,
    COMMIT_CHECKPOINT,
    REVERT_CHECKPOINT,
    COMMIT_ALL_CHECKPOINTS,
    REVERT_ALL_CHECKPOINTS,

    COPY_STORES,

    CLOSE = 999,
};

struct TreeIdOnlyRequest {
    MerkleTreeId treeId;
    MSGPACK_FIELDS(treeId);
};

struct CreateForkRequest {
    bool latest;
    block_number_t blockNumber;
    MSGPACK_FIELDS(latest, blockNumber);
};

struct CreateForkResponse {
    uint64_t forkId;
    MSGPACK_FIELDS(forkId);
};

struct DeleteForkRequest {
    uint64_t forkId;
    MSGPACK_FIELDS(forkId);
};

struct ForkIdOnlyRequest {
    uint64_t forkId;
    MSGPACK_FIELDS(forkId);
};

struct TreeIdAndRevisionRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    MSGPACK_FIELDS(treeId, revision);
};

struct EmptyResponse {
    bool ok{ true };
    MSGPACK_FIELDS(ok);
};

struct GetTreeInfoRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    MSGPACK_FIELDS(treeId, revision);
};

struct GetTreeInfoResponse {
    MerkleTreeId treeId;
    fr root;
    index_t size;
    uint32_t depth;
    MSGPACK_FIELDS(treeId, root, size, depth);
};

struct GetStateReferenceRequest {
    WorldStateRevision revision;
    MSGPACK_FIELDS(revision);
};

struct GetStateReferenceResponse {
    StateReference state;
    MSGPACK_FIELDS(state);
};

struct GetInitialStateReferenceResponse {
    StateReference state;
    MSGPACK_FIELDS(state);
};

struct GetLeafValueRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    index_t leafIndex;
    MSGPACK_FIELDS(treeId, revision, leafIndex);
};

struct GetLeafPreimageRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    index_t leafIndex;
    MSGPACK_FIELDS(treeId, revision, leafIndex);
};

struct GetSiblingPathRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    index_t leafIndex;
    MSGPACK_FIELDS(treeId, revision, leafIndex);
};

struct GetBlockNumbersForLeafIndicesRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    std::vector<index_t> leafIndices;
    MSGPACK_FIELDS(treeId, revision, leafIndices);
};

struct GetBlockNumbersForLeafIndicesResponse {
    std::vector<std::optional<block_number_t>> blockNumbers;
    MSGPACK_FIELDS(blockNumbers);
};

template <typename T> struct FindLeafIndicesRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    std::vector<T> leaves;
    index_t startIndex;
    MSGPACK_FIELDS(treeId, revision, leaves, startIndex);
};

struct FindLeafIndicesResponse {
    std::vector<std::optional<index_t>> indices;
    MSGPACK_FIELDS(indices);
};

template <typename T> struct FindLeafPathsRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    std::vector<T> leaves;
    MSGPACK_FIELDS(treeId, revision, leaves);
};

struct FindLeafPathsResponse {
    std::vector<std::optional<SiblingPathAndIndex>> paths;
    MSGPACK_FIELDS(paths);
};

struct FindLowLeafRequest {
    MerkleTreeId treeId;
    WorldStateRevision revision;
    fr key;
    MSGPACK_FIELDS(treeId, revision, key);
};

struct FindLowLeafResponse {
    bool alreadyPresent;
    index_t index;
    MSGPACK_FIELDS(alreadyPresent, index);
};

struct BlockShiftRequest {
    block_number_t toBlockNumber;
    MSGPACK_FIELDS(toBlockNumber);
};

template <typename T> struct AppendLeavesRequest {
    MerkleTreeId treeId;
    std::vector<T> leaves;
    Fork::Id forkId{ CANONICAL_FORK_ID };
    MSGPACK_FIELDS(treeId, leaves, forkId);
};

template <typename T> struct BatchInsertRequest {
    MerkleTreeId treeId;
    std::vector<T> leaves;
    uint32_t subtreeDepth;
    Fork::Id forkId{ CANONICAL_FORK_ID };
    MSGPACK_FIELDS(treeId, leaves, subtreeDepth, forkId);
};

template <typename T> struct InsertRequest {
    MerkleTreeId treeId;
    std::vector<T> leaves;
    Fork::Id forkId{ CANONICAL_FORK_ID };
    MSGPACK_FIELDS(treeId, leaves, forkId);
};

struct UpdateArchiveRequest {
    StateReference blockStateRef;
    bb::fr blockHeaderHash;
    Fork::Id forkId{ CANONICAL_FORK_ID };
    MSGPACK_FIELDS(blockStateRef, blockHeaderHash, forkId);
};

struct SyncBlockRequest {
    block_number_t blockNumber;
    StateReference blockStateRef;
    bb::fr blockHeaderHash;
    std::vector<bb::fr> paddedNoteHashes, paddedL1ToL2Messages;
    std::vector<crypto::merkle_tree::NullifierLeafValue> paddedNullifiers;
    std::vector<crypto::merkle_tree::PublicDataLeafValue> publicDataWrites;

    MSGPACK_FIELDS(blockNumber,
                   blockStateRef,
                   blockHeaderHash,
                   paddedNoteHashes,
                   paddedL1ToL2Messages,
                   paddedNullifiers,
                   publicDataWrites);
};

struct CopyStoresRequest {
    std::string dstPath;
    std::optional<bool> compact;
    MSGPACK_FIELDS(dstPath, compact);
};

} // namespace bb::nodejs

MSGPACK_ADD_ENUM(bb::nodejs::WorldStateMessageType)
