// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/wsdb/generated/wsdb_types.hpp"
#include <cstdint>
#include <cstring>
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
    block_number_t unfinalizedBlockHeight;
    block_number_t finalizedBlockHeight;

    SERIALIZATION_FIELDS(name,
                         depth,
                         size,
                         committedSize,
                         root,
                         initialSize,
                         initialRoot,
                         oldestHistoricBlock,
                         unfinalizedBlockHeight,
                         finalizedBlockHeight)

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
        , unfinalizedBlockHeight(u)
        , finalizedBlockHeight(f)
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
               initialSize == other.initialSize && unfinalizedBlockHeight == other.unfinalizedBlockHeight &&
               oldestHistoricBlock == other.oldestHistoricBlock && finalizedBlockHeight == other.finalizedBlockHeight;
    }

    static TreeMeta from_wire(const bb::wsdb::wire::TreeMeta& w)
    {
        TreeMeta r;
        r.name = w.name;
        r.depth = w.depth;
        r.size = w.size;
        r.committedSize = w.committedSize;
        r.root = bb::fr::serialize_from_buffer(w.root.data());
        r.initialSize = w.initialSize;
        r.initialRoot = bb::fr::serialize_from_buffer(w.initialRoot.data());
        r.oldestHistoricBlock = w.oldestHistoricBlock;
        r.unfinalizedBlockHeight = w.unfinalizedBlockHeight;
        r.finalizedBlockHeight = w.finalizedBlockHeight;
        return r;
    }

    bb::wsdb::wire::TreeMeta to_wire() const
    {
        bb::wsdb::wire::TreeMeta w;
        w.name = name;
        w.depth = depth;
        w.size = size;
        w.committedSize = committedSize;
        bb::fr::serialize_to_buffer(root, w.root.data());
        w.initialSize = initialSize;
        bb::fr::serialize_to_buffer(initialRoot, w.initialRoot.data());
        w.oldestHistoricBlock = oldestHistoricBlock;
        w.unfinalizedBlockHeight = unfinalizedBlockHeight;
        w.finalizedBlockHeight = finalizedBlockHeight;
        return w;
    }
};

inline std::ostream& operator<<(std::ostream& os, const TreeMeta& meta)
{
    os << "TreeMeta{name: " << meta.name << ", depth: " << meta.depth << ", size: " << std::dec << (meta.size)
       << ", committedSize: " << std::dec << meta.committedSize << ", root: " << meta.root
       << ", initialSize: " << std::dec << meta.initialSize << ", initialRoot: " << meta.initialRoot
       << ", oldestHistoricBlock: " << std::dec << meta.oldestHistoricBlock << ", finalizedBlockHeight: " << std::dec
       << meta.finalizedBlockHeight << ", unfinalizedBlockHeight: " << std::dec << meta.unfinalizedBlockHeight << "}";
    return os;
}

} // namespace bb::crypto::merkle_tree
