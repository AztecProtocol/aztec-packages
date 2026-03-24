#pragma once

#include <optional>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/indexed_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"

namespace bb::avm2::simulation {

class IndexedTreeCheckInterface {
  public:
    virtual ~IndexedTreeCheckInterface() = default;
    virtual void assert_read(const FF& value,
                             std::optional<IndexedTreeSiloingParameters> siloing_params,
                             bool exists,
                             const IndexedTreeLeafData& low_leaf_preimage,
                             uint64_t low_leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual AppendOnlyTreeSnapshot write(const FF& value,
                                         std::optional<IndexedTreeSiloingParameters> siloing_params,
                                         std::optional<uint64_t> public_inputs_index,
                                         const IndexedTreeLeafData& low_leaf_preimage,
                                         uint64_t low_leaf_index,
                                         std::span<const FF> low_leaf_sibling_path,
                                         const AppendOnlyTreeSnapshot& prev_snapshot,
                                         // Null if this is a failing write.
                                         std::optional<std::span<const FF>> insertion_sibling_path) = 0;
};

} // namespace bb::avm2::simulation
