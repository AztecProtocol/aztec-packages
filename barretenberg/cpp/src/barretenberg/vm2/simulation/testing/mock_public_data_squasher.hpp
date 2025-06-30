#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/public_data_squash.hpp"

namespace bb::avm2::simulation {

class MockPublicDataSquasher : public PublicDataSquasherInterface {
  public:
    MockPublicDataSquasher();
    ~MockPublicDataSquasher() override;

    MOCK_METHOD(void, record_write, (const FF& leaf_slot, bool is_protocol_write), (override));
};

} // namespace bb::avm2::simulation
