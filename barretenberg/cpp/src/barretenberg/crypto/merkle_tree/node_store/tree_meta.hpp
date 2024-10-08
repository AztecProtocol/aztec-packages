#pragma once
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <ostream>
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
    uint64_t finalisedBlockHeight;
    uint64_t unfinalisedBlockHeight;

    MSGPACK_FIELDS(
        name, depth, size, committedSize, root, initialSize, initialRoot, finalisedBlockHeight, unfinalisedBlockHeight)

    bool operator==(const TreeMeta& other) const
    {
        return name == other.name && depth == other.depth && size == other.size &&
               committedSize == other.committedSize && root == other.root && initialRoot == other.initialRoot &&
               initialSize == other.initialSize && unfinalisedBlockHeight == other.unfinalisedBlockHeight &&
               finalisedBlockHeight == other.finalisedBlockHeight;
    }
};

inline std::ostream& operator<<(std::ostream& os, const TreeMeta& meta)
{
    os << "TreeMeta{name: " << meta.name << ", depth: " << meta.depth << ", size: " << std::dec << (meta.size)
       << ", committedSize: " << std::dec << meta.committedSize << ", root: " << meta.root
       << ", initialSize: " << std::dec << meta.initialSize << ", initialRoot: " << meta.initialRoot
       << ", finalisedBlockHeight: " << std::dec << meta.finalisedBlockHeight
       << ", unfinalisedBlockHeight: " << std::dec << meta.unfinalisedBlockHeight << "}";
    return os;
}

struct LeavesMeta {
    index_t size;

    MSGPACK_FIELDS(size)

    bool operator==(const LeavesMeta& other) const { return size == other.size; }
};

} // namespace bb::crypto::merkle_tree
