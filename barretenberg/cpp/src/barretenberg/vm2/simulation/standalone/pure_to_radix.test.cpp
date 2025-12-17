#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/to_radix.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_to_radix.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"

using ::testing::Return;
using ::testing::StrictMock;

namespace bb::avm2::simulation {
namespace {

class PureToRadixComparisonTest : public ::testing::Test {
  protected:
    // Create the gadget version with all its dependencies
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    PureGreaterThan gt;

    // Both versions
    PureToRadix pure_to_radix;
    std::unique_ptr<ToRadix> gadget_to_radix;

    void SetUp() override
    {
        gadget_to_radix =
            std::make_unique<ToRadix>(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);
    }
};

// Test that pure and gadget versions produce identical results for to_le_radix
TEST_F(PureToRadixComparisonTest, ToLeRadixMatchesGadgetForRandomInputs)
{
    // Test various radixes including power-of-2 (optimized path) and non-power-of-2
    std::vector<uint32_t> radixes = { 2, 4, 8, 16, 32, 64, 128, 256, 3, 5, 7, 10, 100 };
    std::vector<uint32_t> num_limbs_values = { 1, 8, 32, 64, 128, 256 };

    for (uint32_t radix : radixes) {
        for (uint32_t num_limbs : num_limbs_values) {
            // Test with multiple random values
            for (int i = 0; i < 10; i++) {
                FF value = FF::random_element();

                auto [pure_limbs, pure_truncated] = pure_to_radix.to_le_radix(value, num_limbs, radix);
                auto [gadget_limbs, gadget_truncated] = gadget_to_radix->to_le_radix(value, num_limbs, radix);

                EXPECT_EQ(pure_limbs, gadget_limbs)
                    << "Mismatch for radix=" << radix << ", num_limbs=" << num_limbs << ", iteration=" << i;
                EXPECT_EQ(pure_truncated, gadget_truncated)
                    << "Truncation mismatch for radix=" << radix << ", num_limbs=" << num_limbs << ", iteration=" << i;
            }
        }
    }
}

// Test that pure and gadget versions produce identical results for to_le_bits
TEST_F(PureToRadixComparisonTest, ToLeBitsMatchesGadgetForRandomInputs)
{
    std::vector<uint32_t> num_limbs_values = { 1, 8, 32, 64, 128, 254, 256 };

    for (uint32_t num_limbs : num_limbs_values) {
        for (int i = 0; i < 10; i++) {
            FF value = FF::random_element();

            auto [pure_bits, pure_truncated] = pure_to_radix.to_le_bits(value, num_limbs);
            auto [gadget_bits, gadget_truncated] = gadget_to_radix->to_le_bits(value, num_limbs);

            EXPECT_EQ(pure_bits, gadget_bits) << "Mismatch for num_limbs=" << num_limbs << ", iteration=" << i;
            EXPECT_EQ(pure_truncated, gadget_truncated)
                << "Truncation mismatch for num_limbs=" << num_limbs << ", iteration=" << i;
        }
    }
}

// Test edge cases: zero value
TEST_F(PureToRadixComparisonTest, ZeroValueMatchesGadget)
{
    FF zero = FF::zero();

    for (uint32_t radix : { 2U, 10U, 256U }) {
        for (uint32_t num_limbs : { 1U, 32U, 256U }) {
            auto [pure_limbs, pure_truncated] = pure_to_radix.to_le_radix(zero, num_limbs, radix);
            auto [gadget_limbs, gadget_truncated] = gadget_to_radix->to_le_radix(zero, num_limbs, radix);

            EXPECT_EQ(pure_limbs, gadget_limbs);
            EXPECT_EQ(pure_truncated, gadget_truncated);
            EXPECT_FALSE(pure_truncated); // Zero should never truncate
        }
    }
}

// Test edge cases: one value
TEST_F(PureToRadixComparisonTest, OneValueMatchesGadget)
{
    FF one = FF::one();

    for (uint32_t radix : { 2U, 10U, 256U }) {
        for (uint32_t num_limbs : { 1U, 32U, 256U }) {
            auto [pure_limbs, pure_truncated] = pure_to_radix.to_le_radix(one, num_limbs, radix);
            auto [gadget_limbs, gadget_truncated] = gadget_to_radix->to_le_radix(one, num_limbs, radix);

            EXPECT_EQ(pure_limbs, gadget_limbs);
            EXPECT_EQ(pure_truncated, gadget_truncated);
        }
    }
}

// Test edge cases: p - 1 (maximum field element)
TEST_F(PureToRadixComparisonTest, MaxFieldElementMatchesGadget)
{
    FF max_val = FF::neg_one(); // p - 1

    for (uint32_t radix : { 2U, 10U, 256U }) {
        for (uint32_t num_limbs : { 1U, 32U, 254U, 256U }) {
            auto [pure_limbs, pure_truncated] = pure_to_radix.to_le_radix(max_val, num_limbs, radix);
            auto [gadget_limbs, gadget_truncated] = gadget_to_radix->to_le_radix(max_val, num_limbs, radix);

            EXPECT_EQ(pure_limbs, gadget_limbs)
                << "Mismatch for max value with radix=" << radix << ", num_limbs=" << num_limbs;
            EXPECT_EQ(pure_truncated, gadget_truncated)
                << "Truncation mismatch for max value with radix=" << radix << ", num_limbs=" << num_limbs;
        }
    }
}

// Test that reconstruction from limbs gives original value (when not truncated)
TEST_F(PureToRadixComparisonTest, ReconstructionMatchesOriginal)
{
    std::vector<uint32_t> radixes = { 2U, 16U, 256U };

    for (uint32_t radix : radixes) {
        for (int i = 0; i < 20; i++) {
            FF value = FF::random_element();

            // Use enough limbs to avoid truncation (256 bits / log2(radix) bits per limb)
            uint32_t num_limbs = (radix == 2) ? 256 : (radix == 16) ? 64 : 32;

            auto [limbs, truncated] = pure_to_radix.to_le_radix(value, num_limbs, radix);

            if (!truncated) {
                // Reconstruct the value
                uint256_t reconstructed = 0;
                uint256_t radix_power = 1;
                for (uint8_t limb : limbs) {
                    reconstructed = reconstructed + radix_power * limb;
                    radix_power = radix_power * radix;
                }

                EXPECT_EQ(FF(reconstructed), value) << "Reconstruction failed for radix=" << radix;
            }
        }
    }
}

// Test zero num_limbs edge case
TEST_F(PureToRadixComparisonTest, ZeroNumLimbsMatchesGadget)
{
    FF zero = FF::zero();
    FF one = FF::one();

    for (uint32_t radix : { 2U, 10U, 256U }) {
        // Zero value with zero limbs should work
        auto [pure_limbs_zero, pure_truncated_zero] = pure_to_radix.to_le_radix(zero, 0, radix);
        auto [gadget_limbs_zero, gadget_truncated_zero] = gadget_to_radix->to_le_radix(zero, 0, radix);

        EXPECT_EQ(pure_limbs_zero, gadget_limbs_zero);
        EXPECT_EQ(pure_truncated_zero, gadget_truncated_zero);
        EXPECT_TRUE(pure_limbs_zero.empty());
        EXPECT_FALSE(pure_truncated_zero);

        // Non-zero value with zero limbs should indicate truncation
        auto [pure_limbs_one, pure_truncated_one] = pure_to_radix.to_le_radix(one, 0, radix);
        auto [gadget_limbs_one, gadget_truncated_one] = gadget_to_radix->to_le_radix(one, 0, radix);

        EXPECT_EQ(pure_limbs_one, gadget_limbs_one);
        EXPECT_EQ(pure_truncated_one, gadget_truncated_one);
        EXPECT_TRUE(pure_limbs_one.empty());
        EXPECT_TRUE(pure_truncated_one);
    }
}

} // namespace
} // namespace bb::avm2::simulation
