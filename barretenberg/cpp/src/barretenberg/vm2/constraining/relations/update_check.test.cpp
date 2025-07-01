#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_update_check.hpp"
#include "barretenberg/vm2/generated/relations/update_check.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/events/update_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/update_check_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::TestWithParam;

using simulation::PublicDataTreeLeafPreimage;
using simulation::UpdateCheckEvent;

using tracegen::TestTraceContainer;
using tracegen::UpdateCheckTraceBuilder;

using FF = AvmFlavorSettings::FF;
using C = Column;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

using update_check_relation = bb::avm2::update_check<FF>;

TEST(UpdateCheckConstrainingTest, EmptyRow)
{
    check_relation<update_check_relation>(testing::empty_trace());
}

UpdateCheckEvent never_written = {
    .address = 0xdeadbeef,
    .current_class_id = 1,
    .original_class_id = 1,
    .current_timestamp = 100,
};

UpdateCheckEvent never_updated = {
    .address = 0xdeadbeef,
    .current_class_id = 1,
    .original_class_id = 1,
    .current_timestamp = 100,
    .update_hash = 27,
};

UpdateCheckEvent update_from_original_next_timestamp = {
    .address = 0xdeadbeef,
    .current_class_id = 1,
    .original_class_id = 1,
    .current_timestamp = 100,
    .update_hash = 27,
    .update_preimage_metadata = FF(static_cast<uint64_t>(1234) << 32) + 101,
    .update_preimage_pre_class_id = 0,
    .update_preimage_post_class_id = 2,
};

UpdateCheckEvent update_next_timestamp = {
    .address = 0xdeadbeef,
    .current_class_id = 2,
    .original_class_id = 1,
    .current_timestamp = 100,
    .update_hash = 27,
    .update_preimage_metadata = FF(static_cast<uint64_t>(1234) << 32) + 101,
    .update_preimage_pre_class_id = 2,
    .update_preimage_post_class_id = 3,
};

UpdateCheckEvent update_previous_timestamp = {
    .address = 0xdeadbeef,
    .current_class_id = 3,
    .original_class_id = 1,
    .current_timestamp = 100,
    .update_hash = 27,
    .update_preimage_metadata = FF(static_cast<uint64_t>(1234) << 32) + 99,
    .update_preimage_pre_class_id = 2,
    .update_preimage_post_class_id = 3,
};

UpdateCheckEvent update_timestamp = {
    .address = 0xdeadbeef,
    .current_class_id = 3,
    .original_class_id = 1,
    .current_timestamp = 100,
    .update_hash = 27,
    .update_preimage_metadata = FF(static_cast<uint64_t>(1234) << 32) + 100,
    .update_preimage_pre_class_id = 2,
    .update_preimage_post_class_id = 3,
};

std::vector<UpdateCheckEvent> positive_tests = {
    never_written,
    never_updated,
    update_from_original_next_timestamp,
    update_next_timestamp,
    update_previous_timestamp,
    update_timestamp,
};

class UpdateCheckPositiveConstrainingTest : public TestWithParam<UpdateCheckEvent> {};

TEST_P(UpdateCheckPositiveConstrainingTest, PositiveTest)
{
    const auto& event = GetParam();
    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    UpdateCheckTraceBuilder update_check_builder;
    update_check_builder.process({ event }, trace);
    check_relation<update_check_relation>(trace);
}

INSTANTIATE_TEST_SUITE_P(UpdateCheckConstrainingTest,
                         UpdateCheckPositiveConstrainingTest,
                         ::testing::ValuesIn(positive_tests));

TEST(UpdateCheckConstrainingTest, HashIsZeroCheck)
{
    // sel * (update_hash * ((1 - hash_not_zero) * (1 - update_hash_inv) + update_hash_inv) - 1 + (1 - hash_not_zero))
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::update_check_sel, 1 },
            { C::update_check_update_hash, 27 },
            { C::update_check_hash_not_zero, 1 },
            { C::update_check_update_hash_inv, FF(27).invert() },
        },
    });

    check_relation<update_check_relation>(trace, update_check_relation::SR_HASH_IS_ZERO_CHECK);

    // Negative test - disable not zero
    trace.set(C::update_check_hash_not_zero, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<update_check_relation>(trace, update_check_relation::SR_HASH_IS_ZERO_CHECK),
        "HASH_IS_ZERO_CHECK");
}

TEST(UpdateCheckConstrainingTest, NeverUpdatedCheck)
{
    // (1 - hash_not_zero) * (current_class_id - original_class_id)
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::update_check_hash_not_zero, 0 },
            { C::update_check_current_class_id, 1 },
            { C::update_check_original_class_id, 1 },
        },
    });

    check_relation<update_check_relation>(trace, update_check_relation::SR_NEVER_UPDATED_CHECK);

    // Negative test - different class id
    trace.set(C::update_check_current_class_id, 0, 2);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<update_check_relation>(trace, update_check_relation::SR_NEVER_UPDATED_CHECK),
        "NEVER_UPDATED_CHECK");
}

