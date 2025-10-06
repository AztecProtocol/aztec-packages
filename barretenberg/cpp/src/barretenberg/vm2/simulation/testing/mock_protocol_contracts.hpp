#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/protocol_contracts.hpp"

namespace bb::avm2::simulation {

class MockProtocolContractSet : public ProtocolContractSetInterface {
  public:
    MockProtocolContractSet();
    ~MockProtocolContractSet() override;

    MOCK_METHOD(bool, contains, (const AztecAddress& canonical_address), (override));
    MOCK_METHOD(AztecAddress, get_derived_address, (const AztecAddress& canonical_address), (override));
};

} // namespace bb::avm2::simulation
