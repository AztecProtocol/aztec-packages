#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "hash.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

class Hasher {
  public:
    virtual ~Hasher(){};
    virtual fr hash_inputs(const std::vector<fr>& inputs) = 0;
    virtual fr hash_pair(const fr& lhs, const fr& rhs) = 0;
    virtual fr zero_hash() = 0;
};

class Poseidon2Hasher : public Hasher {
  public:
    Poseidon2Hasher();
    Poseidon2Hasher(const Poseidon2Hasher& other) = delete;
    Poseidon2Hasher(const Poseidon2Hasher&& other) = delete;
    ~Poseidon2Hasher() override;

    fr hash_inputs(const std::vector<fr>& inputs) override;

    fr hash_pair(const fr& lhs, const fr& rhs) override;

    fr zero_hash() override;

    uint32_t get_hash_count();

  private:
    std::atomic<uint32_t> hash_count_;
};

} // namespace bb::stdlib::merkle_tree