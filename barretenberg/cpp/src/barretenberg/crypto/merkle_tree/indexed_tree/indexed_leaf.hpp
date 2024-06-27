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

    fr get_fr_value() const { return value; }

    static NullifierLeafValue empty() { return { 0 }; }
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
};

} // namespace bb::crypto::merkle_tree