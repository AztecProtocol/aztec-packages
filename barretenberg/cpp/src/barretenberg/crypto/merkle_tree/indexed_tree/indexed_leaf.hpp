// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 22d6fc368da0fbe5412f4f7b2890a052aa48d803 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace bb::crypto::merkle_tree {

template <typename LeafType> struct IndexedLeaf {
    LeafType leaf;
    index_t nextIndex;
    fr nextKey;

    SERIALIZATION_FIELDS(leaf, nextIndex, nextKey)

    IndexedLeaf() = default;

    IndexedLeaf(const LeafType& leaf, const index_t& nextIdx, const fr& nextKey)
        : leaf(leaf)
        , nextIndex(nextIdx)
        , nextKey(nextKey)
    {}

    IndexedLeaf(const IndexedLeaf<LeafType>& other) = default;
    IndexedLeaf(IndexedLeaf<LeafType>&& other) noexcept = default;
    ~IndexedLeaf() = default;

    static bool is_updateable() { return LeafType::is_updateable(); }

    static std::string name() { return LeafType::name(); }

    bool operator==(IndexedLeaf<LeafType> const& other) const
    {
        return leaf == other.leaf && nextKey == other.nextKey && nextIndex == other.nextIndex;
    }

    IndexedLeaf<LeafType>& operator=(IndexedLeaf<LeafType> const& other)
    {
        if (this != &other) {
            leaf = other.leaf;
            nextKey = other.nextKey;
            nextIndex = other.nextIndex;
        }
        return *this;
    }

    IndexedLeaf<LeafType>& operator=(IndexedLeaf<LeafType>&& other) noexcept
    {
        if (this != &other) {
            leaf = other.leaf;
            nextKey = other.nextKey;
            nextIndex = other.nextIndex;
        }
        return *this;
    }

    friend std::ostream& operator<<(std::ostream& os, const IndexedLeaf<LeafType>& leaf)
    {
        os << leaf.leaf << "\nnextIdx = " << leaf.nextIndex << "\nnextKey = " << leaf.nextKey;
        return os;
    }

    std::vector<fr> get_hash_inputs() const { return leaf.get_hash_inputs(nextKey, nextIndex); }

    bool is_empty() { return leaf.is_empty(); }

    static IndexedLeaf<LeafType> empty() { return { LeafType::empty(), 0, 0 }; }

    static IndexedLeaf<LeafType> padding(index_t i) { return { LeafType::padding(i), 0, 0 }; }
};

} // namespace bb::crypto::merkle_tree
