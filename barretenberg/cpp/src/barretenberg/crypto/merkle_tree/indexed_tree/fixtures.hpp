// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../types.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"

namespace bb::crypto::merkle_tree {
using IndexedNullifierLeafType = IndexedLeaf<NullifierLeafValue>;
using IndexedPublicDataLeafType = IndexedLeaf<PublicDataLeafValue>;

inline IndexedNullifierLeafType create_indexed_nullifier_leaf(const fr& value, index_t nextIndex, const fr& nextValue)
{
    return IndexedNullifierLeafType{ NullifierLeafValue(value), nextIndex, nextValue };
}

inline IndexedPublicDataLeafType create_indexed_public_data_leaf(const fr& slot,
                                                                 const fr& value,
                                                                 index_t nextIndex,
                                                                 const fr& nextValue)
{
    return IndexedPublicDataLeafType{ PublicDataLeafValue(slot, value), nextIndex, nextValue };
}
} // namespace bb::crypto::merkle_tree
