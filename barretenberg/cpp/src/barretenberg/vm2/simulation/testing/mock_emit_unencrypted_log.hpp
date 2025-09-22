#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/emit_unencrypted_log.hpp"

namespace bb::avm2::simulation {

class MockEmitUnencryptedLog : public EmitUnencryptedLogInterface {
  public:
    MockEmitUnencryptedLog();
    ~MockEmitUnencryptedLog() override;

    MOCK_METHOD(void,
                emit_unencrypted_log,
                (MemoryInterface & memory,
                 ContextInterface& context,
                 AztecAddress contract_address,
                 MemoryAddress log_offset,
                 uint32_t log_size),
                (override));
};

} // namespace bb::avm2::simulation
