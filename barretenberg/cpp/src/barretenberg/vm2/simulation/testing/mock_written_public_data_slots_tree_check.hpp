#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/written_public_data_slots_tree_check.hpp"

namespace bb::avm2::simulation {

class MockWrittenPublicDataSlotsTreeCheck : public WrittenPublicDataSlotsTreeCheckInterface {
  public:
    MockWrittenPublicDataSlotsTreeCheck();
    ~MockWrittenPublicDataSlotsTreeCheck() override;

    MOCK_METHOD(void,
                assert_read,
                (const FF& slot,
                 const AztecAddress& contract_address,
                 bool exists,
                 const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage,
                 uint64_t low_leaf_index,
                 std::span<const FF> sibling_path,
                 const AppendOnlyTreeSnapshot& snapshot),
                (override));

    MOCK_METHOD(AppendOnlyTreeSnapshot,
                upsert,
                (const FF& slot,
                 const AztecAddress& contract_address,
                 const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage,
                 uint64_t low_leaf_index,
                 std::span<const FF> low_leaf_sibling_path,
                 const AppendOnlyTreeSnapshot& prev_snapshot,
                 std::span<const FF> insertion_sibling_path),
                (override));
};

} // namespace bb::avm2::simulation
