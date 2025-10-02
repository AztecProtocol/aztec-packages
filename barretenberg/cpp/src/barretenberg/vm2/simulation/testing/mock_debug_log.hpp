#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/debug_log.hpp"

namespace bb::avm2::simulation {

class MockDebugLog : public DebugLoggerInterface {
  public:
    MockDebugLog();
    ~MockDebugLog() override;

    MOCK_METHOD(void,
                debug_log,
                (MemoryInterface & memory,
                 AztecAddress contract_address,
                 MemoryAddress level_offset,
                 MemoryAddress message_offset,
                 uint16_t message_size,
                 MemoryAddress fields_offset,
                 MemoryAddress fields_size_offset),
                (override));
};

} // namespace bb::avm2::simulation
