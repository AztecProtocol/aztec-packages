#pragma once

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"

namespace bb::aztec {

/**
 * @brief Aztec-specific hash policy for Merkle trees.
 *
 * Extends the generic Poseidon2HashPolicy by including the Aztec network's
 * domain separator (DOM_SEP__MERKLE_HASH) in hash_pair operations. All Aztec
 * protocol Merkle trees should use this policy instead of the generic one.
 */
struct AztecMerkleHashPolicy : public crypto::merkle_tree::Poseidon2HashPolicy {
    static bb::fr hash_pair(const bb::fr& lhs, const bb::fr& rhs)
    {
        return crypto::merkle_tree::Poseidon2HashPolicy::hash_pair_with_separator(DOM_SEP__MERKLE_HASH, lhs, rhs);
    }
};

} // namespace bb::aztec
