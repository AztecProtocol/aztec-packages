#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct AddressDerivationEvent {
    AztecAddress address = 0;
    ContractInstance instance{};
    FF salted_initialization_hash = 0;
    FF partial_address = 0;
    FF incoming_viewing_key_hash = 0;
    FF public_keys_hash = 0;
    FF preaddress = 0;
    EmbeddedCurvePoint preaddress_public_key = EmbeddedCurvePoint::infinity();
    EmbeddedCurvePoint address_point = EmbeddedCurvePoint::infinity();
};

} // namespace bb::avm2::simulation
