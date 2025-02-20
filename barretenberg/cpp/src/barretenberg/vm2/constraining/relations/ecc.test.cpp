#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/ecc.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using ecc = bb::avm2::ecc<FF>;

// Known good points for P and Q
FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
AffinePoint p(p_x, p_y);

FF q_x("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
FF q_y("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3");
AffinePoint q(q_x, q_y);

TEST(EccAddConstrainingTest, EccEmptyRow)
{
    auto trace = TestTraceContainer::from_rows({
        { .precomputed_clk = 1 },
    });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAdd)
{
    // R = P + Q;
    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    AffinePoint r(r_x, r_y);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 1,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = (q.x - p.x).invert(),
        .ecc_inv_y_diff = (q.y - p.y).invert(),

        .ecc_lambda = (q.y - p.y) / (q.x - p.x),

        // Point P
        .ecc_p_is_inf = 0,
        .ecc_p_x = p.x,
        .ecc_p_y = p.y,

        // Point Q
        .ecc_q_is_inf = 0,
        .ecc_q_x = q.x,
        .ecc_q_y = q.y,

        // Resulting Point
        .ecc_r_is_inf = 0,
        .ecc_r_x = r.x,
        .ecc_r_y = r.y,

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
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
    AffinePoint r(r_x, r_y);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 0,
        .ecc_double_op = 1,

        .ecc_inv_2_p_y = (p.y * 2).invert(),
        .ecc_inv_x_diff = FF::zero(),
        .ecc_inv_y_diff = FF::zero(),

        .ecc_lambda = (p.x * p.x * 3) / (p.y * 2),

        // Point P
        .ecc_p_is_inf = 0,
        .ecc_p_x = p.x,
        .ecc_p_y = p.y,

        // Point Q set to point p since this is doubling
        .ecc_q_is_inf = 0,
        .ecc_q_x = p.x,
        .ecc_q_y = p.y,

        // Resulting Point
        .ecc_r_is_inf = 0,
        .ecc_r_x = r.x,
        .ecc_r_y = r.y,

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_x_match = 1,
        .ecc_y_match = 1,

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddResultingInInfinity)
{
    // R = P + (-P) = O; , where O is the point at infinity
    AffinePoint q(p.x, -p.y);
    // Infinity coordinates
    FF r_x("0x183227397098d014dc2822db40c0ac2e9419f4243cdcb848a1f0fac9f8000001");
    FF r_y("0x0000000000000000000000000000000000000000000000000000000000000000");
    AffinePoint r(r_x, r_y);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 0,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = FF::zero(),
        .ecc_inv_y_diff = (q.y - p.y).invert(),

        .ecc_lambda = 0,

        // Point P
        .ecc_p_is_inf = 0,
        .ecc_p_x = p.x,
        .ecc_p_y = p.y,

        // Point Q
        .ecc_q_is_inf = 0,
        .ecc_q_x = q.x,
        .ecc_q_y = q.y,

        // Resulting Point
        .ecc_r_is_inf = 1,
        .ecc_r_x = r.x,
        .ecc_r_y = r.y,

        .ecc_result_infinity = 1,

        .ecc_sel = 1,
        .ecc_x_match = 1,
        .ecc_y_match = 0,
    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddingToInfinity)
{
    // Infinity coordinates
    FF p_x("0x183227397098d014dc2822db40c0ac2e9419f4243cdcb848a1f0fac9f8000001");
    FF p_y("0x0000000000000000000000000000000000000000000000000000000000000000");
    AffinePoint p(p_x, p_y);

    // R = O + Q = Q; , where O is the point at infinity
    AffinePoint r(q.x, q.y);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 1,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = (q.x - p.x).invert(),
        .ecc_inv_y_diff = (q.y - p.y).invert(),

        .ecc_lambda = (q.y - p.y) / (q.x - p.x),

        // Point P
        .ecc_p_is_inf = 1,
        .ecc_p_x = p.x,
        .ecc_p_y = p.y,

        // Point Q
        .ecc_q_is_inf = 0,
        .ecc_q_x = q.x,
        .ecc_q_y = q.y,

        // Resulting Point
        .ecc_r_is_inf = 0,
        .ecc_r_x = r.x,
        .ecc_r_y = r.y,

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_x_match = 0,
        .ecc_y_match = 0,
    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccAddingInfinity)
{
    // Infinity coordinates
    FF q_x("0x183227397098d014dc2822db40c0ac2e9419f4243cdcb848a1f0fac9f8000001");
    FF q_y("0x0000000000000000000000000000000000000000000000000000000000000000");
    AffinePoint q(q_x, q_y);

    // R = P + O = P; , where O is the point at infinity
    AffinePoint r(p.x, p.y);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 1,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = (p.y * 2).invert(),
        .ecc_inv_x_diff = (q.x - p.x).invert(),
        .ecc_inv_y_diff = (q.y - p.y).invert(),

        .ecc_lambda = (q.y - p.y) / (q.x - p.x),

        // Point P
        .ecc_p_is_inf = 0,
        .ecc_p_x = p.x,
        .ecc_p_y = p.y,

        // Point Q
        .ecc_q_is_inf = 1,
        .ecc_q_x = q.x,
        .ecc_q_y = q.y,

        // Resulting Point
        .ecc_r_is_inf = 0,
        .ecc_r_x = r.x,
        .ecc_r_y = r.y,

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_x_match = 0,
        .ecc_y_match = 0,

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccDoublingInf)
{
    // Infinity coordinates
    FF p_x("0x183227397098d014dc2822db40c0ac2e9419f4243cdcb848a1f0fac9f8000001");
    FF p_y("0x0000000000000000000000000000000000000000000000000000000000000000");
    AffinePoint p(p_x, p_y);

    // r = O + O = O; , where O is the point at infinity
    AffinePoint r(p_x, p_y);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 0,
        .ecc_double_op = 1,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = FF::zero(),
        .ecc_inv_y_diff = FF::zero(),

        .ecc_lambda = FF::zero(),

        // Point P
        .ecc_p_is_inf = 1,
        .ecc_p_x = p.x,
        .ecc_p_y = p.y,

        // Point Q
        .ecc_q_is_inf = 1,
        .ecc_q_x = p.x,
        .ecc_q_y = p.y,

        // Resulting Point
        .ecc_r_is_inf = 1,
        .ecc_r_x = r.x,
        .ecc_r_y = r.y,

        .ecc_result_infinity = 1,

        .ecc_sel = 1,
        .ecc_x_match = 1,
        .ecc_y_match = 1,

    } });

    check_relation<ecc>(trace);
}

