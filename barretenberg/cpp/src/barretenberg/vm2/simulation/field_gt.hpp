#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

class FieldGreaterThanInterface {
  public:
    virtual ~FieldGreaterThanInterface() = default;
    virtual bool ff_gt(const FF& a, const FF& b) = 0;
};

class FieldGreaterThan : public FieldGreaterThanInterface {
  public:
    FieldGreaterThan(RangeCheckInterface& range_check, EventEmitterInterface<FieldGreaterThanEvent>& event_emitter)
        : range_check(range_check)
        , events(event_emitter)
    {}

    bool ff_gt(const FF& a, const FF& b) override;

  private:
    RangeCheckInterface& range_check;
    EventEmitterInterface<FieldGreaterThanEvent>& events;
};

} // namespace bb::avm2::simulation
