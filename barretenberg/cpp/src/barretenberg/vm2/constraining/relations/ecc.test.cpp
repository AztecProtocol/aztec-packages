#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/ecc.hpp"
#include "barretenberg/vm2/generated/relations/lookups_scalar_mul.hpp"
#include "barretenberg/vm2/simulation/ecc.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::EccTraceBuilder;
using tracegen::TestTraceContainer;
using tracegen::ToRadixTraceBuilder;

using FF = AvmFlavorSettings::FF;
using C = Column;
using ecc = bb::avm2::ecc<FF>;
using scalar_mul = bb::avm2::scalar_mul<FF>;
using EccSimulator = simulation::Ecc;
using ToRadixSimulator = simulation::ToRadix;

using simulation::EccAddEvent;
using simulation::EventEmitter;
using simulation::NoopEventEmitter;
using simulation::ScalarMulEvent;
using simulation::ToRadixEvent;

// Known good points for P and Q
FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
EmbeddedCurvePoint p(p_x, p_y, false);

FF q_x("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
FF q_y("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3");
EmbeddedCurvePoint q(q_x, q_y, false);

TEST(EccAddConstrainingTest, EccEmptyRow)
{
    check_relation<ecc>(testing::empty_trace());
}

TEST(EccAddConstrainingTest, EccAdd)
{
    // R = P + Q;
    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    EmbeddedCurvePoint r(r_x, r_y, false);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 1,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = (q.x() - p.x()).invert(),
        .ecc_inv_y_diff = (q.y() - p.y()).invert(),

        .ecc_lambda = (q.y() - p.y()) / (q.x() - p.x()),

        // Point P
        .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_p_x = p.x(),
        .ecc_p_y = p.y(),

        // Point Q
        .ecc_q_is_inf = static_cast<int>(q.is_infinity()),
        .ecc_q_x = q.x(),
        .ecc_q_y = q.y(),

        // Resulting Point
        .ecc_r_is_inf = static_cast<int>(r.is_infinity()),
        .ecc_r_x = r.x(),
        .ecc_r_y = r.y(),

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_use_computed_result = 1,
        .ecc_x_match = 0,
        .ecc_y_match = 0,

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccDouble)
{
    // R = P + P;
    FF r_x("0x088b996194bb5e6e8e5e49733bb671c3e660cf77254f743f366cc8e33534ee3b");
    FF r_y("0x2807ffa01c0f522d0be1e1acfb6914ac8eabf1acf420c0629d37beee992e9a0e");
    EmbeddedCurvePoint r(r_x, r_y, false);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 0,
        .ecc_double_op = 1,

        .ecc_inv_2_p_y = (p.y() * 2).invert(),
        .ecc_inv_x_diff = FF::zero(),
        .ecc_inv_y_diff = FF::zero(),

        .ecc_lambda = (p.x() * p.x() * 3) / (p.y() * 2),

        // Point P
        .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_p_x = p.x(),
        .ecc_p_y = p.y(),

        // Point Q set to point p since this is doubling
        .ecc_q_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_q_x = p.x(),
        .ecc_q_y = p.y(),

        // Resulting Point
        .ecc_r_is_inf = static_cast<int>(r.is_infinity()),
        .ecc_r_x = r.x(),
        .ecc_r_y = r.y(),

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_use_computed_result = 1,
        .ecc_x_match = 1,
        .ecc_y_match = 1,

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddResultingInInfinity)
{
    // R = P + (-P) = O; , where O is the point at infinity
    EmbeddedCurvePoint q(p.x(), -p.y(), false);
    EmbeddedCurvePoint r(0, 0, true);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 0,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = FF::zero(),
        .ecc_inv_y_diff = (q.y() - p.y()).invert(),

        .ecc_lambda = 0,

        // Point P
        .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_p_x = p.x(),
        .ecc_p_y = p.y(),

        // Point Q
        .ecc_q_is_inf = static_cast<int>(q.is_infinity()),
        .ecc_q_x = q.x(),
        .ecc_q_y = q.y(),

        // Resulting Point
        .ecc_r_is_inf = static_cast<int>(r.is_infinity()),
        .ecc_r_x = r.x(),
        .ecc_r_y = r.y(),

        .ecc_result_infinity = 1,

        .ecc_sel = 1,
        .ecc_x_match = 1,
        .ecc_y_match = 0,
    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddingToInfinity)
{
    EmbeddedCurvePoint p(0, 0, true);

    // R = O + Q = Q; , where O is the point at infinity

    EmbeddedCurvePoint r(q.x(), q.y(), false);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 1,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = (q.x() - p.x()).invert(),
        .ecc_inv_y_diff = (q.y() - p.y()).invert(),

        .ecc_lambda = (q.y() - p.y()) / (q.x() - p.x()),

        // Point P
        .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_p_x = p.x(),
        .ecc_p_y = p.y(),

        // Point Q
        .ecc_q_is_inf = static_cast<int>(q.is_infinity()),
        .ecc_q_x = q.x(),
        .ecc_q_y = q.y(),

        // Resulting Point
        .ecc_r_is_inf = static_cast<int>(r.is_infinity()),
        .ecc_r_x = r.x(),
        .ecc_r_y = r.y(),

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_x_match = 0,
        .ecc_y_match = 0,
    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddingInfinity)
{
    EmbeddedCurvePoint q(0, 0, true);

    // R = P + O = P; , where O is the point at infinity
    EmbeddedCurvePoint r(p.x(), p.y(), false);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 1,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = (p.y() * 2).invert(),
        .ecc_inv_x_diff = (q.x() - p.x()).invert(),
        .ecc_inv_y_diff = (q.y() - p.y()).invert(),

        .ecc_lambda = (q.y() - p.y()) / (q.x() - p.x()),

        // Point P
        .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_p_x = p.x(),
        .ecc_p_y = p.y(),

        // Point Q
        .ecc_q_is_inf = static_cast<int>(q.is_infinity()),
        .ecc_q_x = q.x(),
        .ecc_q_y = q.y(),

        // Resulting Point
        .ecc_r_is_inf = static_cast<int>(r.is_infinity()),
        .ecc_r_x = r.x(),
        .ecc_r_y = r.y(),

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_x_match = 0,
        .ecc_y_match = 0,

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccDoublingInf)
{
    EmbeddedCurvePoint p(0, 0, true);

    // r = O + O = O; , where O is the point at infinity
    EmbeddedCurvePoint r(0, 0, true);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 0,
        .ecc_double_op = 1,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = FF::zero(),
        .ecc_inv_y_diff = FF::zero(),

        .ecc_lambda = FF::zero(),

        // Point P
        .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_p_x = p.x(),
        .ecc_p_y = p.y(),

        // Point Q
        .ecc_q_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_q_x = p.x(),
        .ecc_q_y = p.y(),

        // Resulting Point
        .ecc_r_is_inf = static_cast<int>(r.is_infinity()),
        .ecc_r_x = r.x(),
        .ecc_r_y = r.y(),

        .ecc_result_infinity = 1,

        .ecc_sel = 1,
        .ecc_x_match = 1,
        .ecc_y_match = 1,

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccTwoOps)
{
    EmbeddedCurvePoint r1 = p + q;
    EmbeddedCurvePoint r2 = r1 + r1;

    auto trace = TestTraceContainer::from_rows({ {
                                                     .ecc_add_op = 1,
                                                     .ecc_double_op = 0,

                                                     .ecc_inv_2_p_y = FF::zero(),
                                                     .ecc_inv_x_diff = (q.x() - p.x()).invert(),
                                                     .ecc_inv_y_diff = (q.y() - p.y()).invert(),

                                                     .ecc_lambda = (q.y() - p.y()) / (q.x() - p.x()),

                                                     // Point P
                                                     .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
                                                     .ecc_p_x = p.x(),
                                                     .ecc_p_y = p.y(),

                                                     // Point Q
                                                     .ecc_q_is_inf = static_cast<int>(q.is_infinity()),
                                                     .ecc_q_x = q.x(),
                                                     .ecc_q_y = q.y(),

                                                     // Resulting Point
                                                     .ecc_r_is_inf = static_cast<int>(r1.is_infinity()),
                                                     .ecc_r_x = r1.x(),
                                                     .ecc_r_y = r1.y(),

                                                     .ecc_result_infinity = 0,

                                                     .ecc_sel = 1,
                                                     .ecc_use_computed_result = 1,
                                                     .ecc_x_match = 0,
                                                     .ecc_y_match = 0,

                                                 },
                                                 {
                                                     .ecc_add_op = 0,
                                                     .ecc_double_op = 1,

                                                     .ecc_inv_2_p_y = (r1.y() * 2).invert(),
                                                     .ecc_inv_x_diff = FF::zero(),
                                                     .ecc_inv_y_diff = FF::zero(),

                                                     .ecc_lambda = (r1.x() * r1.x() * 3) / (r1.y() * 2),

                                                     // Point P
                                                     .ecc_p_is_inf = static_cast<int>(r1.is_infinity()),
                                                     .ecc_p_x = r1.x(),
                                                     .ecc_p_y = r1.y(),

                                                     // Point Q set to point p since this is doubling
                                                     .ecc_q_is_inf = static_cast<int>(r1.is_infinity()),
                                                     .ecc_q_x = r1.x(),
                                                     .ecc_q_y = r1.y(),

                                                     // Resulting Point
                                                     .ecc_r_is_inf = static_cast<int>(r2.is_infinity()),
                                                     .ecc_r_x = r2.x(),
                                                     .ecc_r_y = r2.y(),

                                                     .ecc_result_infinity = 0,

                                                     .ecc_sel = 1,
                                                     .ecc_use_computed_result = 1,
                                                     .ecc_x_match = 1,
                                                     .ecc_y_match = 1,

                                                 } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccNegativeBadAdd)
{
    // R != P + Q;

    FF r_x("0x20f096ae3de9aea007e0b94a0274b2443d6682d1901f6909f284ec967bc169be");
    FF r_y("0x27948713833bb314e828f2b6f45f408da6564a3ac03b9e430a9c6634bb849ef2");
    EmbeddedCurvePoint r(r_x, r_y, false);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 1,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = (q.x() - p.x()).invert(),
        .ecc_inv_y_diff = (q.y() - p.y()).invert(),

        .ecc_lambda = (q.y() - p.y()) / (q.x() - p.x()),

        // Point P
        .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_p_x = p.x(),
        .ecc_p_y = p.y(),

        // Point Q
        .ecc_q_is_inf = static_cast<int>(q.is_infinity()),
        .ecc_q_x = q.x(),
        .ecc_q_y = q.y(),

        // Resulting Point
        .ecc_r_is_inf = static_cast<int>(r.is_infinity()),
        .ecc_r_x = r.x(),
        .ecc_r_y = r.y(),

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_x_match = 0,
        .ecc_y_match = 0,

    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<ecc>(trace, ecc::SR_OUTPUT_X_COORD), "OUTPUT_X_COORD");
}

TEST(EccAddConstrainingTest, EccNegativeBadDouble)
{
    // R != P + P;

    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    EmbeddedCurvePoint r(r_x, r_y, false);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 0,
        .ecc_double_op = 1,

        .ecc_inv_2_p_y = (p.y() * 2).invert(),
        .ecc_inv_x_diff = FF::zero(),
        .ecc_inv_y_diff = FF::zero(),

        .ecc_lambda = (p.x() * p.x() * 3) / (p.y() * 2),

        // Point P
        .ecc_p_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_p_x = p.x(),
        .ecc_p_y = p.y(),

        // Point Q set to point p since this is doubling
        .ecc_q_is_inf = static_cast<int>(p.is_infinity()),
        .ecc_q_x = p.x(),
        .ecc_q_y = p.y(),

        // Resulting Point
        .ecc_r_is_inf = static_cast<int>(r.is_infinity()),
        .ecc_r_x = r.x(),
        .ecc_r_y = r.y(),

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_x_match = 1,
        .ecc_y_match = 1,

    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<ecc>(trace, ecc::SR_OUTPUT_X_COORD), "OUTPUT_X_COORD");
}

TEST(ScalarMulConstrainingTest, ScalarMulEmptyRow)
{
    check_relation<scalar_mul>(testing::empty_trace());
}

TEST(ScalarMulConstrainingTest, MulByOne)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF(1);
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<scalar_mul>(trace);
}

