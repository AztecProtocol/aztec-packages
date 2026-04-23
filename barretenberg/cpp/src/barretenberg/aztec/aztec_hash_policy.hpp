#pragma once

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"

namespace bb::aztec {

/**
 * @brief Aztec-specific hash policy for Merkle trees, parameterised by a tree-specific domain
 *        separator for internal-node hashing.
 *
 * Append-only trees (note-hash, L1->L2 message, archive) instantiate this template with
 * DOM_SEP__MERKLE_HASH. Indexed trees instantiate it with a tree-specific constant
 * (DOM_SEP__NULLIFIER_MERKLE, DOM_SEP__PUBLIC_DATA_MERKLE, DOM_SEP__WRITTEN_SLOTS_MERKLE,
 * DOM_SEP__RETRIEVED_BYTECODES_MERKLE), so that sibling paths cannot be transported across
 * trees even if two leaves happen to collide.
 */
template <uint64_t Separator> struct AztecMerkleHashPolicyT : public crypto::merkle_tree::Poseidon2HashPolicy {
    static bb::fr hash_pair(const bb::fr& lhs, const bb::fr& rhs)
    {
        return Poseidon2HashPolicy::hash_pair_with_separator(Separator, lhs, rhs);
    }
};

// Per-tree instantiations for the 4 indexed trees.
using NullifierMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP__NULLIFIER_MERKLE>;
using PublicDataMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP__PUBLIC_DATA_MERKLE>;
using WrittenSlotsMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP__WRITTEN_SLOTS_MERKLE>;
using RetrievedBytecodesMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP__RETRIEVED_BYTECODES_MERKLE>;

// Default policy, shared by the 3 append-only trees (note-hash, L1->L2, archive).
using AztecMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP__MERKLE_HASH>;

// Leaf-type -> hash policy trait. Lets generic world-state template code pick the right per-tree
// policy without hard-coding HashPolicy at every instantiation.
template <typename Leaf> struct MerkleHashPolicyFor;
template <> struct MerkleHashPolicyFor<crypto::merkle_tree::NullifierLeafValue> {
    using type = NullifierMerkleHashPolicy;
};
template <> struct MerkleHashPolicyFor<crypto::merkle_tree::PublicDataLeafValue> {
    using type = PublicDataMerkleHashPolicy;
};
// Append-only tree leaves are bare fr (hash directly stored); they use the baseline policy.
template <> struct MerkleHashPolicyFor<bb::fr> {
    using type = AztecMerkleHashPolicy;
};

template <typename Leaf> using MerkleHashPolicyForT = typename MerkleHashPolicyFor<Leaf>::type;

} // namespace bb::aztec
