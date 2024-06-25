#pragma once

#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::crypto::merkle_tree {

struct indexed_leaf {
    fr value;
    index_t nextIndex;
    fr nextValue;

    MSGPACK_FIELDS(value, nextIndex, nextValue)

    bool operator==(indexed_leaf const& other) const
    {
        return value == other.value && nextValue == other.nextValue && nextIndex == other.nextIndex;
    }

    // indexed_leaf operator=(indexed_leaf const& other) const
    // {
    //     return indexed_leaf{ .value = other.value, .nextIndex = other.nextIndex, .nextValue = other.nextValue };
    // }

    std::ostream& operator<<(std::ostream& os)
    {
        os << "value = " << value << "\nnextIdx = " << nextIndex << "\nnextVal = " << nextValue;
        return os;
    }

    std::vector<fr> get_hash_inputs() const { return std::vector<fr>({ value, nextIndex, nextValue }); }
};

} // namespace bb::crypto::merkle_tree