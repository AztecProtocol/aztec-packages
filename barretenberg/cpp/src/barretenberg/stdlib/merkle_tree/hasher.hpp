#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "hash.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

struct PedersenHashPolicy {
    static fr hash(const std::vector<fr>& inputs) { return crypto::pedersen_hash::hash(inputs); }

    static fr hash_pair(const fr& lhs, const fr& rhs) { return hash(std::vector<fr>({ lhs, rhs })); }

    static fr zero_hash() { return fr::zero(); }
};

struct Poseidon2HashPolicy {
    static fr hash(const std::vector<fr>& inputs)
    {
        return bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs);
    }

    static fr hash_pair(const fr& lhs, const fr& rhs) { return hash(std::vector<fr>({ lhs, rhs })); }

    static fr zero_hash() { return fr::zero(); }
};

// template <typename HashingPolicy>
// class Hasher {
//   public:
//     Hasher();
//     Hasher(const Hasher& other) = delete;
//     Hasher(const Hasher&& other) = delete;
//     ~Hasher();

//     fr hash_inputs(const std::vector<fr>& inputs) const;

//     fr hash_pair(const fr& lhs, const fr& rhs) const;

//     fr zero_hash() const;
// };

// template <typename HashingPolicy> Hasher<HashingPolicy>::Hasher()
// {}

// template <typename HashingPolicy> Hasher<HashingPolicy>::~Hasher() {}

// template <typename HashingPolicy> fr Hasher<HashingPolicy>::hash_pair(const fr& lhs, const fr& rhs) const
// {
//     std::vector<fr> to_hash{ lhs, rhs };
//     return hash_inputs(to_hash);
// }

// template <typename HashingPolicy> fr Hasher<HashingPolicy>::zero_hash() const
// {
//     return fr::zero();
// }

// template <typename HashingPolicy> fr Hasher<HashingPolicy>::hash_inputs(const std::vector<fr>& inputs) const
// {
//     return HashingPolicy::hash(inputs);
// }

} // namespace bb::stdlib::merkle_tree