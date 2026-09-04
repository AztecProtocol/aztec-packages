#pragma once

#include "field/field_element.hpp"
#include "field/hash_policy.hpp"
#include "merkle_tree/indexed_leaf.hpp"

// Leaf-type -> per-tree hash policy trait. Split out of hash_policy.hpp because it depends
// on the leaf types (indexed_leaf.hpp); keeping it separate lets the bb-linked parity test
// use the policies without dragging in the forked merkle headers (which need the fr alias).
namespace azteclabs::wsdb {

template <typename Leaf> struct MerkleHashPolicyFor;
template <> struct MerkleHashPolicyFor<merkle_tree::NullifierLeafValue> {
    using type = NullifierMerkleHashPolicy;
};
template <> struct MerkleHashPolicyFor<merkle_tree::PublicDataLeafValue> {
    using type = PublicDataMerkleHashPolicy;
};
template <> struct MerkleHashPolicyFor<FieldElement> {
    using type = AztecMerkleHashPolicy;
};
template <typename Leaf> using MerkleHashPolicyForT = typename MerkleHashPolicyFor<Leaf>::type;

} // namespace azteclabs::wsdb

namespace azteclabs::wsdb::aztec {
template <typename Leaf> using MerkleHashPolicyForT = ::azteclabs::wsdb::MerkleHashPolicyForT<Leaf>;
} // namespace azteclabs::wsdb::aztec
