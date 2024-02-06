#include "hasher.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

Poseidon2Hasher::Poseidon2Hasher()
    : hash_count_(0)
{}

Poseidon2Hasher::~Poseidon2Hasher() {}

fr Poseidon2Hasher::hash_pair(const fr& lhs, const fr& rhs)
{
    std::vector<fr> to_hash{ lhs, rhs };
    return hash_inputs(to_hash);
}

fr Poseidon2Hasher::zero_hash()
{
    return fr::zero();
}

uint32_t Poseidon2Hasher::get_hash_count()
{
    return hash_count_.load();
}

fr Poseidon2Hasher::hash_inputs(const std::vector<fr>& inputs)
{
    ++hash_count_;
    return bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs);
}

} // namespace bb::stdlib::merkle_tree