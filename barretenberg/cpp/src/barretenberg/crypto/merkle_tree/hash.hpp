// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 0c2cc9e3a422be5431b8d2a5a49f6ba93646e79a }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include <vector>

namespace bb::crypto::merkle_tree {

struct Poseidon2HashPolicy {
    static fr hash(const std::vector<fr>& inputs)
    {
        return bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs);
    }

    static fr hash_pair(const fr& lhs, const fr& rhs) { return hash(std::vector<fr>({ lhs, rhs })); }

    static fr zero_hash() { return fr::zero(); }
};

} // namespace bb::crypto::merkle_tree
