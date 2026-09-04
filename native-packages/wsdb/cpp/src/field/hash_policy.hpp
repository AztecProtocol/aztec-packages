#pragma once

#include "common/aztec_constants.hpp"
#include "field/field_element.hpp"
#include "field/poseidon2.hpp"
#include <cstdint>
#include <vector>

namespace azteclabs::wsdb {

// Protocol domain separators - CONSENSUS constants sourced from the generated
// aztec_constants.hpp (single source of truth; the AVM hashes internal nodes with the same
// values). Per-tree separators stop sibling paths being transported across trees.
inline constexpr uint64_t DOM_SEP_MERKLE_HASH = DOM_SEP__MERKLE_HASH;
inline constexpr uint64_t DOM_SEP_NULLIFIER_MERKLE = DOM_SEP__NULLIFIER_MERKLE;
inline constexpr uint64_t DOM_SEP_PUBLIC_DATA_MERKLE = DOM_SEP__PUBLIC_DATA_MERKLE;
inline constexpr uint64_t DOM_SEP_WRITTEN_SLOTS_MERKLE = DOM_SEP__WRITTEN_SLOTS_MERKLE;
inline constexpr uint64_t DOM_SEP_RETRIEVED_BYTECODES_MERKLE = DOM_SEP__RETRIEVED_BYTECODES_MERKLE;

// Baseline Poseidon2 policy (no domain separator), routed through the bb c_bind.
struct Poseidon2HashPolicy {
    static FieldElement hash(const std::vector<FieldElement>& inputs) { return poseidon2_hash(inputs); }
    static FieldElement hash_pair(const FieldElement& lhs, const FieldElement& rhs)
    {
        return poseidon2_hash({ lhs, rhs });
    }
    static FieldElement hash_pair_with_separator(uint64_t separator, const FieldElement& lhs, const FieldElement& rhs)
    {
        return poseidon2_hash_pair_with_separator(separator, lhs, rhs);
    }
    static FieldElement zero_hash() { return FieldElement::zero(); }
};

// Domain-separated internal-node hashing (mirrors azteclabs::wsdb::aztec::AztecMerkleHashPolicyT).
template <uint64_t Separator> struct AztecMerkleHashPolicyT : public Poseidon2HashPolicy {
    static FieldElement hash_pair(const FieldElement& lhs, const FieldElement& rhs)
    {
        return Poseidon2HashPolicy::hash_pair_with_separator(Separator, lhs, rhs);
    }
};

using NullifierMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP_NULLIFIER_MERKLE>;
using PublicDataMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP_PUBLIC_DATA_MERKLE>;
using WrittenSlotsMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP_WRITTEN_SLOTS_MERKLE>;
using RetrievedBytecodesMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP_RETRIEVED_BYTECODES_MERKLE>;
// Append-only trees (note-hash, L1->L2 message, archive) share the baseline separator.
using AztecMerkleHashPolicy = AztecMerkleHashPolicyT<DOM_SEP_MERKLE_HASH>;

} // namespace azteclabs::wsdb

// In the decoupled build, the forked merkle code refers to these under barretenberg's
// original namespaces (merkle_tree::Poseidon2HashPolicy, aztec::*). Inject them.
namespace azteclabs::wsdb::merkle_tree {
using ::azteclabs::wsdb::Poseidon2HashPolicy;
} // namespace azteclabs::wsdb::merkle_tree
namespace azteclabs::wsdb::aztec {
using ::azteclabs::wsdb::AztecMerkleHashPolicy;
using ::azteclabs::wsdb::NullifierMerkleHashPolicy;
using ::azteclabs::wsdb::PublicDataMerkleHashPolicy;
using ::azteclabs::wsdb::RetrievedBytecodesMerkleHashPolicy;
using ::azteclabs::wsdb::WrittenSlotsMerkleHashPolicy;
} // namespace azteclabs::wsdb::aztec
