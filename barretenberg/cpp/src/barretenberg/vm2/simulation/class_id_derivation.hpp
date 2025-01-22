#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

class ClassIdDerivationInterface {
  public:
    virtual ~ClassIdDerivationInterface() = default;
    virtual void assert_derivation(const ContractClassId& class_id, const ContractClass& klass) = 0;
};

class ClassIdDerivation : public ClassIdDerivationInterface {
  public:
    ClassIdDerivation(EventEmitterInterface<ClassIdDerivationEvent>& events)
        : events(events)
    {}

    void assert_derivation(const ContractClassId& class_id, const ContractClass& klass) override;

  private:
    EventEmitterInterface<ClassIdDerivationEvent>& events;
};

} // namespace bb::avm2::simulation