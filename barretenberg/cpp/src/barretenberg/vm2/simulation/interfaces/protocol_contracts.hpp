#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class ProtocolContractSetInterface {
  public:
    virtual ~ProtocolContractSetInterface() = default;
    virtual bool contains(const AztecAddress& canonical_address) = 0;
    virtual AztecAddress get_derived_address(const AztecAddress& canonical_address) = 0;
};

} // namespace bb::avm2::simulation
