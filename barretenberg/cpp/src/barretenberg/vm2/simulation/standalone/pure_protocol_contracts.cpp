#include "barretenberg/vm2/simulation/standalone/pure_protocol_contracts.hpp"

#include <cstdint>

namespace bb::avm2::simulation {

PureProtocolContractSet::PureProtocolContractSet(
    const std::vector<ProtocolContractAddressHint>& protocol_contract_address_hints)
{
    for (const auto& [canonical_addr, derived_addr] : protocol_contract_address_hints) {
        derived_addresses[static_cast<uint8_t>(canonical_addr)] = derived_addr;
    }
}

bool PureProtocolContractSet::contains(const AztecAddress& canonical_address)
{
    return derived_addresses.contains(canonical_address);
}

AztecAddress PureProtocolContractSet::get_derived_address(const AztecAddress& canonical_address)
{
    assert(contains(canonical_address) &&
           "Can only get derived address for known protocol contract canonical addresses");
    return derived_addresses.at(canonical_address);
}

} // namespace bb::avm2::simulation
