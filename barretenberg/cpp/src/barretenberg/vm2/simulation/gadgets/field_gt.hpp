#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/field_gt.hpp"

namespace bb::avm2::simulation {

class FieldGreaterThan : public FieldGreaterThanInterface {
  public:
    FieldGreaterThan(RangeCheckInterface& range_check, EventEmitterInterface<FieldGreaterThanEvent>& event_emitter)
        : range_check(range_check)
        , events(event_emitter)
    {}

    bool ff_gt(const FF& a, const FF& b) override;
    U256Decomposition canon_dec(const FF& a) override;

  private:
    RangeCheckInterface& range_check;
    EventEmitterInterface<FieldGreaterThanEvent>& events;
};

} // namespace bb::avm2::simulation
