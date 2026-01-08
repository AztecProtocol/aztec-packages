#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/ecc.hpp"
#include "barretenberg/vm2/generated/relations/lookups_scalar_mul.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_to_radix.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::Return;
using ::testing::StrictMock;

using tracegen::EccTraceBuilder;
using tracegen::TestTraceContainer;
using tracegen::ToRadixTraceBuilder;

using FF = AvmFlavorSettings::FF;
using C = Column;
using ecc = bb::avm2::ecc<FF>;
using scalar_mul = bb::avm2::scalar_mul<FF>;
using mem_aware_ecc = bb::avm2::ecc_mem<FF>;
using EccSimulator = simulation::Ecc;
using ToRadixSimulator = simulation::ToRadix;

using simulation::EccAddEvent;
using simulation::EccAddMemoryEvent;
using simulation::EventEmitter;
using simulation::MemoryStore;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::MockMemory;
using simulation::NoopEventEmitter;
using simulation::PureGreaterThan;
using simulation::PureToRadix;
using simulation::ScalarMulEvent;
using simulation::ToRadixEvent;
using simulation::ToRadixMemoryEvent;

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

    auto trace = TestTraceContainer({ {
        { C::ecc_add_op, 1 },
        { C::ecc_double_op, 0 },

        { C::ecc_inv_2_p_y, FF::zero() },
        { C::ecc_inv_x_diff, (q.x() - p.x()).invert() },
        { C::ecc_inv_y_diff, (q.y() - p.y()).invert() },

        { C::ecc_lambda, (q.y() - p.y()) / (q.x() - p.x()) },

        // Point P
        { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_p_x, p.x() },
        { C::ecc_p_y, p.y() },

        // Point Q
        { C::ecc_q_is_inf, static_cast<int>(q.is_infinity()) },
        { C::ecc_q_x, q.x() },
        { C::ecc_q_y, q.y() },

        // Resulting Point
        { C::ecc_r_is_inf, static_cast<int>(r.is_infinity()) },
        { C::ecc_r_x, r.x() },
        { C::ecc_r_y, r.y() },

        { C::ecc_result_infinity, 0 },

        { C::ecc_sel, 1 },
        { C::ecc_use_computed_result, 1 },
        { C::ecc_x_match, 0 },
        { C::ecc_y_match, 0 },

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccDouble)
{
    // R = P + P;
    FF r_x("0x088b996194bb5e6e8e5e49733bb671c3e660cf77254f743f366cc8e33534ee3b");
    FF r_y("0x2807ffa01c0f522d0be1e1acfb6914ac8eabf1acf420c0629d37beee992e9a0e");
    EmbeddedCurvePoint r(r_x, r_y, false);

    auto trace = TestTraceContainer({ {
        { C::ecc_add_op, 0 },
        { C::ecc_double_op, 1 },

        { C::ecc_inv_2_p_y, (p.y() * 2).invert() },
        { C::ecc_inv_x_diff, FF::zero() },
        { C::ecc_inv_y_diff, FF::zero() },

        { C::ecc_lambda, (p.x() * p.x() * 3) / (p.y() * 2) },

        // Point P
        { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_p_x, p.x() },
        { C::ecc_p_y, p.y() },

        // Point Q set to point p since this is doubling
        { C::ecc_q_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_q_x, p.x() },
        { C::ecc_q_y, p.y() },

        // Resulting Point
        { C::ecc_r_is_inf, static_cast<int>(r.is_infinity()) },
        { C::ecc_r_x, r.x() },
        { C::ecc_r_y, r.y() },

        { C::ecc_result_infinity, 0 },

        { C::ecc_sel, 1 },
        { C::ecc_use_computed_result, 1 },
        { C::ecc_x_match, 1 },
        { C::ecc_y_match, 1 },

    } });

    check_relation<ecc>(trace);
}

// Test case for adding two points with different x-coordinates but the same y-coordinate.
// This edge case exists because cube roots of unity in BN254 Fr allow multiple x values
// to cube to the same result: if (x, y) is on Grumpkin (y² = x³ - 17), then (ω·x, y)
// is also on the curve since ω³ = 1.
//
// This test uses simulation + tracegen to verify the full pipeline works.
TEST(EccAddConstrainingTest, EccAddSameYDifferentX)
{
    // Point P - known valid point on Grumpkin
    FF local_p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF local_p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint local_p(local_p_x, local_p_y, false);

    // Point Q - p_x * omega (cube root of unity), same y-coordinate!
    // omega = 0x0000000000000000b3c4d79d41a917585bfc41088d8daaa78b17ea66b99c90dd
    FF local_q_x("0x14dd39aa19e1c8b29e0c530a28106a7d64d2213486baba3c86dce51bdddf75bb");
    FF local_q_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint local_q(local_q_x, local_q_y, false);

    // Verify preconditions: same y, different x
    ASSERT_NE(local_p.x(), local_q.x());
    ASSERT_EQ(local_p.y(), local_q.y());

    // Expected result R = P + Q (lambda = 0 since y's are equal)
    FF local_r_x("0x16bdb7ada0799a3088b9dd3faade12c3f79dbfe9cb1234783a1a7add546398dc");
    FF local_r_y("0x2d08e098faf58cb97223d13f2a1b87dd6614173f3cefe87ca6a74e3034c244a1");
    EmbeddedCurvePoint local_r(local_r_x, local_r_y, false);

    // Use simulation to generate events
    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    NoopEventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    PureGreaterThan gt;
    PureToRadix to_radix_simulator;
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    // Perform the addition via simulation
    EmbeddedCurvePoint result = ecc_simulator.add(local_p, local_q);
    ASSERT_EQ(result, local_r) << "Simulation produced wrong result";

    // Build trace from simulation events
    TestTraceContainer trace;
    EccTraceBuilder builder;
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);

    // Verify PIL constraints pass
    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddResultingInInfinity)
{
    // R = P + (-P) = O; , where O is the point at infinity
    EmbeddedCurvePoint q(p.x(), -p.y(), false);
    EmbeddedCurvePoint r(0, 0, true);

    auto trace = TestTraceContainer({ {
        { C::ecc_add_op, 0 },
        { C::ecc_double_op, 0 },

        { C::ecc_inv_2_p_y, FF::zero() },
        { C::ecc_inv_x_diff, FF::zero() },
        { C::ecc_inv_y_diff, (q.y() - p.y()).invert() },

        { C::ecc_lambda, 0 },

        // Point P
        { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_p_x, p.x() },
        { C::ecc_p_y, p.y() },

        // Point Q
        { C::ecc_q_is_inf, static_cast<int>(q.is_infinity()) },
        { C::ecc_q_x, q.x() },
        { C::ecc_q_y, q.y() },

        // Resulting Point
        { C::ecc_r_is_inf, static_cast<int>(r.is_infinity()) },
        { C::ecc_r_x, r.x() },
        { C::ecc_r_y, r.y() },

        { C::ecc_result_infinity, 1 },

        { C::ecc_sel, 1 },
        { C::ecc_x_match, 1 },
        { C::ecc_y_match, 0 },
    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddingToInfinity)
{
    EmbeddedCurvePoint p(0, 0, true);

    // R = O + Q = Q; , where O is the point at infinity

    EmbeddedCurvePoint r(q.x(), q.y(), false);

    auto trace = TestTraceContainer({ {
        { C::ecc_add_op, 1 },
        { C::ecc_double_op, 0 },

        { C::ecc_inv_2_p_y, FF::zero() },
        { C::ecc_inv_x_diff, (q.x() - p.x()).invert() },
        { C::ecc_inv_y_diff, (q.y() - p.y()).invert() },

        { C::ecc_lambda, (q.y() - p.y()) / (q.x() - p.x()) },

        // Point P
        { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_p_x, p.x() },
        { C::ecc_p_y, p.y() },

        // Point Q
        { C::ecc_q_is_inf, static_cast<int>(q.is_infinity()) },
        { C::ecc_q_x, q.x() },
        { C::ecc_q_y, q.y() },

        // Resulting Point
        { C::ecc_r_is_inf, static_cast<int>(r.is_infinity()) },
        { C::ecc_r_x, r.x() },
        { C::ecc_r_y, r.y() },

        { C::ecc_result_infinity, 0 },

        { C::ecc_sel, 1 },
        { C::ecc_x_match, 0 },
        { C::ecc_y_match, 0 },
    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddingInfinity)
{
    EmbeddedCurvePoint q(0, 0, true);

    // R = P + O = P; , where O is the point at infinity
    EmbeddedCurvePoint r(p.x(), p.y(), false);

    auto trace = TestTraceContainer({ {
        { C::ecc_add_op, 1 },
        { C::ecc_double_op, 0 },

        { C::ecc_inv_2_p_y, (p.y() * 2).invert() },
        { C::ecc_inv_x_diff, (q.x() - p.x()).invert() },
        { C::ecc_inv_y_diff, (q.y() - p.y()).invert() },

        { C::ecc_lambda, (q.y() - p.y()) / (q.x() - p.x()) },

        // Point P
        { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_p_x, p.x() },
        { C::ecc_p_y, p.y() },

        // Point Q
        { C::ecc_q_is_inf, static_cast<int>(q.is_infinity()) },
        { C::ecc_q_x, q.x() },
        { C::ecc_q_y, q.y() },

        // Resulting Point
        { C::ecc_r_is_inf, static_cast<int>(r.is_infinity()) },
        { C::ecc_r_x, r.x() },
        { C::ecc_r_y, r.y() },

        { C::ecc_result_infinity, 0 },

        { C::ecc_sel, 1 },
        { C::ecc_x_match, 0 },
        { C::ecc_y_match, 0 },

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccDoublingInf)
{
    EmbeddedCurvePoint p(0, 0, true);

    // r = O + O = O; , where O is the point at infinity
    EmbeddedCurvePoint r(0, 0, true);

    auto trace = TestTraceContainer({ {
        { C::ecc_add_op, 0 },
        { C::ecc_double_op, 1 },

        { C::ecc_inv_2_p_y, FF::zero() },
        { C::ecc_inv_x_diff, FF::zero() },
        { C::ecc_inv_y_diff, FF::zero() },

        { C::ecc_lambda, FF::zero() },

        // Point P
        { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_p_x, p.x() },
        { C::ecc_p_y, p.y() },

        // Point Q
        { C::ecc_q_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_q_x, p.x() },
        { C::ecc_q_y, p.y() },

        // Resulting Point
        { C::ecc_r_is_inf, static_cast<int>(r.is_infinity()) },
        { C::ecc_r_x, r.x() },
        { C::ecc_r_y, r.y() },

        { C::ecc_result_infinity, 1 },

        { C::ecc_sel, 1 },
        { C::ecc_x_match, 1 },
        { C::ecc_y_match, 1 },

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccTwoOps)
{
    EmbeddedCurvePoint r1 = p + q;
    EmbeddedCurvePoint r2 = r1 + r1;

    auto trace = TestTraceContainer({ {
                                          { C::ecc_add_op, 1 },
                                          { C::ecc_double_op, 0 },

                                          { C::ecc_inv_2_p_y, FF::zero() },
                                          { C::ecc_inv_x_diff, (q.x() - p.x()).invert() },
                                          { C::ecc_inv_y_diff, (q.y() - p.y()).invert() },

                                          { C::ecc_lambda, (q.y() - p.y()) / (q.x() - p.x()) },

                                          // Point P
                                          { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
                                          { C::ecc_p_x, p.x() },
                                          { C::ecc_p_y, p.y() },

                                          // Point Q
                                          { C::ecc_q_is_inf, static_cast<int>(q.is_infinity()) },
                                          { C::ecc_q_x, q.x() },
                                          { C::ecc_q_y, q.y() },

                                          // Resulting Point
                                          { C::ecc_r_is_inf, static_cast<int>(r1.is_infinity()) },
                                          { C::ecc_r_x, r1.x() },
                                          { C::ecc_r_y, r1.y() },

                                          { C::ecc_result_infinity, 0 },

                                          { C::ecc_sel, 1 },
                                          { C::ecc_use_computed_result, 1 },
                                          { C::ecc_x_match, 0 },
                                          { C::ecc_y_match, 0 },

                                      },
                                      {
                                          { C::ecc_add_op, 0 },
                                          { C::ecc_double_op, 1 },

                                          { C::ecc_inv_2_p_y, (r1.y() * 2).invert() },
                                          { C::ecc_inv_x_diff, FF::zero() },
                                          { C::ecc_inv_y_diff, FF::zero() },

                                          { C::ecc_lambda, (r1.x() * r1.x() * 3) / (r1.y() * 2) },

                                          // Point P
                                          { C::ecc_p_is_inf, static_cast<int>(r1.is_infinity()) },
                                          { C::ecc_p_x, r1.x() },
                                          { C::ecc_p_y, r1.y() },

                                          // Point Q set to point p since this is doubling
                                          { C::ecc_q_is_inf, static_cast<int>(r1.is_infinity()) },
                                          { C::ecc_q_x, r1.x() },
                                          { C::ecc_q_y, r1.y() },

                                          // Resulting Point
                                          { C::ecc_r_is_inf, static_cast<int>(r2.is_infinity()) },
                                          { C::ecc_r_x, r2.x() },
                                          { C::ecc_r_y, r2.y() },

                                          { C::ecc_result_infinity, 0 },

                                          { C::ecc_sel, 1 },
                                          { C::ecc_use_computed_result, 1 },
                                          { C::ecc_x_match, 1 },
                                          { C::ecc_y_match, 1 },

                                      } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccNegativeBadAdd)
{
    // R != P + Q;

    FF r_x("0x20f096ae3de9aea007e0b94a0274b2443d6682d1901f6909f284ec967bc169be");
    FF r_y("0x27948713833bb314e828f2b6f45f408da6564a3ac03b9e430a9c6634bb849ef2");
    EmbeddedCurvePoint r(r_x, r_y, false);

    auto trace = TestTraceContainer({ {
        { C::ecc_add_op, 1 },
        { C::ecc_double_op, 0 },

        { C::ecc_inv_2_p_y, FF::zero() },
        { C::ecc_inv_x_diff, (q.x() - p.x()).invert() },
        { C::ecc_inv_y_diff, (q.y() - p.y()).invert() },

        { C::ecc_lambda, (q.y() - p.y()) / (q.x() - p.x()) },

        // Point P
        { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_p_x, p.x() },
        { C::ecc_p_y, p.y() },

        // Point Q
        { C::ecc_q_is_inf, static_cast<int>(q.is_infinity()) },
        { C::ecc_q_x, q.x() },
        { C::ecc_q_y, q.y() },

        // Resulting Point
        { C::ecc_r_is_inf, static_cast<int>(r.is_infinity()) },
        { C::ecc_r_x, r.x() },
        { C::ecc_r_y, r.y() },

        { C::ecc_result_infinity, 0 },

        { C::ecc_sel, 1 },
        { C::ecc_x_match, 0 },
        { C::ecc_y_match, 0 },

    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<ecc>(trace, ecc::SR_OUTPUT_X_COORD), "OUTPUT_X_COORD");
}

TEST(EccAddConstrainingTest, EccNegativeBadDouble)
{
    // R != P + P;

    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    EmbeddedCurvePoint r(r_x, r_y, false);

    auto trace = TestTraceContainer({ {
        { C::ecc_add_op, 0 },
        { C::ecc_double_op, 1 },

        { C::ecc_inv_2_p_y, (p.y() * 2).invert() },
        { C::ecc_inv_x_diff, FF::zero() },
        { C::ecc_inv_y_diff, FF::zero() },

        { C::ecc_lambda, (p.x() * p.x() * 3) / (p.y() * 2) },

        // Point P
        { C::ecc_p_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_p_x, p.x() },
        { C::ecc_p_y, p.y() },

        // Point Q set to point p since this is doubling
        { C::ecc_q_is_inf, static_cast<int>(p.is_infinity()) },
        { C::ecc_q_x, p.x() },
        { C::ecc_q_y, p.y() },

        // Resulting Point
        { C::ecc_r_is_inf, static_cast<int>(r.is_infinity()) },
        { C::ecc_r_x, r.x() },
        { C::ecc_r_y, r.y() },

        { C::ecc_result_infinity, 0 },

        { C::ecc_sel, 1 },
        { C::ecc_x_match, 1 },
        { C::ecc_y_match, 1 },

    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<ecc>(trace, ecc::SR_OUTPUT_X_COORD), "OUTPUT_X_COORD");
}

TEST(ScalarMulConstrainingTest, ScalarMulEmptyRow)
{
    check_relation<scalar_mul>(testing::empty_trace());
}

TEST(ScalarMulConstrainingTest, MulByOne)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF(1);
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<scalar_mul>(trace);
}

TEST(ScalarMulConstrainingTest, BasicMul)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<scalar_mul>(trace);
}

// Edge case: Verify that 0 * P = infinity (point at infinity)
TEST(ScalarMulConstrainingTest, MulByZero)
{
    EccTraceBuilder builder;

    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    // Multiply by zero - result should be point at infinity
    FF scalar = FF(0);
    EmbeddedCurvePoint result = ecc_simulator.scalar_mul(p, scalar);

    // Verify result is infinity
    ASSERT_TRUE(result.is_infinity());

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);

    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<scalar_mul>(trace);
    check_relation<ecc>(trace);
}

// Edge case: Verify scalar multiplication works with a large scalar near field modulus
TEST(ScalarMulConstrainingTest, MulByLargeScalar)
{
    EccTraceBuilder builder;

    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    // Use a large scalar (p - 1, where p is the field modulus)
    // BN254 scalar field modulus - 1: 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000
    FF scalar = FF("0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffff");
    EmbeddedCurvePoint result = ecc_simulator.scalar_mul(p, scalar);

    // Verify result is a valid point (not infinity for non-zero scalar with non-infinity point)
    // The exact result depends on the scalar and point, but it should be deterministic
    EmbeddedCurvePoint expected_result = p * Fq(scalar);
    EXPECT_EQ(result, expected_result);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);

    // Note: Row count varies based on number of ECC operations (depends on scalar bit pattern)
    check_relation<scalar_mul>(trace);
    check_relation<ecc>(trace);
}

TEST(ScalarMulConstrainingTest, MultipleInvocations)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    ecc_simulator.scalar_mul(p, FF("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6"));
    ecc_simulator.scalar_mul(q, FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09"));

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + (254) * 2);
    check_relation<scalar_mul>(trace);
}

TEST(ScalarMulConstrainingTest, MulInteractions)
{
    EccTraceBuilder builder;

    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

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
    EccTraceBuilder builder;

    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    EmbeddedCurvePoint result = ecc_simulator.scalar_mul(EmbeddedCurvePoint::infinity(), FF(10));
    ASSERT_TRUE(result.is_infinity());

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);

    check_interaction<EccTraceBuilder, lookup_scalar_mul_double_settings, lookup_scalar_mul_add_settings>(trace);

    check_relation<scalar_mul>(trace);
    check_relation<ecc>(trace);
}

TEST(ScalarMulConstrainingTest, NegativeMulAddInteractions)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);

    EXPECT_THROW_WITH_MESSAGE((check_interaction<EccTraceBuilder, lookup_scalar_mul_double_settings>(trace)),
                              "Failed.*SCALAR_MUL_DOUBLE. Could not find tuple in destination.");
    EXPECT_THROW_WITH_MESSAGE((check_interaction<EccTraceBuilder, lookup_scalar_mul_add_settings>(trace)),
                              "Failed.*SCALAR_MUL_ADD. Could not find tuple in destination.");
}

TEST(ScalarMulConstrainingTest, NegativeMulRadixInteractions)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);

    EXPECT_THROW_WITH_MESSAGE((check_interaction<EccTraceBuilder, lookup_scalar_mul_to_radix_settings>(trace)),
                              "Failed.*SCALAR_MUL_TO_RADIX. Could not find tuple in destination.");

    check_relation<scalar_mul>(trace);
}

TEST(ScalarMulConstrainingTest, NegativeDisableSel)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Disable the selector in one of the rows between start and end
    trace.set(Column::scalar_mul_sel, 5, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_SELECTOR_CONSISTENCY),
                              "SELECTOR_CONSISTENCY");
}

TEST(ScalarMulConstrainingTest, NegativeEnableStartFirstRow)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Enable the start in the first row
    trace.set(Column::scalar_mul_start, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_SELECTOR_ON_START), "SELECTOR_ON_START");
}

TEST(ScalarMulConstrainingTest, NegativeMutateScalarOnEnd)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Mutate the scalar on the end row
    trace.set(Column::scalar_mul_scalar, 254, 27);
    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_INPUT_CONSISTENCY_SCALAR),
                              "INPUT_CONSISTENCY_SCALAR");
}

TEST(ScalarMulConstrainingTest, NegativeMutatePointXOnEnd)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Mutate the point on the end row
    trace.set(Column::scalar_mul_point_x, 254, q.x());

    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_INPUT_CONSISTENCY_X),
                              "INPUT_CONSISTENCY_X");
}

