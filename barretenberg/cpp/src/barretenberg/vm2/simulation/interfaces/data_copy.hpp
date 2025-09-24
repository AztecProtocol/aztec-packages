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
    virtual void cd_copy(ContextInterface& context,
                         const uint32_t cd_copy_size,
                         const uint32_t cd_offset,
                         const MemoryAddress dst_addr) = 0;
    virtual void rd_copy(ContextInterface& context,
                         const uint32_t rd_copy_size,
                         const uint32_t rd_offset,
                         const MemoryAddress dst_addr) = 0;
};

} // namespace bb::avm2::simulation
