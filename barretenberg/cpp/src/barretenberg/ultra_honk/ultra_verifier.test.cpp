/**
 * @file ultra_verifier.test.cpp
 * @brief Tests for UltraVerifier_ methods, particularly process_padding
 */
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

#include <gtest/gtest.h>

namespace bb {

/**
 * @brief Test suite for UltraVerifier_::process_padding method
 * @details Tests the padding computation logic for various flavor configurations:
 * - Non-ZK with padding: log_n = VIRTUAL_LOG_N, all 1s array
 * - ZK with padding: log_n = VIRTUAL_LOG_N, 1s for real rounds, 0s for padding
 * - Non-ZK without padding: log_n = log_circuit_size, all 1s array
 * - ZK without padding: log_n = log_circuit_size, all 1s array
 */
class ProcessPaddingTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Create a circuit with approximately 2^target_log_n gates and add default public inputs
     */
    template <typename Flavor> static typename Flavor::CircuitBuilder create_circuit_with_size(size_t target_log_n)
    {
        using Builder = typename Flavor::CircuitBuilder;
        Builder builder;
        const size_t num_gates = 1 << target_log_n;
        for (size_t i = 0; i < num_gates; ++i) {
            fr a = fr::random_element();
            uint32_t a_idx = builder.add_variable(a);
            fr b = fr::random_element();
            uint32_t b_idx = builder.add_variable(b);
            fr c = a + b;
            uint32_t c_idx = builder.add_variable(c);
            builder.create_big_add_gate({ a_idx, b_idx, c_idx, builder.zero_idx(), 1, 1, -1, 0, 0 });
        }

        // Add default public inputs based on flavor
        if constexpr (HasIPAAccumulator<Flavor>) {
            stdlib::recursion::honk::RollupIO::add_default(builder);
        } else {
            stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);
        }

        return builder;
    }

    /**
     * @brief Helper to create verifier and get padding data
     */
    template <typename Flavor, typename IO>
    static typename UltraVerifier_<Flavor, IO>::PaddingData get_padding_data(size_t target_log_n)
    {
        using ProverInstance = ProverInstance_<Flavor>;
        using VerificationKey = typename Flavor::VerificationKey;
        using VKAndHash = typename Flavor::VKAndHash;
        using Verifier = UltraVerifier_<Flavor, IO>;

        // Create circuit with appropriate public inputs
        auto builder = create_circuit_with_size<Flavor>(target_log_n);

        // Create prover instance and VK
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        auto vk_and_hash = std::make_shared<VKAndHash>(vk);

        // Create verifier and call process_padding
        Verifier verifier(vk_and_hash);
        return verifier.process_padding();
    }
};

/**
 * @brief Test non-ZK flavor with padding (UltraFlavor)
 * @details USE_PADDING = true, HasZK = false
 * Expected: log_n = VIRTUAL_LOG_N, all elements are 1
 */
TEST_F(ProcessPaddingTest, NonZKWithPadding)
{
    using Flavor = UltraFlavor;
    using IO = DefaultIO;

    constexpr size_t target_log_n = 10;
    auto [log_n, padding_array] = get_padding_data<Flavor, IO>(target_log_n);

    // Check log_n equals VIRTUAL_LOG_N (not log_circuit_size)
    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);

    // Check array size matches log_n
    EXPECT_EQ(padding_array.size(), log_n);

    // For non-ZK flavors, all elements should be 1
    for (size_t i = 0; i < padding_array.size(); ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 }) << "Element at index " << i << " should be 1";
    }
}

/**
 * @brief Test ZK flavor with padding (UltraZKFlavor)
 * @details USE_PADDING = true, HasZK = true
 * Expected: log_n = VIRTUAL_LOG_N, 1s for indices < log_circuit_size, 0s otherwise
 */
