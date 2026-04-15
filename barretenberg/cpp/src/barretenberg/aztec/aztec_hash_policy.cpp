#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"

// NullifierLeafValue and PublicDataLeafValue live under barretenberg/crypto/
// and must stay aztec-agnostic. Each one hardcodes its own HASH_DOMAIN_SEPARATOR;
// these static_asserts keep those hardcoded values honest against the generated
// Aztec constants.

namespace bb::aztec {

static_assert(crypto::merkle_tree::NullifierLeafValue::HASH_DOMAIN_SEPARATOR == DOM_SEP__NULLIFIER_LEAF,
              "NullifierLeafValue::HASH_DOMAIN_SEPARATOR must match DOM_SEP__NULLIFIER_LEAF");
static_assert(crypto::merkle_tree::PublicDataLeafValue::HASH_DOMAIN_SEPARATOR == DOM_SEP__PUBLIC_DATA_LEAF,
              "PublicDataLeafValue::HASH_DOMAIN_SEPARATOR must match DOM_SEP__PUBLIC_DATA_LEAF");

} // namespace bb::aztec
