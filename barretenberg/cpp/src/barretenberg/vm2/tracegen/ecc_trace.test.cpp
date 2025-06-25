#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;

TEST(EccTraceGenTest, TraceGenerationAdd)
{
    TestTraceContainer trace;
    EccTraceBuilder builder;

    FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);
    FF q_x("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
    FF q_y("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3");
    EmbeddedCurvePoint q(q_x, q_y, false);
    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    EmbeddedCurvePoint r(r_x, r_y, false);
    builder.process_add({ { .p = p, .q = q, .result = r } }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(ecc_add_op, 1),
                          ROW_FIELD_EQ(ecc_double_op, 0),
                          ROW_FIELD_EQ(ecc_inv_2_p_y, FF::zero()),
                          ROW_FIELD_EQ(ecc_inv_x_diff, (q.x() - p.x()).invert()),
                          ROW_FIELD_EQ(ecc_inv_y_diff, (q.y() - p.y()).invert()),
                          ROW_FIELD_EQ(ecc_lambda, (q.y() - p.y()) / (q.x() - p.x())),
                          ROW_FIELD_EQ(ecc_p_is_inf, p.is_infinity()),
                          ROW_FIELD_EQ(ecc_p_x, p.x()),
                          ROW_FIELD_EQ(ecc_p_y, p.y()),
                          ROW_FIELD_EQ(ecc_q_is_inf, q.is_infinity()),
                          ROW_FIELD_EQ(ecc_q_x, q.x()),
                          ROW_FIELD_EQ(ecc_q_y, q.y()),
                          ROW_FIELD_EQ(ecc_r_is_inf, r.is_infinity()),
                          ROW_FIELD_EQ(ecc_r_x, r.x()),
                          ROW_FIELD_EQ(ecc_r_y, r.y()),
                          ROW_FIELD_EQ(ecc_result_infinity, 0),
                          ROW_FIELD_EQ(ecc_sel, 1),
                          ROW_FIELD_EQ(ecc_x_match, 0),
                          ROW_FIELD_EQ(ecc_y_match, 0))));
}

TEST(EccTraceGenTest, TraceGenerationDouble)
{
    TestTraceContainer trace;
    EccTraceBuilder builder;

    FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);
    EmbeddedCurvePoint q = p;
    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    EmbeddedCurvePoint r(r_x, r_y, false);

    builder.process_add({ { .p = p, .q = q, .result = r } }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(ecc_add_op, 0),
                          ROW_FIELD_EQ(ecc_double_op, 1),
                          ROW_FIELD_EQ(ecc_inv_2_p_y, (p.y() * 2).invert()),
                          ROW_FIELD_EQ(ecc_inv_x_diff, FF::zero()),
                          ROW_FIELD_EQ(ecc_inv_y_diff, FF::zero()),
                          ROW_FIELD_EQ(ecc_lambda, (p.x() * p.x() * 3) / (p.y() * 2)),
                          ROW_FIELD_EQ(ecc_p_is_inf, p.is_infinity()),
                          ROW_FIELD_EQ(ecc_p_x, p.x()),
                          ROW_FIELD_EQ(ecc_p_y, p.y()),
                          ROW_FIELD_EQ(ecc_q_is_inf, q.is_infinity()),
                          ROW_FIELD_EQ(ecc_q_x, p.x()),
                          ROW_FIELD_EQ(ecc_q_y, p.y()),
                          ROW_FIELD_EQ(ecc_r_is_inf, r.is_infinity()),
                          ROW_FIELD_EQ(ecc_r_x, r.x()),
                          ROW_FIELD_EQ(ecc_r_y, r.y()),
                          ROW_FIELD_EQ(ecc_result_infinity, 0),
                          ROW_FIELD_EQ(ecc_sel, 1),
                          ROW_FIELD_EQ(ecc_x_match, 1),
                          ROW_FIELD_EQ(ecc_y_match, 1))));
}

TEST(EccTraceGenTest, TraceGenerationInf)
{
    TestTraceContainer trace;
    EccTraceBuilder builder;

    FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);

    EmbeddedCurvePoint q(p.x(), -p.y(), false);
    EmbeddedCurvePoint r = p + q;

    builder.process_add({ { .p = p, .q = q, .result = r } }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(ecc_add_op, 0),
                          ROW_FIELD_EQ(ecc_double_op, 0),
                          ROW_FIELD_EQ(ecc_inv_2_p_y, 0),
                          ROW_FIELD_EQ(ecc_inv_x_diff, FF::zero()),
                          ROW_FIELD_EQ(ecc_inv_y_diff, (q.y() - p.y()).invert()),
                          ROW_FIELD_EQ(ecc_lambda, 0),
                          ROW_FIELD_EQ(ecc_p_is_inf, p.is_infinity()),
                          ROW_FIELD_EQ(ecc_p_x, p.x()),
                          ROW_FIELD_EQ(ecc_p_y, p.y()),
                          ROW_FIELD_EQ(ecc_q_is_inf, q.is_infinity()),
                          ROW_FIELD_EQ(ecc_q_x, q.x()),
                          ROW_FIELD_EQ(ecc_q_y, q.y()),
                          ROW_FIELD_EQ(ecc_r_is_inf, r.is_infinity()),
                          ROW_FIELD_EQ(ecc_r_x, r.x()),
                          ROW_FIELD_EQ(ecc_r_y, r.y()),
                          ROW_FIELD_EQ(ecc_result_infinity, 1),
                          ROW_FIELD_EQ(ecc_sel, 1),
                          ROW_FIELD_EQ(ecc_x_match, 1),
                          ROW_FIELD_EQ(ecc_y_match, 0))));
}

} // namespace
} // namespace bb::avm2::tracegen
