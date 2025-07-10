#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

class GreaterThanInterface {
  public:
    virtual ~GreaterThanInterface() = default;
    virtual bool gt(const FF& a, const FF& b) = 0;
    virtual bool gt(const uint128_t& a, const uint128_t& b) = 0;
};

class GreaterThan : public GreaterThanInterface {
  public:
    GreaterThan(FieldGreaterThanInterface& field_gt,
                RangeCheckInterface& range_check,
                EventEmitterInterface<GreaterThanEvent>& event_emitter)
        : field_gt(field_gt)
        , range_check(range_check)
        , events(event_emitter)
    {}

    bool gt(const FF& a, const FF& b) override;
    bool gt(const uint128_t& a, const uint128_t& b) override;

  private:
    FieldGreaterThanInterface& field_gt;
    RangeCheckInterface& range_check;
    EventEmitterInterface<GreaterThanEvent>& events;
};

} // namespace bb::avm2::simulation