TEST_F(ProcessPaddingTest, ZKWithPadding)
{
    using Flavor = UltraZKFlavor;
    using IO = DefaultIO;

    constexpr size_t target_log_n = 10;

    // Get the actual log_circuit_size by creating the circuit
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;

    auto builder = create_circuit_with_size<Flavor>(target_log_n);
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    const size_t actual_log_circuit_size = vk->log_circuit_size;

    auto vk_and_hash = std::make_shared<VKAndHash>(vk);
    Verifier verifier(vk_and_hash);
    auto [log_n, padding_array] = verifier.process_padding();

    // Check log_n equals VIRTUAL_LOG_N
    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);

    // Check array size matches log_n
    EXPECT_EQ(padding_array.size(), log_n);

    // For ZK flavors with padding:
    // - Elements at indices < log_circuit_size should be 1
    // - Elements at indices >= log_circuit_size should be 0
    for (size_t i = 0; i < padding_array.size(); ++i) {
        if (i < actual_log_circuit_size) {
            EXPECT_EQ(padding_array[i], fr{ 1 }) << "Element at index " << i << " should be 1 (real round)";
        } else {
            EXPECT_EQ(padding_array[i], fr{ 0 }) << "Element at index " << i << " should be 0 (padded round)";
        }
    }

    // Sanity check: there should be some padding (log_circuit_size < VIRTUAL_LOG_N)
    EXPECT_LT(actual_log_circuit_size, Flavor::VIRTUAL_LOG_N)
        << "Circuit should be smaller than VIRTUAL_LOG_N for this test to be meaningful";
}

/**
 * @brief Test non-ZK flavor without padding (UltraKeccakFlavor)
 * @details USE_PADDING = false, HasZK = false
 * Expected: log_n = log_circuit_size, all elements are 1
 */
TEST_F(ProcessPaddingTest, NonZKWithoutPadding)
{
    using Flavor = UltraKeccakFlavor;
    using IO = DefaultIO;

    constexpr size_t target_log_n = 10;

    // Get the actual log_circuit_size
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;

    auto builder = create_circuit_with_size<Flavor>(target_log_n);
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    const size_t actual_log_circuit_size = vk->log_circuit_size;

    auto vk_and_hash = std::make_shared<VKAndHash>(vk);
    Verifier verifier(vk_and_hash);
    auto [log_n, padding_array] = verifier.process_padding();

    // Check log_n equals log_circuit_size (not VIRTUAL_LOG_N)
    EXPECT_EQ(log_n, actual_log_circuit_size);

    // Check array size matches log_n
    EXPECT_EQ(padding_array.size(), log_n);

    // For non-ZK flavors, all elements should be 1
    for (size_t i = 0; i < padding_array.size(); ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 }) << "Element at index " << i << " should be 1";
    }
}

/**
 * @brief Test ZK flavor without padding (UltraKeccakZKFlavor)
 * @details USE_PADDING = false, HasZK = true
 * Expected: log_n = log_circuit_size, all elements are 1 (no padding region)
 */
TEST_F(ProcessPaddingTest, ZKWithoutPadding)
{
    using Flavor = UltraKeccakZKFlavor;
    using IO = DefaultIO;

    constexpr size_t target_log_n = 10;

    // Get the actual log_circuit_size
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;

    auto builder = create_circuit_with_size<Flavor>(target_log_n);
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    const size_t actual_log_circuit_size = vk->log_circuit_size;

    auto vk_and_hash = std::make_shared<VKAndHash>(vk);
    Verifier verifier(vk_and_hash);
    auto [log_n, padding_array] = verifier.process_padding();

    // Check log_n equals log_circuit_size
    EXPECT_EQ(log_n, actual_log_circuit_size);

    // Check array size matches log_n
    EXPECT_EQ(padding_array.size(), log_n);

    // For ZK without padding, log_n == log_circuit_size, so all elements should be 1
    // (the padding indicator array marks real rounds as 1, and there are no padded rounds)
    for (size_t i = 0; i < padding_array.size(); ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 }) << "Element at index " << i << " should be 1";
    }
}

