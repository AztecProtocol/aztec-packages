#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct AddressDerivationEvent {
    AztecAddress address;
    ContractInstance instance;
};

} // namespace bb::avm2::simulation