TEST(ScalarMulConstrainingTest, BasicMul)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<scalar_mul>(trace);
}

TEST(ScalarMulConstrainingTest, MultipleInvocations)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    ecc_simulator.scalar_mul(p, FF("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6"));
    ecc_simulator.scalar_mul(q, FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09"));

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + (254) * 2);
    check_relation<scalar_mul>(trace);
}

TEST(ScalarMulConstrainingTest, MulInteractions)
{
    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    ToRadixTraceBuilder to_radix_builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);
    to_radix_builder.process(to_radix_event_emitter.dump_events(), trace);

    check_interaction<EccTraceBuilder,
                      lookup_scalar_mul_double_settings,
                      lookup_scalar_mul_add_settings,
                      lookup_scalar_mul_to_radix_settings>(trace);
}

TEST(ScalarMulConstrainingTest, MulAddInteractionsInfinity)
{
    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    EmbeddedCurvePoint result = ecc_simulator.scalar_mul(EmbeddedCurvePoint::infinity(), FF(10));
    ASSERT(result.is_infinity());

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);

    check_interaction<EccTraceBuilder, lookup_scalar_mul_double_settings, lookup_scalar_mul_add_settings>(trace);

    check_relation<scalar_mul>(trace);
    check_relation<ecc>(trace);
}

