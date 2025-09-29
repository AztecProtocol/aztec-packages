#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/set.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/address_derivation.hpp"

namespace bb::avm2::simulation {

class AddressDerivation : public AddressDerivationInterface {
  public:
    AddressDerivation(Poseidon2Interface& poseidon2,
                      EccInterface& ecc,
                      EventEmitterInterface<AddressDerivationEvent>& events)
        : events(events)
        , poseidon2(poseidon2)
        , ecc(ecc)
    {}

    void assert_derivation(const AztecAddress& address, const ContractInstance& instance) override;

  private:
    EventEmitterInterface<AddressDerivationEvent>& events;
    Poseidon2Interface& poseidon2;
    EccInterface& ecc;

    // Cache for address derivations to avoid repeating derivations
    unordered_flat_set<AztecAddress> cached_derivations;
};

} // namespace bb::avm2::simulation