/**
 * @brief Test MegaZKFlavor (ZK with padding, larger VIRTUAL_LOG_N)
 * @details USE_PADDING = true, HasZK = true, VIRTUAL_LOG_N = HIDING_KERNEL_LOG_N
 */
TEST_F(ProcessPaddingTest, MegaZKWithPadding)
{
    using Flavor = MegaZKFlavor;
    using IO = DefaultIO;

    constexpr size_t target_log_n = 10;

    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;

    auto builder = create_circuit_with_size<Flavor>(target_log_n);
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    const size_t actual_log_circuit_size = vk->log_circuit_size;

    auto vk_and_hash = std::make_shared<VKAndHash>(vk);
    Verifier verifier(vk_and_hash);
    auto [log_n, padding_array] = verifier.process_padding();

    // Check log_n equals VIRTUAL_LOG_N
    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);

    // Check array size matches log_n
    EXPECT_EQ(padding_array.size(), log_n);

    // For ZK flavors with padding, check the pattern
    for (size_t i = 0; i < padding_array.size(); ++i) {
        if (i < actual_log_circuit_size) {
            EXPECT_EQ(padding_array[i], fr{ 1 }) << "Element at index " << i << " should be 1 (real round)";
        } else {
            EXPECT_EQ(padding_array[i], fr{ 0 }) << "Element at index " << i << " should be 0 (padded round)";
        }
    }
}

/**
 * @brief Test Rollup flavor with IPA (ZK-like behavior for padding)
 * @details UltraRollupFlavor has USE_PADDING = true, HasZK = false
 */
TEST_F(ProcessPaddingTest, RollupFlavor)
{
    using Flavor = UltraRollupFlavor;
    using IO = RollupIO;

    constexpr size_t target_log_n = 10;
    auto [log_n, padding_array] = get_padding_data<Flavor, IO>(target_log_n);

    // Check log_n equals VIRTUAL_LOG_N
    EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N);

    // Check array size matches log_n
    EXPECT_EQ(padding_array.size(), log_n);

    // For non-ZK flavors (even with IPA), all elements should be 1
    for (size_t i = 0; i < padding_array.size(); ++i) {
        EXPECT_EQ(padding_array[i], fr{ 1 }) << "Element at index " << i << " should be 1";
    }
}

/**
 * @brief Test with different circuit sizes to verify padding boundary handling
 * @details Creates circuits of various sizes and verifies the padding boundary is correct
 */
TEST_F(ProcessPaddingTest, ZKPaddingBoundaryVariousSizes)
{
    using Flavor = UltraZKFlavor;
    using IO = DefaultIO;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;

    // Test various circuit sizes
    for (size_t target_log_n : { 8UL, 10UL, 12UL, 14UL }) {
        auto builder = create_circuit_with_size<Flavor>(target_log_n);
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        auto vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        const size_t actual_log_circuit_size = vk->log_circuit_size;

        auto vk_and_hash = std::make_shared<VKAndHash>(vk);
        Verifier verifier(vk_and_hash);
        auto [log_n, padding_array] = verifier.process_padding();

        EXPECT_EQ(log_n, Flavor::VIRTUAL_LOG_N) << "log_n should be VIRTUAL_LOG_N for target_log_n=" << target_log_n;

        // Count 1s and 0s
        size_t count_ones = 0;
        size_t count_zeros = 0;
        for (const auto& elem : padding_array) {
            if (elem == fr{ 1 }) {
                count_ones++;
            } else if (elem == fr{ 0 }) {
                count_zeros++;
            }
        }

        EXPECT_EQ(count_ones, actual_log_circuit_size)
            << "Number of 1s should equal log_circuit_size for target_log_n=" << target_log_n;
        EXPECT_EQ(count_zeros, log_n - actual_log_circuit_size)
            << "Number of 0s should equal padding size for target_log_n=" << target_log_n;
    }
}

} // namespace bb
