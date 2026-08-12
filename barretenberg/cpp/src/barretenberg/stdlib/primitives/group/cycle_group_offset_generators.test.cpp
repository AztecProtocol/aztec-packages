#include "cycle_group_offset_generators.hpp"

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include <atomic>
#include <gtest/gtest.h>
#include <thread>
#include <vector>

namespace bb::stdlib {

using OffsetGenerators = cycle_group_offset_generators<curve::Grumpkin>;

TEST(CycleGroupOffsetGenerators, MatchesDerivation)
{
    constexpr size_t num_generators = 40;
    const auto expected =
        grumpkin::g1::derive_generators(OffsetGenerators::DOMAIN_SEPARATOR, num_generators, /*starting_index=*/0);

    const auto generators = OffsetGenerators::default_generators().get(num_generators);

    ASSERT_EQ(generators.size(), num_generators);
    for (size_t i = 0; i < num_generators; ++i) {
        EXPECT_EQ(generators[i], expected[i]);
    }
}

// Circuits embed these points, so a count-dependent value would silently move verification keys.
TEST(CycleGroupOffsetGenerators, PrefixIsStableAcrossRequestSizes)
{
    const OffsetGenerators generators;

    const auto small = generators.get(4);
    const auto large = generators.get(200);

    ASSERT_GE(large.size(), small.size());
    for (size_t i = 0; i < small.size(); ++i) {
        EXPECT_EQ(small[i], large[i]);
    }
}

TEST(CycleGroupOffsetGenerators, GetKeepsPreviouslyReturnedGeneratorsValid)
{
    using AffineElement = curve::Grumpkin::AffineElement;
    constexpr size_t first_count = 16;

    const auto expected =
        grumpkin::g1::derive_generators(OffsetGenerators::DOMAIN_SEPARATOR, first_count, /*starting_index=*/0);

    const OffsetGenerators generators;
    const auto first = generators.get(first_count);
    const auto second = generators.get(4096);
    ASSERT_EQ(second.size(), 4096U);

    // Claim the freed sizes back, otherwise a stale span reads its own old contents and passes. Blocks double, so
    // the size that would have been released is not known here.
    std::vector<std::vector<uint8_t>> reclaimed;
    for (size_t bytes = sizeof(AffineElement); bytes <= 4096 * sizeof(AffineElement); bytes *= 2) {
        reclaimed.emplace_back(bytes, 0xff);
    }

    for (size_t i = 0; i < first_count; ++i) {
        EXPECT_EQ(first[i], expected[i]);
    }
}

// Verification keys for several circuits are derived on concurrent threads, each building MSMs.
TEST(CycleGroupOffsetGenerators, ConcurrentGetReturnsOnCurvePoints)
{
    constexpr size_t num_threads = 8;
    constexpr size_t num_rounds = 64;
    constexpr size_t MIN_REQUEST = 8;
    constexpr size_t STRIDE = 24;

    std::atomic<size_t> off_curve{ 0 };

    for (size_t round = 0; round < num_rounds && off_curve.load() == 0; ++round) {
        // A store only grows, so its growth path is live only while it is filling up.
        const OffsetGenerators generators;
        std::atomic<size_t> ready{ 0 };
        std::vector<std::thread> threads;
        threads.reserve(num_threads);

        for (size_t t = 0; t < num_threads; ++t) {
            threads.emplace_back([&, t]() {
                ready++;
                while (ready.load() < num_threads) {
                }

                // Staggered sizes, so whoever runs second grows the store while the first is reading.
                const auto offset_generators = generators.get(MIN_REQUEST + t * STRIDE);
                for (size_t i = 0; i < 50; ++i) {
                    for (const auto& generator : offset_generators) {
                        if (!generator.on_curve()) {
                            off_curve++;
                        }
                    }
                }
            });
        }
        for (auto& thread : threads) {
            thread.join();
        }
    }

    EXPECT_EQ(off_curve.load(), 0U);
}

} // namespace bb::stdlib
