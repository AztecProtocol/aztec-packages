#pragma once

#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::crypto::merkle_tree {

struct NullifierLeafValue {
    fr value;

    MSGPACK_FIELDS(value)

    NullifierLeafValue() = default;
    NullifierLeafValue(const fr& v)
        : value(v)
    {}
    NullifierLeafValue(const NullifierLeafValue& other) = default;
    NullifierLeafValue(NullifierLeafValue&& other) = default;
    NullifierLeafValue& operator=(const NullifierLeafValue& other)
    {
        if (this != &other) {
            value = other.value;
        }
        return *this;
    }

    NullifierLeafValue& operator=(NullifierLeafValue&& other) noexcept
    {
        if (this != &other) {
            value = other.value;
        }
        return *this;
    }
    ~NullifierLeafValue() = default;

    bool operator==(NullifierLeafValue const& other) const { return value == other.value; }

    friend std::ostream& operator<<(std::ostream& os, const NullifierLeafValue& v)
    {
        os << "value = " << v.value;
        return os;
    }

    fr get_key() const { return value; }

    bool is_empty() const { return value == fr::zero(); }

    static NullifierLeafValue empty() { return { fr::zero() }; }

    static NullifierLeafValue padding(index_t i) { return { i }; }
};

struct PublicDataLeafValue {
    fr value;
    fr slot;

    MSGPACK_FIELDS(value, slot)

    PublicDataLeafValue() = default;
    PublicDataLeafValue(const fr& s, const fr& v)
        : value(v)
        , slot(s)
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

    bool operator==(PublicDataLeafValue const& other) const { return value == other.value && slot == other.slot; }

    friend std::ostream& operator<<(std::ostream& os, const PublicDataLeafValue& v)
    {
        os << "slot = " << v.slot << " : value = " << v.value;
        return os;
    }

    fr get_key() const { return slot; }

    bool is_empty() const { return value == fr::zero() && slot == fr::zero(); }

    static PublicDataLeafValue empty() { return { fr::zero(), fr::zero() }; }

    static PublicDataLeafValue padding(index_t i) { return { i, fr::zero() }; }
};

template <typename LeafType> struct IndexedLeaf {
    LeafType value;
    index_t nextIndex;
    fr nextValue;

    MSGPACK_FIELDS(value, nextIndex, nextValue)

    IndexedLeaf() = default;

    IndexedLeaf(const LeafType& val, index_t nextIdx, fr nextVal)
        : value(val)
        , nextIndex(nextIdx)
        , nextValue(nextVal)
    {}

    IndexedLeaf<LeafType>(const IndexedLeaf<LeafType>& other) = default;
    IndexedLeaf<LeafType>(IndexedLeaf<LeafType>&& other) noexcept = default;
    ~IndexedLeaf<LeafType>() = default;

    bool operator==(IndexedLeaf<LeafType> const& other) const
    {
        return value == other.value && nextValue == other.nextValue && nextIndex == other.nextIndex;
    }

    IndexedLeaf<LeafType>& operator=(IndexedLeaf<LeafType> const& other)
    {
        if (this != &other) {
            value = other.value;
            nextValue = other.nextValue;
            nextIndex = other.nextIndex;
        }
        return *this;
    }

    IndexedLeaf<LeafType>& operator=(IndexedLeaf<LeafType>&& other) noexcept
    {
        if (this != &other) {
            value = other.value;
            nextValue = other.nextValue;
            nextIndex = other.nextIndex;
        }
        return *this;
    }

    friend std::ostream& operator<<(std::ostream& os, const IndexedLeaf<LeafType>& leaf)
    {
        os << leaf.value << "\nnextIdx = " << leaf.nextIndex << "\nnextVal = " << leaf.nextValue;
        return os;
    }

    std::vector<fr> get_hash_inputs() const { return std::vector<fr>({ value.value, nextIndex, nextValue }); }

    static IndexedLeaf<LeafType> empty() { return { LeafType::empty(), 0, 0 }; }

    static IndexedLeaf<LeafType> padding(index_t i) { return { LeafType::padding(i), 0, 0 }; }
};

} // namespace bb::crypto::merkle_tree