TEST(ScalarMulConstrainingTest, NegativeMulAddInteractions)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);

    EXPECT_THROW_WITH_MESSAGE((check_interaction<EccTraceBuilder, lookup_scalar_mul_double_settings>(trace)),
                              "Failed.*SCALAR_MUL_DOUBLE. Could not find tuple in destination.");
    EXPECT_THROW_WITH_MESSAGE((check_interaction<EccTraceBuilder, lookup_scalar_mul_add_settings>(trace)),
                              "Failed.*SCALAR_MUL_ADD. Could not find tuple in destination.");
}

TEST(ScalarMulConstrainingTest, NegativeMulRadixInteractions)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);

    EXPECT_THROW_WITH_MESSAGE((check_interaction<EccTraceBuilder, lookup_scalar_mul_to_radix_settings>(trace)),
                              "Failed.*SCALAR_MUL_TO_RADIX. Could not find tuple in destination.");

    check_relation<scalar_mul>(trace);
}

TEST(ScalarMulConstrainingTest, NegativeDisableSel)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Disable the selector in one of the rows between start and end
    trace.set(Column::scalar_mul_sel, 5, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_SELECTOR_CONSISTENCY),
                              "SELECTOR_CONSISTENCY");
}

TEST(ScalarMulConstrainingTest, NegativeEnableStartFirstRow)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Enable the start in the first row
    trace.set(Column::scalar_mul_start, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_SELECTOR_ON_START), "SELECTOR_ON_START");
}

