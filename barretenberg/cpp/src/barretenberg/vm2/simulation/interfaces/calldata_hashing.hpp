#pragma once

#include <memory>
#include <span>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class CalldataHashingInterface {
  public:
    virtual ~CalldataHashingInterface() = default;
    virtual FF compute_calldata_hash(std::span<const FF> calldata) = 0;
};

class CalldataHashingProviderInterface {
  public:
    virtual ~CalldataHashingProviderInterface() = default;
    virtual std::unique_ptr<CalldataHashingInterface> make_calldata_hasher(uint32_t context_id) = 0;
};

} // namespace bb::avm2::simulation
