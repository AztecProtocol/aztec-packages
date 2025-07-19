#pragma once

#include <array>

#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class FakePoseidon2 : public Poseidon2Interface {
  public:
    FakePoseidon2() = default;
    ~FakePoseidon2() override = default;

    FF hash(const std::vector<FF>& input) override;
    std::array<FF, 4> permutation(const std::array<FF, 4>& input) override;
    void permutation([[maybe_unused]] MemoryInterface& memory,
                     [[maybe_unused]] MemoryAddress src_address,
                     [[maybe_unused]] MemoryAddress dst_address) override
    {
        throw std::runtime_error("FakePoseidon2 memory aware permutation unimplemented");
    }
};

} // namespace bb::avm2::simulation
