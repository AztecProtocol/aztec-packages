#pragma once
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <ostream>
#include <string>
#include <utility>

namespace bb::crypto::merkle_tree {

struct TreeMeta {
    std::string name;
    uint32_t depth;
    index_t size;
    index_t committedSize;
    bb::fr root;
    index_t initialSize;
    bb::fr initialRoot;
    block_number_t oldestHistoricBlock;
    block_number_t unfinalisedBlockHeight;
    block_number_t finalisedBlockHeight;

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

    TreeMeta(std::string n,
             uint32_t d,
             const index_t& s,
             const index_t& c,
             const bb::fr& r,
             const index_t& is,
             const bb::fr& ir,
             const block_number_t& o,
             const block_number_t& u,
             const block_number_t& f)
        : name(std::move(n))
        , depth(d)
        , size(s)
        , committedSize(c)
        , root(r)
        , initialSize(is)
        , initialRoot(ir)
        , oldestHistoricBlock(o)
        , unfinalisedBlockHeight(u)
        , finalisedBlockHeight(f)
    {}
    TreeMeta() = default;
    ~TreeMeta() = default;
    TreeMeta(const TreeMeta& other) = default;
    TreeMeta(TreeMeta&& other) noexcept { *this = std::move(other); }
    TreeMeta& operator=(const TreeMeta& other) = default;
    TreeMeta& operator=(TreeMeta&& other) noexcept = default;

    bool operator==(const TreeMeta& other) const
    {
        return name == other.name && depth == other.depth && size == other.size &&
               committedSize == other.committedSize && root == other.root && initialRoot == other.initialRoot &&
               initialSize == other.initialSize && unfinalisedBlockHeight == other.unfinalisedBlockHeight &&
               oldestHistoricBlock == other.oldestHistoricBlock && finalisedBlockHeight == other.finalisedBlockHeight;
    }
};

inline std::ostream& operator<<(std::ostream& os, const TreeMeta& meta)
{
    os << "TreeMeta{name: " << meta.name << ", depth: " << meta.depth << ", size: " << std::dec << (meta.size)
       << ", committedSize: " << std::dec << meta.committedSize << ", root: " << meta.root
       << ", initialSize: " << std::dec << meta.initialSize << ", initialRoot: " << meta.initialRoot
       << ", oldestHistoricBlock: " << std::dec << meta.oldestHistoricBlock << ", finalisedBlockHeight: " << std::dec
       << meta.finalisedBlockHeight << ", unfinalisedBlockHeight: " << std::dec << meta.unfinalisedBlockHeight << "}";
    return os;
}

} // namespace bb::crypto::merkle_tree