TEST(EccAddConstrainingTest, EccTwoOps)
{
    AffinePoint r1 = p + q;
    AffinePoint r2 = r1 + r1;

    auto trace = TestTraceContainer::from_rows({ {
                                                     .ecc_add_op = 1,
                                                     .ecc_double_op = 0,

                                                     .ecc_inv_2_p_y = FF::zero(),
                                                     .ecc_inv_x_diff = (q.x - p.x).invert(),
                                                     .ecc_inv_y_diff = (q.y - p.y).invert(),

                                                     .ecc_lambda = (q.y - p.y) / (q.x - p.x),

                                                     // Point P
                                                     .ecc_p_is_inf = 0,
                                                     .ecc_p_x = p.x,
                                                     .ecc_p_y = p.y,

                                                     // Point Q
                                                     .ecc_q_is_inf = 0,
                                                     .ecc_q_x = q.x,
                                                     .ecc_q_y = q.y,

                                                     // Resulting Point
                                                     .ecc_r_is_inf = 0,
                                                     .ecc_r_x = r1.x,
                                                     .ecc_r_y = r1.y,

                                                     .ecc_result_infinity = 0,

                                                     .ecc_sel = 1,
                                                     .ecc_x_match = 0,
                                                     .ecc_y_match = 0,

                                                 },
                                                 {
                                                     .ecc_add_op = 0,
                                                     .ecc_double_op = 1,

                                                     .ecc_inv_2_p_y = (r1.y * 2).invert(),
                                                     .ecc_inv_x_diff = FF::zero(),
                                                     .ecc_inv_y_diff = FF::zero(),

                                                     .ecc_lambda = (r1.x * r1.x * 3) / (r1.y * 2),

                                                     // Point P
                                                     .ecc_p_is_inf = 0,
                                                     .ecc_p_x = r1.x,
                                                     .ecc_p_y = r1.y,

                                                     // Point Q set to point p since this is doubling
                                                     .ecc_q_is_inf = 0,
                                                     .ecc_q_x = r1.x,
                                                     .ecc_q_y = r1.y,

                                                     // Resulting Point
                                                     .ecc_r_is_inf = 0,
                                                     .ecc_r_x = r2.x,
                                                     .ecc_r_y = r2.y,

                                                     .ecc_result_infinity = 0,

                                                     .ecc_sel = 1,
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
    AffinePoint r(r_x, r_y);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 1,
        .ecc_double_op = 0,

        .ecc_inv_2_p_y = FF::zero(),
        .ecc_inv_x_diff = (q.x - p.x).invert(),
        .ecc_inv_y_diff = (q.y - p.y).invert(),

        .ecc_lambda = (q.y - p.y) / (q.x - p.x),

        // Point P
        .ecc_p_is_inf = 0,
        .ecc_p_x = p.x,
        .ecc_p_y = p.y,

        // Point Q
        .ecc_q_is_inf = 0,
        .ecc_q_x = q.x,
        .ecc_q_y = q.y,

        // Resulting Point
        .ecc_r_is_inf = 0,
        .ecc_r_x = r.x,
        .ecc_r_y = r.y,

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
    AffinePoint r(r_x, r_y);

    auto trace = TestTraceContainer::from_rows({ {
        .ecc_add_op = 0,
        .ecc_double_op = 1,

        .ecc_inv_2_p_y = (p.y * 2).invert(),
        .ecc_inv_x_diff = FF::zero(),
        .ecc_inv_y_diff = FF::zero(),

        .ecc_lambda = (p.x * p.x * 3) / (p.y * 2),

        // Point P
        .ecc_p_is_inf = 0,
        .ecc_p_x = p.x,
        .ecc_p_y = p.y,

        // Point Q set to point p since this is doubling
        .ecc_q_is_inf = 0,
        .ecc_q_x = p.x,
        .ecc_q_y = p.y,

        // Resulting Point
        .ecc_r_is_inf = 0,
        .ecc_r_x = r.x,
        .ecc_r_y = r.y,

        .ecc_result_infinity = 0,

        .ecc_sel = 1,
        .ecc_x_match = 1,
        .ecc_y_match = 1,

    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<ecc>(trace, ecc::SR_OUTPUT_X_COORD), "OUTPUT_X_COORD");
}

} // namespace
} // namespace bb::avm2::constraining
