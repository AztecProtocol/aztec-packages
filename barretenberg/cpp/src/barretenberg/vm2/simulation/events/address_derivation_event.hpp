#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct AddressDerivationEvent {
    AztecAddress address;
    ContractInstance instance;
    FF salted_initialization_hash;
    FF partial_address;
    FF public_keys_hash;
    FF preaddress;
    EmbeddedCurvePoint preaddress_public_key;
    EmbeddedCurvePoint address_point;
};

} // namespace bb::avm2::simulation
