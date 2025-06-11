// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/utils.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::crypto::merkle_tree {

struct NullifierLeafValue {
    fr nullifier;

    MSGPACK_FIELDS(nullifier)

    NullifierLeafValue() = default;
    NullifierLeafValue(const fr& n)
        : nullifier(n)
    {}
    NullifierLeafValue(const NullifierLeafValue& other) = default;
    NullifierLeafValue(NullifierLeafValue&& other) = default;
    NullifierLeafValue& operator=(const NullifierLeafValue& other)
    {
        if (this != &other) {
            nullifier = other.nullifier;
        }
        return *this;
    }

    NullifierLeafValue& operator=(NullifierLeafValue&& other) noexcept
    {
        if (this != &other) {
            nullifier = other.nullifier;
        }
        return *this;
    }
    ~NullifierLeafValue() = default;

    static bool is_updateable() { return false; }

    bool operator==(NullifierLeafValue const& other) const { return nullifier == other.nullifier; }

    friend std::ostream& operator<<(std::ostream& os, const NullifierLeafValue& v)
    {
        os << "nullifier = " << v.nullifier;
        return os;
    }

    fr get_key() const { return nullifier; }

    bool is_empty() const { return nullifier.is_zero(); }

    std::vector<fr> get_hash_inputs(fr nextKey, fr nextIndex) const
    {
        return std::vector<fr>({ nullifier, nextKey, nextIndex });
    }

    operator uint256_t() const { return get_key(); }

    static NullifierLeafValue empty() { return { fr::zero() }; }

    static NullifierLeafValue padding(index_t i) { return { i }; }

    static std::string name() { return "NullifierLeafValue"; };

    size_t hash() const noexcept { return std::hash<fr>{}(nullifier); }
};

struct PublicDataLeafValue {
    fr slot;
    fr value;

    MSGPACK_FIELDS(slot, value)

    PublicDataLeafValue() = default;
    PublicDataLeafValue(const fr& s, const fr& v)
        : slot(s)
        , value(v)
    {}
    PublicDataLeafValue(const PublicDataLeafValue& other) = default;
    PublicDataLeafValue(PublicDataLeafValue&& other) = default;
    PublicDataLeafValue& operator=(const PublicDataLeafValue& other)
    {
        if (this != &other) {
            value = other.value;
            slot = other.slot;
        }
        return *this;
    }

    PublicDataLeafValue& operator=(PublicDataLeafValue&& other) noexcept
    {
        if (this != &other) {
            value = other.value;
            slot = other.slot;
        }
        return *this;
    }
    ~PublicDataLeafValue() = default;

    static bool is_updateable() { return true; }

    bool operator==(PublicDataLeafValue const& other) const { return value == other.value && slot == other.slot; }

    friend std::ostream& operator<<(std::ostream& os, const PublicDataLeafValue& v)
    {
        os << "slot = " << v.slot << " : value = " << v.value;
        return os;
    }

    fr get_key() const { return slot; }

    bool is_empty() const { return slot == fr::zero() && value == fr::zero(); }

    std::vector<fr> get_hash_inputs(fr nextValue, fr nextIndex) const
    {
        return std::vector<fr>({ slot, value, nextIndex, nextValue });
    }

    operator uint256_t() const { return get_key(); }

    static PublicDataLeafValue empty() { return { fr::zero(), fr::zero() }; }

    static PublicDataLeafValue padding(index_t i) { return { i, fr::zero() }; }

    static std::string name() { return "PublicDataLeafValue"; };

    size_t hash() const noexcept { return utils::hash_as_tuple(value, slot); }
};

template <typename LeafType> struct IndexedLeaf {
    LeafType leaf;
    index_t nextIndex;
    fr nextKey;

    MSGPACK_FIELDS(leaf, nextIndex, nextKey)

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
