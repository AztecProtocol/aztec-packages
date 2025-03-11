#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

class AddressDerivationInterface {
  public:
    virtual ~AddressDerivationInterface() = default;
    virtual void assert_derivation(const AztecAddress& address, const ContractInstance& instance) = 0;
};

class AddressDerivation : public AddressDerivationInterface {
  public:
    AddressDerivation(EventEmitterInterface<AddressDerivationEvent>& events)
        : events(events)
    {}

    void assert_derivation(const AztecAddress& address, const ContractInstance& instance) override;

  private:
    EventEmitterInterface<AddressDerivationEvent>& events;
};

} // namespace bb::avm2::simulation