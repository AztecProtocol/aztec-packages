#pragma once
#include "../hash.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "indexed_leaf.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

class Hasher {
  public:
    virtual ~Hasher() = 0;
    virtual fr hash_leaf(const indexed_leaf& leaf) = 0;
    virtual fr hash_pair(const fr& lhs, const fr& rhs) = 0;
    virtual fr zero_hash() = 0;
};

class Poseidon2Hasher : public Hasher {
  public:
    Poseidon2Hasher();
    Poseidon2Hasher(const Poseidon2Hasher& other) = delete;
    Poseidon2Hasher(const Poseidon2Hasher&& other) = delete;
    virtual ~Poseidon2Hasher();

    fr hash_leaf(const indexed_leaf& leaf);

    fr hash_pair(const fr& lhs, const fr& rhs);

    fr zero_hash();

    uint32_t get_hash_count();

  private:
    fr hash(const std::vector<fr>& inputs);
    std::atomic<uint32_t> hash_count_;
};

} // namespace bb::stdlib::merkle_tree