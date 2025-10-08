#pragma once

#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"

namespace bb::avm2::simulation {

class PublicDataTreeCheckInterface {
  public:
    virtual ~PublicDataTreeCheckInterface() = default;
    virtual void assert_read(const FF& slot,
                             const AztecAddress& contract_address,
                             const FF& value,
                             const PublicDataTreeLeafPreimage& low_leaf_preimage,
                             uint64_t low_leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual AppendOnlyTreeSnapshot write(const FF& slot,
                                         const AztecAddress& contract_address,
                                         const FF& value,
                                         const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                         uint64_t low_leaf_index,
                                         std::span<const FF> low_leaf_sibling_path,
                                         const AppendOnlyTreeSnapshot& prev_snapshot,
                                         std::span<const FF> insertion_sibling_path,
                                         bool is_protocol_write) = 0;
};

} // namespace bb::avm2::simulation