TEST(UpdateCheckConstrainingTest, UpdateMetadataDecomposition)
{
    // update_hi_metadata * TWO_POW_32 + timestamp_of_change - update_preimage_metadata
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::update_check_hash_not_zero, 1 },
            { C::update_check_update_hi_metadata, 1234 },
            { C::update_check_timestamp_of_change, 101 },
            { C::update_check_update_preimage_metadata, FF(static_cast<uint64_t>(1234) << 32) + 101 },
        },
    });

    check_relation<update_check_relation>(trace, update_check_relation::SR_UPDATE_METADATA_DECOMPOSITION);

    // Negative test - manipulate timestamp of change
    trace.set(C::update_check_timestamp_of_change, 0, 102);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<update_check_relation>(trace, update_check_relation::SR_UPDATE_METADATA_DECOMPOSITION),
        "UPDATE_METADATA_DECOMPOSITION");
}

TEST(UpdateCheckConstrainingTest, UpdatePreClassIsZero)
{
    // hash_not_zero * (update_preimage_pre_class_id * (update_pre_class_id_is_zero * (1 - update_pre_class_inv) +
    // update_pre_class_inv) - 1 + update_pre_class_id_is_zero)
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::update_check_hash_not_zero, 1 },
            { C::update_check_update_preimage_pre_class_id, 27 },
            { C::update_check_update_pre_class_id_is_zero, 0 },
            { C::update_check_update_pre_class_inv, FF(27).invert() },
        },
    });

    check_relation<update_check_relation>(trace, update_check_relation::SR_UPDATE_PRE_CLASS_IS_ZERO);

    // Negative test - Lie about it being zero
    trace.set(C::update_check_update_pre_class_id_is_zero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<update_check_relation>(trace, update_check_relation::SR_UPDATE_PRE_CLASS_IS_ZERO),
        "UPDATE_PRE_CLASS_IS_ZERO");
}

TEST(UpdateCheckConstrainingTest, UpdatePostClassIsZero)
{
    // hash_not_zero * (update_preimage_post_class_id * (update_post_class_id_is_zero * (1 - update_post_class_inv) +
    // update_post_class_inv) - 1 + update_post_class_id_is_zero)
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::update_check_hash_not_zero, 1 },
            { C::update_check_update_preimage_post_class_id, 27 },
            { C::update_check_update_post_class_id_is_zero, 0 },
            { C::update_check_update_post_class_inv, FF(27).invert() },
        },
    });

    check_relation<update_check_relation>(trace, update_check_relation::SR_UPDATE_POST_CLASS_IS_ZERO);

    // Negative test - Lie about it being zero
    trace.set(C::update_check_update_post_class_id_is_zero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<update_check_relation>(trace, update_check_relation::SR_UPDATE_POST_CLASS_IS_ZERO),
        "UPDATE_POST_CLASS_IS_ZERO");
}

TEST(UpdateCheckConstrainingTest, FutureUpdateClassIdAssignment)
{
    // hash_not_zero * timestamp_is_lt_timestamp_of_change * (original_class_id * update_pre_class_id_is_zero +
    // update_preimage_pre_class_id - current_class_id)
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::update_check_hash_not_zero, 1 },
            { C::update_check_timestamp_is_lt_timestamp_of_change, 1 },
            { C::update_check_original_class_id, 42 },
            { C::update_check_update_preimage_pre_class_id, 27 },
            { C::update_check_update_pre_class_id_is_zero, 0 },
            { C::update_check_current_class_id, 27 },
        },
    });

    check_relation<update_check_relation>(trace, update_check_relation::SR_FUTURE_UPDATE_CLASS_ID_ASSIGNMENT);

    // Negative test - should use original class id
    trace.set(C::update_check_update_pre_class_id_is_zero, 0, 1);
    trace.set(C::update_check_update_preimage_pre_class_id, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<update_check_relation>(trace, update_check_relation::SR_FUTURE_UPDATE_CLASS_ID_ASSIGNMENT),
        "FUTURE_UPDATE_CLASS_ID_ASSIGNMENT");

    // Fix - should use original class id
    trace.set(C::update_check_current_class_id, 0, 42);
    check_relation<update_check_relation>(trace, update_check_relation::SR_FUTURE_UPDATE_CLASS_ID_ASSIGNMENT);
}

TEST(UpdateCheckConstrainingTest, PastUpdateClassIdAssignment)
{
    // hash_not_zero * (1 - timestamp_is_lt_timestamp_of_change) * (original_class_id * update_post_class_id_is_zero +
    // update_preimage_post_class_id - current_class_id)

    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::update_check_hash_not_zero, 1 },
            { C::update_check_timestamp_is_lt_timestamp_of_change, 0 },
            { C::update_check_original_class_id, 42 },
            { C::update_check_update_preimage_post_class_id, 27 },
            { C::update_check_update_post_class_id_is_zero, 0 },
            { C::update_check_current_class_id, 27 },
        },
    });

    check_relation<update_check_relation>(trace, update_check_relation::SR_PAST_UPDATE_CLASS_ID_ASSIGNMENT);

    // Negative test - should use original class id
    trace.set(C::update_check_update_post_class_id_is_zero, 0, 1);
    trace.set(C::update_check_update_preimage_post_class_id, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<update_check_relation>(trace, update_check_relation::SR_PAST_UPDATE_CLASS_ID_ASSIGNMENT),
        "PAST_UPDATE_CLASS_ID_ASSIGNMENT");

    // Fix - should use original class id
    trace.set(C::update_check_current_class_id, 0, 42);
    check_relation<update_check_relation>(trace, update_check_relation::SR_PAST_UPDATE_CLASS_ID_ASSIGNMENT);
}

} // namespace
} // namespace bb::avm2::constraining
