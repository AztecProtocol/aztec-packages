#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/get_contract_instance.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class MockGetContractInstance : public GetContractInstanceInterface {
  public:
    MockGetContractInstance();
    ~MockGetContractInstance() override;

    MOCK_METHOD(
        void,
        get_contract_instance,
        (MemoryInterface & memory, AztecAddress contract_address, MemoryAddress dst_offset, uint8_t member_enum),
        (override));
};

} // namespace bb::avm2::simulation
