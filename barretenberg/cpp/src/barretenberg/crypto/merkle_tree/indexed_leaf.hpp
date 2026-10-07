// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 22d6fc368da0fbe5412f4f7b2890a052aa48d803 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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

    SERIALIZATION_FIELDS(nullifier)

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

    size_t hash() const noexcept { return std::hash<fr>{}(nullifier); }

    static std::string name() { return "NullifierLeafValue"; };
};

struct PublicDataLeafValue {
    fr slot;
    fr value;

    SERIALIZATION_FIELDS(slot, value)

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

    std::vector<fr> get_hash_inputs(fr nextSlot, fr nextIndex) const
    {
        return std::vector<fr>({ slot, value, nextSlot, nextIndex });
    }

    operator uint256_t() const { return get_key(); }

    static PublicDataLeafValue empty() { return { fr::zero(), fr::zero() }; }

    static PublicDataLeafValue padding(index_t i) { return { i, fr::zero() }; }

    size_t hash() const noexcept { return utils::hash_as_tuple(value, slot); }

    static std::string name() { return "PublicDataLeafValue"; };
};

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

    // A leaf hashes to zero only when it is the true padding leaf: an empty value with null next pointers.
    // This matches the Noir definition (e.g. nullifier_leaf_preimage.nr) and prevents a real low leaf whose
    // value happens to be zero (e.g. the head of the list) from being mistaken for padding.
    bool is_empty() const { return leaf.is_empty() && nextKey.is_zero() && nextIndex == 0; }

    static IndexedLeaf<LeafType> empty() { return { LeafType::empty(), 0, 0 }; }

    static IndexedLeaf<LeafType> padding(index_t i) { return { LeafType::padding(i), 0, 0 }; }
};

} // namespace bb::crypto::merkle_tree