TEST(ScalarMulConstrainingTest, NegativeMutatePointYOnEnd)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Mutate the point on the end row
    trace.set(Column::scalar_mul_point_y, 254, q.y());

    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_INPUT_CONSISTENCY_Y),
                              "INPUT_CONSISTENCY_Y");
}

TEST(ScalarMulConstrainingTest, NegativeMutatePointInfOnEnd)
{
    EccTraceBuilder builder;

    NoopEventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    FF scalar = FF("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    ecc_simulator.scalar_mul(p, scalar);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);
    // Mutate the point on the end row
    trace.set(Column::scalar_mul_point_inf, 254, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<scalar_mul>(trace, scalar_mul::SR_INPUT_CONSISTENCY_INF),
                              "INPUT_CONSISTENCY_INF");
}

///////////////////////////
// Memory Aware Ecc Add
///////////////////////////

TEST(EccAddMemoryConstrainingTest, EccAddMemoryEmptyRow)
{
    check_relation<mem_aware_ecc>(testing::empty_trace());
}

TEST(EccAddMemoryConstrainingTest, EccAddMemory)
{
    TestTraceContainer trace;
    EccTraceBuilder builder;
    MemoryStore memory;

    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;
    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    NoopEventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id)
        .WillRepeatedly(Return(0)); // Use a fixed execution IDfor the test
    PureGreaterThan gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    MemoryAddress dst_address = 5;
    ecc_simulator.add(memory, p, q, dst_address);
    builder.process_add_with_memory(ecc_add_memory_event_emitter.dump_events(), trace);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);

    check_relation<mem_aware_ecc>(trace);
}

