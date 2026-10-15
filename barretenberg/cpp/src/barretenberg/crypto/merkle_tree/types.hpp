#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <optional>
namespace bb::crypto::merkle_tree {

using index_t = uint64_t;
using block_number_t = uint32_t;
using LeafIndexKeyType = uint64_t;
using BlockMetaKeyType = uint64_t;
using FrKeyType = uint256_t;
using MetaKeyType = uint8_t;

struct RequestContext {
    bool includeUncommitted;
    std::optional<block_number_t> blockNumber;
    bb::fr root;
    std::optional<index_t> maxIndex;
};

template <typename LeafType> fr preimage_to_key(const LeafType& leaf)
{
    return leaf.get_key();
}

inline fr preimage_to_key(const fr& leaf)
{
    return leaf;
}

template <typename LeafType> bool is_empty(const LeafType& leaf)
{
    return leaf.is_empty();
}

inline bool is_empty(const fr& leaf)
{
    return leaf == fr::zero();
}

template <typename LeafType> constexpr bool requires_preimage_for_key()
{
    return true;
}

template <> constexpr bool requires_preimage_for_key<fr>()
{
    return false;
}

const std::string BLOCKS_DB = "blocks";
const std::string NODES_DB = "nodes";
const std::string LEAF_PREIMAGES_DB = "leaf preimages";
const std::string LEAF_INDICES_DB = "leaf indices";
const std::string BLOCK_INDICES_DB = "block indices";

} // namespace bb::crypto::merkle_tree
