#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"

namespace bb::avm2::simulation {

class FieldGreaterThanInterface {
  public:
    virtual ~FieldGreaterThanInterface() = default;
    virtual bool ff_gt(const FF& a, const FF& b) = 0;
};

class FieldGreaterThan : public FieldGreaterThanInterface {
  public:
    FieldGreaterThan(EventEmitterInterface<FieldGreaterThanEvent>& event_emitter)
        : events(event_emitter)
    {}

    bool ff_gt(const FF& a, const FF& b) override;

  private:
    EventEmitterInterface<FieldGreaterThanEvent>& events;
};

} // namespace bb::avm2::simulation
