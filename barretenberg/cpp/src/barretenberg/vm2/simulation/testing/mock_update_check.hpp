#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/update_check.hpp"

namespace bb::avm2::simulation {

class MockUpdateCheck : public UpdateCheckInterface {
  public:
    MockUpdateCheck();
    ~MockUpdateCheck() override;

    MOCK_METHOD(void,
                check_current_class_id,
                (const AztecAddress& address, const ContractInstance& instance),
                (override));
};

} // namespace bb::avm2::simulation