TEST(EccAddMemoryConstrainingTest, EccAddMemoryInteractions)
{

    EccTraceBuilder builder;
    MemoryStore memory;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id)
        .WillRepeatedly(Return(0)); // Use a fixed execution IDfor the test
    PureGreaterThan gt;
    PureToRadix to_radix_simulator = PureToRadix();

    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    NoopEventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;
    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    EmbeddedCurvePoint result = p + q;

    uint32_t dst_address = 0x1000;
    // Set the execution and gt traces
    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_exec_dispatch_ecc_add, 1 },
            { C::execution_rop_6_, dst_address },
            { C::execution_register_0_, p.x() },
            { C::execution_register_1_, p.y() },
            { C::execution_register_2_, p.is_infinity() ? 1 : 0 },
            { C::execution_register_3_, q.x() },
            { C::execution_register_4_, q.y() },
            { C::execution_register_5_, q.is_infinity() ? 1 : 0 },
            // GT - dst out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, dst_address + 2 }, // highest write address is dst_address + 2
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 },
            // Memory Writes
            { C::memory_address, dst_address },
            { C::memory_value, result.x() },
            { C::memory_sel, 1 },
            { C::memory_rw, 1 }, // write
            { C::memory_tag, static_cast<uint8_t>(MemoryTag::FF) },
        },
        {
            // Memory Writes
            { C::memory_address, dst_address + 1 },
            { C::memory_value, result.y() },
            { C::memory_sel, 1 },
            { C::memory_rw, 1 }, // write
            { C::memory_tag, static_cast<uint8_t>(MemoryTag::FF) },
        },
        {
            // Memory Writes
            { C::memory_address, dst_address + 2 },
            { C::memory_value, result.is_infinity() },
            { C::memory_sel, 1 },
            { C::memory_rw, 1 }, // write
            { C::memory_tag, static_cast<uint8_t>(MemoryTag::U1) },
        },
    });

    ecc_simulator.add(memory, p, q, dst_address);

    builder.process_add_with_memory(ecc_add_memory_event_emitter.dump_events(), trace);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);

    check_all_interactions<EccTraceBuilder>(trace);
    check_relation<mem_aware_ecc>(trace);
}

