#pragma once

#include <array>

#include "barretenberg/vm2/simulation/interfaces/poseidon2.hpp"

namespace bb::avm2::simulation {

class PurePoseidon2 : public Poseidon2Interface {
  public:
    PurePoseidon2() = default;
    ~PurePoseidon2() override = default;

    FF hash(const std::vector<FF>& input) override;
    std::array<FF, 4> permutation(const std::array<FF, 4>& input) override;
    void permutation(MemoryInterface& memory, MemoryAddress src_address, MemoryAddress dst_address) override;
};

} // namespace bb::avm2::simulation
