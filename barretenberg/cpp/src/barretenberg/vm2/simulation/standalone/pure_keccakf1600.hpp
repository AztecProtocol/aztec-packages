#pragma once

#include "barretenberg/vm2/simulation/interfaces/keccakf1600.hpp"

namespace bb::avm2::simulation {

class PureKeccakF1600 : public KeccakF1600Interface {
  public:
    PureKeccakF1600() = default;
    ~PureKeccakF1600() override = default;

    void permutation(MemoryInterface& memory, MemoryAddress dst_addr, MemoryAddress src_addr) override;
};

} // namespace bb::avm2::simulation
