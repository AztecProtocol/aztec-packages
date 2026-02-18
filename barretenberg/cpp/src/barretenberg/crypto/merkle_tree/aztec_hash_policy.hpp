#pragma once

#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::crypto::merkle_tree {

/**
 * @brief Aztec-specific hash policy for Merkle trees.
 *
 * Extends the generic Poseidon2HashPolicy by including the Aztec network's
 * domain separator (DOM_SEP__MERKLE_HASH) in hash_pair operations. All Aztec
 * protocol Merkle trees should use this policy instead of the generic one.
 */
struct AztecMerkleHashPolicy : public Poseidon2HashPolicy {
    static bb::fr hash_pair(const bb::fr& lhs, const bb::fr& rhs)
    {
        return Poseidon2HashPolicy::hash_pair_with_separator(DOM_SEP__MERKLE_HASH, lhs, rhs);
    }
};

// The leaf types (NullifierLeafValue, PublicDataLeafValue) live in `barretenberg/crypto/`,
// and that file's location is technically in a place that should remain agnostic and not import
// Aztec-specific headers.
// Perhaps ideally (eventually) the (NullifierLeafValue, PublicDataLeafValue) types should actually
// be extracted from `barretenberg/crypto/` and put somewhere aztec-specific.
// The problem: each leaf type needs an aztec-specific domain separator for hashing, but...
// We don't want to use a constructor to convey the domain separator, because:
//   - Every construction site (there are many) would need to pass it
//   - Every instance would carry redundant data (the domain separator) in memory
//   - NullifierLeafValue::empty(), ::padding(i) are static methods — they can't access an instance
//   member, so they'd need the separator hardcoded or passed-in.
//   - The generic IndexedLeaf<LeafType> template and tree code constructs leaves via those static methods
//   — the template interface would need changing too
// Instead, each leaf type defines HASH_DOMAIN_SEPARATOR as a plain
// numeric constant, and we verify correctness here against the generated Aztec constants.
static_assert(NullifierLeafValue::HASH_DOMAIN_SEPARATOR == DOM_SEP__NULLIFIER_LEAF,
              "NullifierLeafValue::HASH_DOMAIN_SEPARATOR must match DOM_SEP__NULLIFIER_LEAF");
static_assert(PublicDataLeafValue::HASH_DOMAIN_SEPARATOR == DOM_SEP__PUBLIC_DATA_LEAF,
              "PublicDataLeafValue::HASH_DOMAIN_SEPARATOR must match DOM_SEP__PUBLIC_DATA_LEAF");

} // namespace bb::crypto::merkle_tree
