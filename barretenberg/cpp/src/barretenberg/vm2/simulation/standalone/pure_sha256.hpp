#pragma once

#include "barretenberg/vm2/simulation/interfaces/sha256.hpp"

namespace bb::avm2::simulation {

class PureSha256 : public Sha256Interface {
  public:
    PureSha256() = default;
    ~PureSha256() override = default;

    void compression(MemoryInterface& memory,
                     MemoryAddress state_addr,
                     MemoryAddress input_addr,
                     MemoryAddress output_addr) override;
};

} // namespace bb::avm2::simulation
