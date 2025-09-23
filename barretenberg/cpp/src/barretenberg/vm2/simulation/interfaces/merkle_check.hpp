#pragma once

#include <cstdint>
#include <span>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class MerkleCheckInterface {
  public:
    virtual ~MerkleCheckInterface() = default;
    virtual void assert_membership(const FF& leaf_value,
                                   const uint64_t leaf_index,
                                   std::span<const FF> sibling_path,
                                   const FF& root) = 0;
    virtual FF write(const FF& current_value,
                     const FF& new_value,
                     const uint64_t leaf_index,
                     std::span<const FF> sibling_path,
                     const FF& current_root) = 0;
};

} // namespace bb::avm2::simulation
