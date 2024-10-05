#pragma once
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <string>

namespace bb::crypto::merkle_tree {

struct TreeMeta {
    std::string name;
    uint32_t depth;
    index_t size;
    index_t committedSize;
    bb::fr root;
    index_t initialSize;
    bb::fr initialRoot;
    uint64_t oldestHistoricBlock;
    uint64_t unfinalisedBlockHeight;
    uint64_t finalisedBlockHeight;

    MSGPACK_FIELDS(name,
                   depth,
                   size,
                   committedSize,
                   root,
                   initialSize,
                   initialRoot,
                   oldestHistoricBlock,
                   unfinalisedBlockHeight,
                   finalisedBlockHeight)

    bool operator==(const TreeMeta& other) const
    {
        return name == other.name && depth == other.depth && size == other.size &&
               committedSize == other.committedSize && root == other.root && initialRoot == other.initialRoot &&
               initialSize == other.initialSize && unfinalisedBlockHeight == other.unfinalisedBlockHeight &&
               oldestHistoricBlock == other.oldestHistoricBlock && finalisedBlockHeight == other.finalisedBlockHeight;
    }
};

struct LeavesMeta {
    index_t size;

    MSGPACK_FIELDS(size)

    bool operator==(const LeavesMeta& other) const { return size == other.size; }
};

} // namespace bb::crypto::merkle_tree
