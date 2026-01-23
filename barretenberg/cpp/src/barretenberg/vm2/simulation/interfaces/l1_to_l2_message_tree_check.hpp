#pragma once

#include <span>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class L1ToL2MessageTreeCheckInterface {
  public:
    virtual ~L1ToL2MessageTreeCheckInterface() = default;

    virtual bool exists(const FF& msg_hash,
                        const FF& leaf_value,
                        uint64_t leaf_index,
                        std::span<const FF> sibling_path,
                        const AppendOnlyTreeSnapshot& snapshot) = 0;
};

} // namespace bb::avm2::simulation