TEST(EccAddMemoryConstrainingTest, EccAddMemoryInvalidDstRange)
{

    EccTraceBuilder builder;
    MemoryStore memory;

    NoopEventEmitter<ToRadixEvent> to_radix_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;
    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    NoopEventEmitter<ScalarMulEvent> scalar_mul_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id)
        .WillRepeatedly(Return(0)); // Use a fixed execution IDfor the test
    PureGreaterThan gt;
    PureToRadix to_radix_simulator = PureToRadix();

    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    uint32_t dst_address = AVM_HIGHEST_MEM_ADDRESS - 1; // Invalid address, will result in out of range error
    // Set the execution and gt traces
    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_exec_dispatch_ecc_add, 1 },
            { C::execution_rop_6_, dst_address },
            { C::execution_register_0_, p.x() },
            { C::execution_register_1_, p.y() },
            { C::execution_register_2_, p.is_infinity() ? 1 : 0 },
            { C::execution_register_3_, q.x() },
            { C::execution_register_4_, q.y() },
            { C::execution_register_5_, q.is_infinity() ? 1 : 0 },
            { C::execution_sel_opcode_error, 1 },
            // GT - dst out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, static_cast<uint64_t>(dst_address) + 2 },
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 1 },
        },
    });

    EXPECT_THROW_WITH_MESSAGE(ecc_simulator.add(memory, p, q, dst_address), "EccException.* dst address out of range");

    builder.process_add_with_memory(ecc_add_memory_event_emitter.dump_events(), trace);
    EXPECT_EQ(ecc_add_event_emitter.get_events().size(), 0); // Expect 0 add events since error in ecc_mem

    check_all_interactions<EccTraceBuilder>(trace);
    check_relation<mem_aware_ecc>(trace);
}

