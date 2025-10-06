#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/set.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/class_id_derivation.hpp"

namespace bb::avm2::simulation {

class ClassIdDerivation : public ClassIdDerivationInterface {
  public:
    ClassIdDerivation(Poseidon2Interface& poseidon2, EventEmitterInterface<ClassIdDerivationEvent>& events)
        : events(events)
        , poseidon2(poseidon2)
    {}

    void assert_derivation(const ContractClassId& class_id, const ContractClass& klass) override;

  private:
    EventEmitterInterface<ClassIdDerivationEvent>& events;
    Poseidon2Interface& poseidon2;

    // Cache for class ID derivations to avoid repeating derivations
    unordered_flat_set<ContractClassId> cached_derivations;
};

} // namespace bb::avm2::simulation
