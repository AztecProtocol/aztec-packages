#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/indexed_memory_tree.hpp"

namespace bb::avm2::simulation {

// Implements the methods expected by indexed_leaf.hpp
struct ClassIdLeafValue {
    FF class_id;

    ClassIdLeafValue(const FF& class_id)
        : class_id(class_id)
    {}

    static bool is_updateable();

    bool operator==(ClassIdLeafValue const& other) const;

    friend std::ostream& operator<<(std::ostream& os, const ClassIdLeafValue& v);

    fr get_key() const;

    bool is_empty() const;

    std::vector<fr> get_hash_inputs(fr nextKey, fr nextIndex) const;

    operator uint256_t() const;

    static ClassIdLeafValue empty();

    static ClassIdLeafValue padding(index_t i);

    static std::string name();
};

using RetrievedBytecodesTree = IndexedMemoryTree<ClassIdLeafValue, Poseidon2HashPolicy>;

using RetrievedBytecodesTreeLeafPreimage = IndexedLeaf<ClassIdLeafValue>;

RetrievedBytecodesTree build_retrieved_bytecodes_tree();

} // namespace bb::avm2::simulation
