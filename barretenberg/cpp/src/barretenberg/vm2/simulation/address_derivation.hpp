#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/ecc.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class AddressDerivationInterface {
  public:
    virtual ~AddressDerivationInterface() = default;
    virtual void assert_derivation(const AztecAddress& address, const ContractInstance& instance) = 0;
};

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
};

} // namespace bb::avm2::simulation
