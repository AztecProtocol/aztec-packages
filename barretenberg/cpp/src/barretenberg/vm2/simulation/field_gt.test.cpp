#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::NiceMock;
using ::testing::SizeIs;

namespace {

TEST(AvmSimulationFieldGreaterThanTest, Basic)
{
    NiceMock<MockRangeCheck> range_check;

    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt(range_check, event_emitter);

    auto p_limbs = decompose(FF::modulus);
    std::vector<uint128_t> range_checks;
    ON_CALL(range_check, assert_range(_, 128)).WillByDefault([&range_checks](uint128_t x, uint64_t) {
        range_checks.push_back(x);
    });
    FF a = 1;
    FF b = 0;
    EXPECT_TRUE(field_gt.ff_gt(a, b));

    uint128_t a_lo = 1;
    uint128_t a_hi = 0;

    uint128_t p_sub_a_witness_lo = p_limbs.lo - a_lo - 1;
    uint128_t p_sub_a_witness_hi = p_limbs.hi - a_hi - 0;

    uint128_t b_lo = 0;
    uint128_t b_hi = 0;

    uint128_t p_sub_b_witness_lo = p_limbs.lo - b_lo - 1;
    uint128_t p_sub_b_witness_hi = p_limbs.hi - b_hi - 0;

    uint128_t res_witness_lo = a_lo - b_lo - 1;
    uint128_t res_witness_hi = a_hi - b_hi - 0;

    EXPECT_THAT(range_checks,
                ElementsAre(a_lo,
                            a_hi,
                            p_sub_a_witness_lo,
                            p_sub_a_witness_hi,
                            b_lo,
                            b_hi,
                            p_sub_b_witness_lo,
                            p_sub_b_witness_hi,
                            res_witness_lo,
                            res_witness_hi));

    EXPECT_THAT(event_emitter.dump_events(),
                ElementsAre(FieldGreaterThanEvent{
                    .a = a,
                    .b = b,
                    .a_limbs = U256Decomposition{ a_lo, a_hi },
                    .p_sub_a_witness = LimbsComparisonWitness{ p_sub_a_witness_lo, p_sub_a_witness_hi, false },
                    .b_limbs = U256Decomposition{ b_lo, b_hi },
                    .p_sub_b_witness = LimbsComparisonWitness{ p_sub_b_witness_lo, p_sub_b_witness_hi, false },
                    .res_witness = LimbsComparisonWitness{ res_witness_lo, res_witness_hi, false },
                    .result = true,
                }));
}

TEST(AvmSimulationFieldGreaterThanTest, Results)
{
    NiceMock<MockRangeCheck> range_check;

    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt(range_check, event_emitter);

    EXPECT_TRUE(field_gt.ff_gt(1, 0));
    EXPECT_TRUE(field_gt.ff_gt(-1, 0));

    EXPECT_FALSE(field_gt.ff_gt(0, 0));
    EXPECT_FALSE(field_gt.ff_gt(-1, -1));
    EXPECT_FALSE(field_gt.ff_gt(0, 1));
    EXPECT_FALSE(field_gt.ff_gt(0, -1));

    EXPECT_THAT(event_emitter.dump_events(), SizeIs(6));
}

} // namespace
} // namespace bb::avm2::simulation
