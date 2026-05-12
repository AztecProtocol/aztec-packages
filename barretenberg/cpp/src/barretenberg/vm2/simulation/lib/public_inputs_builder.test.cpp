#include "barretenberg/vm2/simulation/lib/public_inputs_builder.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::NiceMock;

TrackedSideEffects make_distinct_storage_writes(size_t n)
{
    TrackedSideEffects side_effects;
    for (size_t i = 0; i < n; ++i) {
        // Offset by 1 so the protocol fee write at the end (i = n - 1 in the 64-entry case)
        // doesn't collide with slot 0.
        const FF slot = FF(static_cast<uint64_t>(i + 1));
        const FF value = FF(static_cast<uint64_t>(i + 1) * 100);
        side_effects.storage_writes_slots_by_insertion.push_back(slot);
        side_effects.storage_writes_slot_to_value.emplace(slot, value);
    }
    return side_effects;
}

// 63 distinct user SSTOREs — exercises the documented per-tx user budget
// (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX). extract_outputs must accept this.
TEST(PublicInputsBuilderExtractOutputsTest, AcceptsUserWriteBudget)
{
    static_assert(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX == 63);

    NiceMock<MockLowLevelMerkleDB> merkle_db;
    const auto side_effects = make_distinct_storage_writes(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
    ASSERT_EQ(side_effects.storage_writes_slot_to_value.size(), 63u);

    PublicInputsBuilder builder;
    EXPECT_NO_THROW(builder.extract_outputs(merkle_db,
                                            /*end_gas_used=*/Gas{},
                                            /*transaction_fee=*/FF(0),
                                            /*reverted=*/false,
                                            side_effects));

    const PublicInputs public_inputs = builder.build();
    EXPECT_EQ(public_inputs.accumulated_data_array_lengths.public_data_writes, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
}

// 64 distinct writes — the documented user budget (63) plus a single protocol fee write,
// matching MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX. The AvmAccumulatedData layout,
// the Noir TxEffect and the rollup blob bounds all reserve a slot for this 64th entry,
// so extract_outputs should accept it. Today it rejects with
// "Too many side effects ... Storage writes: 64".
TEST(PublicInputsBuilderExtractOutputsTest, RejectsValidTotalWriteBudget)
{
    static_assert(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX == MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1);

    NiceMock<MockLowLevelMerkleDB> merkle_db;
    const auto side_effects = make_distinct_storage_writes(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
    ASSERT_EQ(side_effects.storage_writes_slot_to_value.size(), 64u);

    PublicInputsBuilder builder;
    EXPECT_NO_THROW(builder.extract_outputs(merkle_db,
                                            /*end_gas_used=*/Gas{},
                                            /*transaction_fee=*/FF(0),
                                            /*reverted=*/false,
                                            side_effects))
        << "extract_outputs should accept 64 distinct public-data writes (63 user + 1 protocol fee), "
        << "matching MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX and the AvmAccumulatedData layout.";
}

} // namespace
} // namespace bb::avm2::simulation
