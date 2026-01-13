#pragma once

#include "barretenberg/vm2/simulation/interfaces/calldata_hashing.hpp"

namespace bb::avm2::simulation {

class NoopCalldataHasher : public CalldataHashingInterface {
  public:
    void assert_calldata_hash(const FF& /*cd_hash*/, std::span<const FF> /*calldata*/) override {}
};

class NoopCalldataHashingProvider : public CalldataHashingProviderInterface {
  public:
    std::unique_ptr<CalldataHashingInterface> make_calldata_hasher(uint32_t /*context_id*/) override
    {
        return std::make_unique<NoopCalldataHasher>();
    }
};

} // namespace bb::avm2::simulation
