#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/contract_instance_manager.hpp"

namespace bb::avm2::simulation {

class MockContractInstanceManager : public ContractInstanceManagerInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockContractInstanceManager();
    ~MockContractInstanceManager() override;

    MOCK_METHOD(std::optional<ContractInstance>, get_contract_instance, (const FF& contract_address), (override));
};

} // namespace bb::avm2::simulation
