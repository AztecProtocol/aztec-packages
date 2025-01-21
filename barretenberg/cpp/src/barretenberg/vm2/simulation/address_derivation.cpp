#include "barretenberg/vm2/simulation/address_derivation.hpp"

#include <cassert>

#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

void AddressDerivation::assert_derivation(const AztecAddress& address, const ContractInstance& instance)
{
    // TODO: Cache and deduplicate.
    // TODO: Use gadget.
    assert(compute_contract_address(instance) == address);
    events.emit({ .address = address, .instance = instance });
}

} // namespace bb::avm2::simulation