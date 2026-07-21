#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <optional>
#include <span>

namespace bb::avm2::simulation {

class MockIndexedTreeCheck : public IndexedTreeCheckInterface {
  public:
    MockIndexedTreeCheck();
    ~MockIndexedTreeCheck() override;

    MOCK_METHOD(void,
                assert_read,
                (const FF& value,
                 std::optional<IndexedTreeSiloingParameters> siloing_params,
                 bool exists,
                 const IndexedTreeLeafData& low_leaf_preimage,
                 uint64_t low_leaf_index,
                 std::span<const FF> sibling_path,
                 const AppendOnlyTreeSnapshot& snapshot),
                (override));

    MOCK_METHOD(AppendOnlyTreeSnapshot,
                write,
                (const FF& value,
                 std::optional<IndexedTreeSiloingParameters> siloing_params,
                 std::optional<uint64_t> public_inputs_index,
                 const IndexedTreeLeafData& low_leaf_preimage,
                 uint64_t low_leaf_index,
                 std::span<const FF> low_leaf_sibling_path,
                 const AppendOnlyTreeSnapshot& prev_snapshot,
                 // Null if this is a failing write.
                 std::optional<std::span<const FF>> insertion_sibling_path),
                (override));
};

} // namespace bb::avm2::simulation
