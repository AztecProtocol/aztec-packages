#pragma once

#include <optional>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"

namespace bb::avm2::simulation {

class NullifierTreeCheckInterface {
  public:
    virtual ~NullifierTreeCheckInterface() = default;
    virtual void assert_read(const FF& nullifier,
                             std::optional<AztecAddress> contract_address,
                             bool exists,
                             const NullifierTreeLeafPreimage& low_leaf_preimage,
                             uint64_t low_leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual AppendOnlyTreeSnapshot write(const FF& nullifier,
                                         std::optional<AztecAddress> contract_address,
                                         uint64_t nullifier_counter,
                                         const NullifierTreeLeafPreimage& low_leaf_preimage,
                                         uint64_t low_leaf_index,
                                         std::span<const FF> low_leaf_sibling_path,
                                         const AppendOnlyTreeSnapshot& prev_snapshot,
                                         // Null if this is a failing write.
                                         std::optional<std::span<const FF>> insertion_sibling_path) = 0;
};

} // namespace bb::avm2::simulation
