#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/protocol_contract_data.hpp"

#include <cassert>

namespace bb::avm2 {

inline bool is_protocol_contract(const AztecAddress& canonical_address)
{
    return derived_addresses.contains(canonical_address);
}

inline const AztecAddress& get_derived_address(const AztecAddress& canonical_address)
{
    assert(is_protocol_contract(canonical_address));
    return derived_addresses.at(canonical_address);
}

} // namespace bb::avm2
