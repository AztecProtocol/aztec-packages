#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/interfaces/protocol_contracts.hpp"

namespace bb::avm2::simulation {

using CanonicalAddress = AztecAddress;
using DerivedAddress = AztecAddress;

class PureProtocolContractSet : public ProtocolContractSetInterface {
  public:
    PureProtocolContractSet(const std::vector<ProtocolContractAddressHint>& protocol_contract_address_hints);

    bool contains(const AztecAddress& canonical_address) override;
    AztecAddress get_derived_address(const AztecAddress& canonical_address) override;

  private:
    unordered_flat_map<CanonicalAddress, DerivedAddress> derived_addresses;
};

} // namespace bb::avm2::simulation
