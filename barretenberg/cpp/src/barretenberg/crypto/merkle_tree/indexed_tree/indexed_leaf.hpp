#pragma once

#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::crypto::merkle_tree {

struct nullifier_leaf_value {
    fr value;

    MSGPACK_FIELDS(value)

    nullifier_leaf_value() = default;
    nullifier_leaf_value(const fr& v)
        : value(v)
    {}
    nullifier_leaf_value(const nullifier_leaf_value& other) = default;
    nullifier_leaf_value(nullifier_leaf_value&& other) = default;
    nullifier_leaf_value& operator=(const nullifier_leaf_value& other)
    {
        if (this != &other) {
            value = other.value;
        }
        return *this;
    }

    nullifier_leaf_value& operator=(nullifier_leaf_value&& other)
    {
        if (this != &other) {
            value = other.value;
        }
        return *this;
    }
    ~nullifier_leaf_value() = default;

    bool operator==(nullifier_leaf_value const& other) const { return value == other.value; }

    friend std::ostream& operator<<(std::ostream& os, const nullifier_leaf_value& v)
    {
        os << "value = " << v.value;
        return os;
    }

    fr get_fr_value() const { return value; }

    static nullifier_leaf_value empty() { return { 0 }; }
};

template <typename LeafType> struct indexed_leaf {
    LeafType value;
    index_t nextIndex;
    fr nextValue;

    MSGPACK_FIELDS(value, nextIndex, nextValue)

    indexed_leaf() = default;

    indexed_leaf(const LeafType& val, index_t nextIdx, fr nextVal)
        : value(val)
        , nextIndex(nextIdx)
        , nextValue(nextVal)
    {}

    indexed_leaf<LeafType>(const indexed_leaf<LeafType>& other) = default;
    indexed_leaf<LeafType>(indexed_leaf<LeafType>&& other) noexcept = default;
    ~indexed_leaf<LeafType>() = default;

    bool operator==(indexed_leaf<LeafType> const& other) const
    {
        return value == other.value && nextValue == other.nextValue && nextIndex == other.nextIndex;
    }

    indexed_leaf<LeafType>& operator=(indexed_leaf<LeafType> const& other)
    {
        if (this != &other) {
            value = other.value;
            nextValue = other.nextValue;
            nextIndex = other.nextIndex;
        }
        return *this;
    }

    indexed_leaf<LeafType>& operator=(indexed_leaf<LeafType>&& other) noexcept
    {
        if (this != &other) {
            value = other.value;
            nextValue = other.nextValue;
            nextIndex = other.nextIndex;
        }
        return *this;
    }

    friend std::ostream& operator<<(std::ostream& os, const indexed_leaf<LeafType>& leaf)
    {
        os << leaf.value << "\nnextIdx = " << leaf.nextIndex << "\nnextVal = " << leaf.nextValue;
        return os;
    }

    std::vector<fr> get_hash_inputs() const { return std::vector<fr>({ value.value, nextIndex, nextValue }); }

    static indexed_leaf<LeafType> empty() { return { LeafType::empty(), 0, 0 }; }
};

} // namespace bb::crypto::merkle_tree