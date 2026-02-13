#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/emit_public_log.hpp"

namespace bb::avm2::simulation {

class MockEmitPublicLog : public EmitPublicLogInterface {
  public:
    MockEmitPublicLog();
    ~MockEmitPublicLog() override;

    MOCK_METHOD(void,
                emit_public_log,
                (MemoryInterface & memory,
                 ContextInterface& context,
                 const AztecAddress& contract_address,
                 MemoryAddress log_offset,
                 uint32_t log_size),
                (override));
};

} // namespace bb::avm2::simulation
