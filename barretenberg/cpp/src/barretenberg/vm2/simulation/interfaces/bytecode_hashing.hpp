#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class BytecodeHashingInterface {
  public:
    virtual ~BytecodeHashingInterface() = default;
    virtual void assert_public_bytecode_commitment(const BytecodeId& bytecode_id,
                                                   const std::vector<uint8_t>& bytecode) = 0;
};

} // namespace bb::avm2::simulation
