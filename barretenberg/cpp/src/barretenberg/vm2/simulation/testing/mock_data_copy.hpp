#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/data_copy.hpp"

namespace bb::avm2::simulation {

class MockDataCopy : public DataCopyInterface {
  public:
    MockDataCopy();
    ~MockDataCopy() override;

    MOCK_METHOD(void,
                cd_copy,
                (ContextInterface & context,
                 const MemoryValue& cd_copy_size,
                 const MemoryValue& cd_offset,
                 const MemoryAddress dst_addr),
                (override));
    MOCK_METHOD(void,
                rd_copy,
                (ContextInterface & context,
                 const MemoryValue& rd_copy_size,
                 const MemoryValue& rd_offset,
                 const MemoryAddress dst_addr),
                (override));
};
} // namespace bb::avm2::simulation
