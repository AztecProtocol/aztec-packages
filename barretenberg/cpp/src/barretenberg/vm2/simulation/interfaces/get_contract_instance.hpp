#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declaration
class MemoryInterface;

class GetContractInstanceInterface {
  public:
    virtual ~GetContractInstanceInterface() = default;
    virtual void get_contract_instance(MemoryInterface& memory,
                                       const AztecAddress& contract_address,
                                       MemoryAddress dst_offset,
                                       uint8_t member_enum) = 0;
};

} // namespace bb::avm2::simulation
