#pragma once

#include <cstdint>
#include <span>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class MerkleCheckInterface {
  public:
    virtual ~MerkleCheckInterface() = default;
    virtual void assert_membership(uint64_t domain_separator,
                                   const FF& leaf_value,
                                   uint64_t leaf_index,
                                   std::span<const FF> sibling_path,
                                   const FF& root) = 0;
    virtual FF write(uint64_t domain_separator,
                     const FF& current_value,
                     const FF& new_value,
                     uint64_t leaf_index,
                     std::span<const FF> sibling_path,
                     const FF& current_root) = 0;
};

} // namespace bb::avm2::simulation