TEST(EccAddMemoryConstrainingTest, EccAddMemoryPointError)
{

    EccTraceBuilder builder;
    MemoryStore memory;
    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    NoopEventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id)
        .WillRepeatedly(Return(0)); // Use a fixed execution IDfor the test
    PureGreaterThan gt;
    PureToRadix to_radix_simulator = PureToRadix();

    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    // Point P is not on the curve
    FF p_x("0x0000000000063d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x00000000000c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);

    uint32_t dst_address = 0x1000;

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(::testing::Return(0));
    // Set the execution and gt traces
    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_exec_dispatch_ecc_add, 1 },
            { C::execution_rop_6_, dst_address },
            { C::execution_register_0_, p.x() },
            { C::execution_register_1_, p.y() },
            { C::execution_register_2_, p.is_infinity() ? 1 : 0 },
            { C::execution_register_3_, q.x() },
            { C::execution_register_4_, q.y() },
            { C::execution_register_5_, q.is_infinity() ? 1 : 0 },
            { C::execution_sel_opcode_error, 1 }, // Indicate an error in the operation
            // GT - dst out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, dst_address + 2 }, // highest write address is dst_address + 2
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 },
        },
    });

    EXPECT_THROW(ecc_simulator.add(memory, p, q, dst_address), simulation::EccException);

    builder.process_add_with_memory(ecc_add_memory_event_emitter.dump_events(), trace);
    // Expect no events to be emitted since the operation failed
    EXPECT_EQ(ecc_add_event_emitter.get_events().size(), 0);

    check_all_interactions<EccTraceBuilder>(trace);
    check_relation<mem_aware_ecc>(trace);
}

