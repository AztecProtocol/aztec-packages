#include "barretenberg/vm2/simulation/ecc.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationEccTest, Add)
{
    EventEmitter<EccAddEvent> ecc_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;

    Ecc ecc(ecc_event_emitter, scalar_mul_event_emitter);

    FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    AffinePoint p(p_x, p_y);

    FF q_x("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
    FF q_y("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3");
    AffinePoint q(q_x, q_y);

    AffinePoint result = ecc.add(p, q);

    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");

    EXPECT_EQ(result.x, r_x);
    EXPECT_EQ(result.y, r_y);
    EXPECT_EQ(result.is_point_at_infinity(), 0);

    auto events = ecc_event_emitter.dump_events();
    EXPECT_EQ(events.size(), 1);
    EXPECT_EQ(events[0].p, p);
    EXPECT_EQ(events[0].q, q);
    EXPECT_EQ(events[0].result, result);
}

TEST(AvmSimulationEccTest, ScalarMul)
{
    EventEmitter<EccAddEvent> ecc_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;

    Ecc ecc(ecc_event_emitter, scalar_mul_event_emitter);

    FF scalar("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");

    FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    AffinePoint p(p_x, p_y);

    AffinePoint result = ecc.scalar_mul(p, scalar);

    AffinePoint expected_result = p * Fq(scalar);

    EXPECT_EQ(result, expected_result);

    auto events = scalar_mul_event_emitter.dump_events();
    EXPECT_EQ(events.size(), 1);
    ScalarMulEvent event = events[0];
    EXPECT_EQ(event.point, p);
    EXPECT_EQ(event.scalar, scalar);
    EXPECT_EQ(event.result, result);
    EXPECT_EQ(event.intermediate_states.size(), 254);
}

} // namespace
} // namespace bb::avm2::simulation
