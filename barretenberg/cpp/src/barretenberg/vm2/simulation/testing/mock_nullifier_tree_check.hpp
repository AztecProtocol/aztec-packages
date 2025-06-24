#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"

namespace bb::avm2::simulation {

class MockNullifierTreeCheck : public NullifierTreeCheckInterface {
  public:
    MockNullifierTreeCheck();
    ~MockNullifierTreeCheck() override;

    MOCK_METHOD(void,
                assert_read,
                (FF nullifier,
                 std::optional<AztecAddress> contract_address,
                 bool exists,
                 const NullifierTreeLeafPreimage& low_leaf_preimage,
                 uint64_t low_leaf_index,
                 std::span<const FF> sibling_path,
                 const AppendOnlyTreeSnapshot& snapshot),
                (override));

    MOCK_METHOD(AppendOnlyTreeSnapshot,
                write,
                (FF nullifier,
                 std::optional<AztecAddress> contract_address,
                 uint64_t nullifier_counter,
                 const NullifierTreeLeafPreimage& low_leaf_preimage,
                 uint64_t low_leaf_index,
                 std::span<const FF> low_leaf_sibling_path,
                 const AppendOnlyTreeSnapshot& prev_snapshot,
                 std::optional<std::span<const FF>> insertion_sibling_path),
                (override));
};

} // namespace bb::avm2::simulation
