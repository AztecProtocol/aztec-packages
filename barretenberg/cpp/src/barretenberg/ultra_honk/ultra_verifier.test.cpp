/**
 * @file ultra_verifier.test.cpp
 * @brief Minimalistic tests for UltraVerifier_::process_padding method
 * @details Tests the padding computation logic based on flavor traits.
 */
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"

#include <gtest/gtest.h>

namespace bb {

/**
 * @brief Compute expected padding data based on flavor traits
 * @details Mirrors the logic in UltraVerifier_::process_padding
 */
template <typename Flavor> std::pair<size_t, std::vector<fr>> expected_padding_data(size_t log_circuit_size)
{
    const size_t log_n = Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : log_circuit_size;

    std::vector<fr> padding_array(log_n, fr{ 1 });
    if constexpr (Flavor::HasZK && Flavor::USE_PADDING) {
        for (size_t i = log_circuit_size; i < log_n; ++i) {
            padding_array[i] = fr{ 0 };
        }
    }

    return { log_n, std::move(padding_array) };
}

class ProcessPaddingTest : public ::testing::Test {};

TEST_F(ProcessPaddingTest, NonZKWithPadding)
{
    using Flavor = UltraFlavor;
    static_assert(Flavor::USE_PADDING && !Flavor::HasZK);

    auto [log_n, padding_array] = expected_padding_data<Flavor>(10);

    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);
    for (size_t i = 0; i < log_n; ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 });
    }
}

TEST_F(ProcessPaddingTest, ZKWithPadding)
{
    using Flavor = UltraZKFlavor;
    static_assert(Flavor::USE_PADDING && Flavor::HasZK);

    constexpr size_t log_circuit_size = 10;
    auto [log_n, padding_array] = expected_padding_data<Flavor>(log_circuit_size);

    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);
    for (size_t i = 0; i < log_n; ++i) {
        EXPECT_EQ(padding_array[i], i < log_circuit_size ? fr{ 1 } : fr{ 0 });
    }
}

TEST_F(ProcessPaddingTest, NonZKWithoutPadding)
{
    using Flavor = UltraKeccakFlavor;
    static_assert(!Flavor::USE_PADDING && !Flavor::HasZK);

    constexpr size_t log_circuit_size = 10;
    auto [log_n, padding_array] = expected_padding_data<Flavor>(log_circuit_size);

    EXPECT_EQ(log_n, log_circuit_size);
    for (size_t i = 0; i < log_n; ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 });
    }
}

TEST_F(ProcessPaddingTest, ZKWithoutPadding)
{
    using Flavor = UltraKeccakZKFlavor;
    static_assert(!Flavor::USE_PADDING && Flavor::HasZK);

    constexpr size_t log_circuit_size = 10;
    auto [log_n, padding_array] = expected_padding_data<Flavor>(log_circuit_size);

    EXPECT_EQ(log_n, log_circuit_size);
    for (size_t i = 0; i < log_n; ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 });
    }
}

TEST_F(ProcessPaddingTest, MegaZKWithPadding)
{
    using Flavor = MegaZKFlavor;
    static_assert(Flavor::USE_PADDING && Flavor::HasZK);

    constexpr size_t log_circuit_size = 10;
    auto [log_n, padding_array] = expected_padding_data<Flavor>(log_circuit_size);

    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);
    for (size_t i = 0; i < log_n; ++i) {
        EXPECT_EQ(padding_array[i], i < log_circuit_size ? fr{ 1 } : fr{ 0 });
    }
}

TEST_F(ProcessPaddingTest, RollupFlavor)
{
    using Flavor = UltraRollupFlavor;
    static_assert(Flavor::USE_PADDING && !Flavor::HasZK);

    auto [log_n, padding_array] = expected_padding_data<Flavor>(10);

    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);
    for (size_t i = 0; i < log_n; ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 });
    }
}

TEST_F(ProcessPaddingTest, ZKPaddingBoundaryVariousSizes)
{
    using Flavor = UltraZKFlavor;

    for (size_t log_circuit_size : { 6UL, 10UL, 14UL, 18UL }) {
        auto [log_n, padding_array] = expected_padding_data<Flavor>(log_circuit_size);

        EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);
        for (size_t i = 0; i < log_n; ++i) {
            EXPECT_EQ(padding_array[i], i < log_circuit_size ? fr{ 1 } : fr{ 0 });
        }
    }
}

TEST_F(ProcessPaddingTest, ZKNoPaddingAtBoundary)
{
    using Flavor = UltraZKFlavor;

    auto [log_n, padding_array] = expected_padding_data<Flavor>(Flavor::VIRTUAL_LOG_N);

    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);
    for (size_t i = 0; i < log_n; ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 });
    }
}

} // namespace bb
