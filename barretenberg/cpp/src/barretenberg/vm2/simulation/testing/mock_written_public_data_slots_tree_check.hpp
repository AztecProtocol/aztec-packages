#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/written_public_data_slots_tree_check.hpp"

namespace bb::avm2::simulation {

class MockWrittenPublicDataSlotsTreeCheck : public WrittenPublicDataSlotsTreeCheckInterface {
  public:
    MockWrittenPublicDataSlotsTreeCheck();
    ~MockWrittenPublicDataSlotsTreeCheck() override;

    MOCK_METHOD(bool, contains, (const AztecAddress& contract_address, const FF& slot), (override));
    MOCK_METHOD(void, insert, (const AztecAddress& contract_address, const FF& slot), (override));
    MOCK_METHOD(AppendOnlyTreeSnapshot, snapshot, (), (const, override));
    MOCK_METHOD(uint32_t, size, (), (const, override));
    MOCK_METHOD(void, create_checkpoint, (), (override));
    MOCK_METHOD(void, commit_checkpoint, (), (override));
    MOCK_METHOD(void, revert_checkpoint, (), (override));
};

} // namespace bb::avm2::simulation