TEST(ScalarMulConstrainingTest, NegativeMutateScalarOnEnd)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Mutate the scalar on the end row
    trace.set(Column::scalar_mul_scalar, 254, 27);
    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_INPUT_CONSISTENCY_SCALAR),
                              "INPUT_CONSISTENCY_SCALAR");
}

TEST(ScalarMulConstrainingTest, NegativeMutatePointXOnEnd)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Mutate the point on the end row
    trace.set(Column::scalar_mul_point_x, 254, q.x());

    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_INPUT_CONSISTENCY_X),
                              "INPUT_CONSISTENCY_X");
}

TEST(ScalarMulConstrainingTest, NegativeMutatePointYOnEnd)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Mutate the point on the end row
    trace.set(Column::scalar_mul_point_y, 254, q.y());

    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_INPUT_CONSISTENCY_Y),
                              "INPUT_CONSISTENCY_Y");
}

TEST(ScalarMulConstrainingTest, NegativeMutatePointInfOnEnd)
{
    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);
    EccSimulator ecc_simulator(to_radix_simulator, ecc_add_event_emitter, scalar_mul_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    EccTraceBuilder builder;
    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Mutate the point on the end row
    trace.set(Column::scalar_mul_point_inf, 254, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_INPUT_CONSISTENCY_INF),
                              "INPUT_CONSISTENCY_INF");
}

} // namespace
} // namespace bb::avm2::constraining
