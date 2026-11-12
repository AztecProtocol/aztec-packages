#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
template <size_t log_n> void check_matches_serial_draws()
{
    using RecursiveIPA = IPA<stdlib::grumpkin<UltraCircuitBuilder>, log_n>;
    constexpr size_t n = size_t{ 1 } << log_n;
    constexpr uint64_t seed = 0x5eed;

    // Reference: the engine read one bb::fq::random_element at a time, then the next raw draw.
    auto& engine = numeric::get_debug_randomness(/*reset=*/true, seed);
    std::vector<fq> expected_coefficients(n);
    for (auto& coefficient : expected_coefficients) {
        coefficient = fq::random_element(&engine);
    }
    const fq expected_x = fq::random_element(&engine);
    const uint64_t expected_next = engine.get_random_uint64();

    const size_t original_concurrency = get_num_cpus();
    for (const size_t concurrency : { size_t{ 1 }, size_t{ 3 }, size_t{ 16 } }) {
        set_parallel_for_concurrency(concurrency);
        numeric::get_debug_randomness(/*reset=*/true, seed);
        const auto [poly, x] = RecursiveIPA::sample_random_opening(&engine);
        ASSERT_EQ(poly.size(), n);
        for (size_t i = 0; i < n; ++i) {
            ASSERT_EQ(poly[i], expected_coefficients[i]) << "concurrency " << concurrency << ", index " << i;
        }
        EXPECT_EQ(x, expected_x);
        EXPECT_EQ(engine.get_random_uint64(), expected_next) << "engine state after sampling differs";
    }
    set_parallel_for_concurrency(original_concurrency);
}
} // namespace

// The sampled opening must equal the serial random_element draws, in order, at any parallel_for concurrency, and leave
// the engine where the serial draws leave it.
TEST(IPASampleRandomOpening, MatchesSerialDrawsRollupSize)
{
    check_matches_serial_draws<CONST_ECCVM_LOG_N>();
}

TEST(IPASampleRandomOpening, MatchesSerialDrawsBelowOneBlock)
{
    check_matches_serial_draws<3>();
}
