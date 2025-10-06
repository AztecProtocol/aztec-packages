#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/retrieved_bytecodes_tree_check.hpp"

namespace bb::avm2::simulation {

class MockRetrievedBytecodesTreeCheck : public RetrievedBytecodesTreeCheckInterface {
  public:
    MockRetrievedBytecodesTreeCheck();
    ~MockRetrievedBytecodesTreeCheck() override;

    MOCK_METHOD(bool, contains, (const FF& class_id), (override));
    MOCK_METHOD(void, insert, (const FF& class_id), (override));
    MOCK_METHOD(AppendOnlyTreeSnapshot, get_snapshot, (), (const, override));
    MOCK_METHOD(uint32_t, size, (), (const, override));
};

} // namespace bb::avm2::simulation
