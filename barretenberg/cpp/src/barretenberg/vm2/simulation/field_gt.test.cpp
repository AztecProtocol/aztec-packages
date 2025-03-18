#include "barretenberg/vm2/simulation/field_gt.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::simulation {

namespace {

TEST(AvmSimulationFieldGreaterThanTest, Basic)
{
    NoopEventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt(event_emitter);

    assert(field_gt.ff_gt(FF::one(), FF::zero()));
    assert(field_gt.ff_gt(FF::neg_one(), FF::zero()));

    assert(!field_gt.ff_gt(FF::zero(), FF::zero()));
    assert(!field_gt.ff_gt(FF::neg_one(), FF::neg_one()));
    assert(!field_gt.ff_gt(FF::zero(), FF::one()));
    assert(!field_gt.ff_gt(FF::zero(), FF::neg_one()));
}

} // namespace
} // namespace bb::avm2::simulation
