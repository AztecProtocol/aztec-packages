#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/l1_to_l2_message_tree_check.hpp"

namespace bb::avm2::simulation {

class MockL1ToL2MessageTreeCheck : public L1ToL2MessageTreeCheckInterface {
  public:
    MockL1ToL2MessageTreeCheck();
    ~MockL1ToL2MessageTreeCheck() override;

    MOCK_METHOD(bool,
                exists,
                (const FF& msg_hash,
                 const FF& leaf_value,
                 uint64_t leaf_index,
                 std::span<const FF> sibling_path,
                 const AppendOnlyTreeSnapshot& snapshot),
                (override));
};

} // namespace bb::avm2::simulation
