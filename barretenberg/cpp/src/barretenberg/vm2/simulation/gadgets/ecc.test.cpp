#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <stdexcept>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_to_radix.hpp"

using ::testing::AllOf;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::SizeIs;
using ::testing::StrictMock;

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationEccTest, Add)
{
    EventEmitter<EccAddEvent> ecc_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockToRadix> to_radix;

    Ecc ecc(
        execution_id_manager, gt, to_radix, ecc_event_emitter, scalar_mul_event_emitter, ecc_add_memory_event_emitter);

    FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);

    FF q_x("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
    FF q_y("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3");
    EmbeddedCurvePoint q(q_x, q_y, false);

    EmbeddedCurvePoint result = ecc.add(p, q);

    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");

    EXPECT_EQ(result.x(), r_x);
    EXPECT_EQ(result.y(), r_y);
    EXPECT_EQ(result.is_infinity(), 0);

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
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockToRadix> to_radix;

    Ecc ecc(
        execution_id_manager, gt, to_radix, ecc_event_emitter, scalar_mul_event_emitter, ecc_add_memory_event_emitter);

    FF scalar("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
    uint256_t scalar_num = scalar;
    std::vector<bool> bits(254, false);
    for (size_t i = 0; i < 254; ++i) {
        bits[i] = scalar_num.get_bit(i);
    }

    EXPECT_CALL(to_radix, to_le_bits(scalar, 254)).WillOnce(Return(std::make_pair(bits, false)));

    FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);

    EmbeddedCurvePoint result = ecc.scalar_mul(p, scalar);

    EmbeddedCurvePoint expected_result = p * Fq(scalar);

    EXPECT_EQ(result, expected_result);

    std::vector<ScalarMulIntermediateState> intermediate_states;
    intermediate_states.reserve(254);

    EmbeddedCurvePoint res = EmbeddedCurvePoint::infinity();
    EmbeddedCurvePoint temp = p;
    uint256_t scalar_value = scalar;

    for (size_t i = 0; i < 254; ++i) {
        bool bit = scalar_value.get_bit(i);
        if (bit) {
            res = res + temp;
        }
        intermediate_states.push_back({ res, temp, bit });
        temp = temp + temp;
    }

    auto events = scalar_mul_event_emitter.dump_events();
    EXPECT_THAT(events, AllOf(ElementsAre(ScalarMulEvent{ p, scalar, intermediate_states, result }), SizeIs(1)));
}

// This is a death test, should be run in single-threaded context
TEST(AvmSimulationEccDeathTest, ScalarMulNotOnCurve)
{
    EventEmitter<EccAddEvent> ecc_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockToRadix> to_radix;

    Ecc ecc(
        execution_id_manager, gt, to_radix, ecc_event_emitter, scalar_mul_event_emitter, ecc_add_memory_event_emitter);

    // Point P is not on the curve
    FF p_x("0x0000000000063d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x00000000000c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);

    FF scalar("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");

    // prints: Point must be on the curve for scalar multiplication
    ASSERT_THROW(ecc.scalar_mul(p, scalar), std::runtime_error);
}

TEST(AvmSimulationEccTest, AddWithMemory)
{
    EventEmitter<EccAddEvent> ecc_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockToRadix> to_radix;
    MemoryStore memory;

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));
    EXPECT_CALL(gt, gt(0x1000 + 2, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(false));

    Ecc ecc(
        execution_id_manager, gt, to_radix, ecc_event_emitter, scalar_mul_event_emitter, ecc_add_memory_event_emitter);

    FF p_x("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);

    FF q_x("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
    FF q_y("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3");
    EmbeddedCurvePoint q(q_x, q_y, false);

    FF r_x("0x2b01df0ef6d941a826bea23bece8243cbcdc159d5e97fbaa2171f028e05ba9b6");
    FF r_y("0x0cc4c71e882bc62b7b3d1964a8540cb5211339dfcddd2e095fd444bf1aed4f09");
    EmbeddedCurvePoint expected_result(r_x, r_y, false);

    uint32_t dst_address = 0x1000;
    ecc.add(memory, p, q, dst_address);

    EmbeddedCurvePoint result = { memory.get(dst_address).as_ff(),
                                  memory.get(dst_address + 1).as_ff(),
                                  static_cast<bool>(memory.get(dst_address + 2).as_ff()) };
    EXPECT_EQ(result, expected_result);
}

TEST(AvmSimulationEccTest, AddNotOnCurve)
{
    EventEmitter<EccAddEvent> ecc_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockToRadix> to_radix;
    MemoryStore memory;

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));
    EXPECT_CALL(gt, gt(0x1000 + 2, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(false));

    Ecc ecc(
        execution_id_manager, gt, to_radix, ecc_event_emitter, scalar_mul_event_emitter, ecc_add_memory_event_emitter);

    // Point P is not on the curve
    FF p_x("0x0000000000063d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a");
    FF p_y("0x00000000000c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60");
    EmbeddedCurvePoint p(p_x, p_y, false);

    // Point Q is on the curve
    FF q_x("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
    FF q_y("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3");
    EmbeddedCurvePoint q(q_x, q_y, false);

    uint32_t dst_address = 0x1000;
    EXPECT_THROW(ecc.add(memory, p, q, dst_address), EccException);
}

TEST(AvmSimulationEccTest, InfinityOnCurve)
{
    EventEmitter<EccAddEvent> ecc_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockToRadix> to_radix;
    MemoryStore memory;

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));
    EXPECT_CALL(gt, gt(0x1000 + 2, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(false));

    Ecc ecc(
        execution_id_manager, gt, to_radix, ecc_event_emitter, scalar_mul_event_emitter, ecc_add_memory_event_emitter);

    // Point P is not on the curve
    EmbeddedCurvePoint p = EmbeddedCurvePoint::infinity();

    // Point Q is on the curve
    FF q_x("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7");
    FF q_y("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3");
    EmbeddedCurvePoint q(q_x, q_y, false);

    uint32_t dst_address = 0x1000;
    ecc.add(memory, p, q, dst_address);

    EmbeddedCurvePoint result = { memory.get(dst_address).as_ff(),
                                  memory.get(dst_address + 1).as_ff(),
                                  static_cast<bool>(memory.get(dst_address + 2).as_ff()) };
    // INF + Q = Q
    EXPECT_EQ(result, q);
}

} // namespace
} // namespace bb::avm2::simulation
