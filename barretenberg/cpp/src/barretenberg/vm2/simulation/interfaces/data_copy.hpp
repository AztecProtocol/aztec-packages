#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class ContextInterface;

class DataCopyInterface {
  public:
    virtual ~DataCopyInterface() = default;
    virtual void cd_copy(ContextInterface& context, uint32_t copy_size, uint32_t offset, MemoryAddress dst_addr) = 0;
    virtual void rd_copy(ContextInterface& context, uint32_t copy_size, uint32_t offset, MemoryAddress dst_addr) = 0;
};

} // namespace bb::avm2::simulation
