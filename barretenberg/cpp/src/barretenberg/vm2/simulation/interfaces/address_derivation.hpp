#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class AddressDerivationInterface {
  public:
    virtual ~AddressDerivationInterface() = default;
    virtual void assert_derivation(const AztecAddress& address, const ContractInstance& instance) = 0;
};

} // namespace bb::avm2::simulation