TEST(EccAddMemoryConstrainingTest, InfinityRepresentations)
{
    EccTraceBuilder builder;

    EventEmitter<EccAddEvent> ecc_add_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id)
        .WillRepeatedly(Return(0)); // Use a fixed execution ID for the test
    PureGreaterThan gt;
    PureToRadix to_radix_simulator = PureToRadix();
    EccSimulator ecc_simulator(execution_id_manager,
                               gt,
                               to_radix_simulator,
                               ecc_add_event_emitter,
                               scalar_mul_event_emitter,
                               ecc_add_memory_event_emitter);

    // Point P is infinity
    EmbeddedCurvePoint inf = EmbeddedCurvePoint::infinity();
    // EmbeddedCurvePoint preserves raw coordinates (see StandardAffinePointTest)
    EmbeddedCurvePoint inf_bb = EmbeddedCurvePoint(avm2::AffinePoint::infinity());
    EmbeddedCurvePoint inf_alt = EmbeddedCurvePoint(1, 2, true);
    TestTraceContainer trace;

    // Coordinates are ignored in the circuit if the point is infinity, but tracegen assigns predicates (double, add, or
    // inf) based on coordinates.
    // This means add_predicate is incorrectly true when we are doubling inf if the underlying coordinates both don't
    // match, but the circuit correctly ignores this with BOTH_INF (no errors/issues):
    ecc_simulator.add(inf, inf_alt);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);
    check_relation<ecc>(trace);

    // However, if the inf representation's have !x_match && y_match (impossible with real coordinates), no predicates
    // are set and we fail the OP_CHECK relation. This is true for the noir (0, 0) and bb (x, 0) inf reps:
    ecc_simulator.add(inf, inf_bb);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);
    EXPECT_THROW_WITH_MESSAGE(check_relation<ecc>(trace, ecc::SR_OP_CHECK), "OP_CHECK");
    check_all_interactions<EccTraceBuilder>(trace);
    // Note: the circuit assumes the point has already been checked to be on the curve and => the coordinates satisfy
    // the curve eqn => the case !x_match and y_match doesn't exist

    // We can:
    // Enforce that inf is represented by a fixed set of coordinates in the circuit (0,0), so that the x_match etc.
    // columns are correct in the circuit as is
    //
    // Mutate the coordinates in C++ (either via EmbeddedCurvePoint or in tracegen) beforehand so if BOTH_INF is true,
    // the coordinates always match.
    //
    // Constrain some relations by BOTH_INF e.g. double_op - (x_match * y_match) = 0; -> double_op - (x_match * y_match
    // + BOTH_INF - x_match * y_match * BOTH_INF) = 0;

    // Bonus: memory aware add (above issue does not affect memory lookups etc.):
    MemoryStore memory;
    MemoryAddress dst_address = 5;
    trace.set(0,
              { { // Execution
                  { C::execution_sel, 1 },
                  { C::execution_sel_exec_dispatch_ecc_add, 1 },
                  { C::execution_rop_6_, dst_address },
                  { C::execution_register_0_, inf.x() },
                  { C::execution_register_1_, inf.y() },
                  { C::execution_register_2_, inf.is_infinity() ? 1 : 0 },
                  { C::execution_register_3_, inf_bb.x() },
                  { C::execution_register_4_, inf_bb.y() },
                  { C::execution_register_5_, inf_bb.is_infinity() ? 1 : 0 },
                  // GT - dst out of range check
                  { C::gt_sel, 1 },
                  { C::gt_input_a, dst_address + 2 }, // highest write address is dst_address + 2
                  { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
                  { C::gt_res, 0 } } });
    ecc_simulator.add(memory, inf, inf_bb, dst_address);
    builder.process_add_with_memory(ecc_add_memory_event_emitter.dump_events(), trace);
    builder.process_add(ecc_add_event_emitter.dump_events(), trace);

    check_relation<mem_aware_ecc>(trace);
    EXPECT_THROW_WITH_MESSAGE(check_relation<ecc>(trace, ecc::SR_OP_CHECK), "OP_CHECK");
    check_all_interactions<EccTraceBuilder>(trace);
    check_interaction<tracegen::ExecutionTraceBuilder, bb::avm2::perm_execution_dispatch_to_ecc_add_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
