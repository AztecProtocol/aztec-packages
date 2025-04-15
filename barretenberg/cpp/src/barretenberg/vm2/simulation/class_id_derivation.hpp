#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class ClassIdDerivationInterface {
  public:
    virtual ~ClassIdDerivationInterface() = default;
    virtual void assert_derivation(const ContractClassId& class_id, const ContractClass& klass) = 0;
};

class ClassIdDerivation : public ClassIdDerivationInterface {
  public:
    ClassIdDerivation(Poseidon2& poseidon2, EventEmitterInterface<ClassIdDerivationEvent>& events)
        : events(events)
        , poseidon2(poseidon2)
    {}

    void assert_derivation(const ContractClassId& class_id, const ContractClass& klass) override;

  private:
    EventEmitterInterface<ClassIdDerivationEvent>& events;
    Poseidon2Interface& poseidon2;
};

} // namespace bb::avm2::simulation
