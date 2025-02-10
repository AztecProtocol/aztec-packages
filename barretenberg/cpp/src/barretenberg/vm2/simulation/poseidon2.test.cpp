#include "barretenberg/vm2/simulation/poseidon2.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationPoseidon2Test, Hash)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    // Taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    FF a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF d(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::vector<FF> input{ a, b, c, d };

    FF result = poseidon2.hash(input);
    FF expected(std::string("0x2f43a0f83b51a6f5fc839dea0ecec74947637802a579fa9841930a25a0bcec11"));
    FF event_result = hash_event_emitter.dump_events().back().output;

    EXPECT_EQ(result, expected);
    EXPECT_EQ(result, event_result);
}

TEST(AvmSimulationPoseidon2Test, Permutation)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    // Taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    FF a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF d(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::array<FF, 4> input{ a, b, c, d };
    auto result = poseidon2.permutation(input);

    std::array<FF, 4> expected{
        FF(std::string("0x2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95")),
        FF(std::string("0x0c01fa1b8d0748becafbe452c0cb0231c38224ea824554c9362518eebdd5701f")),
        FF(std::string("0x018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3")),
        FF(std::string("0x0cbea457c91c22c6c31fd89afd2541efc2edf31736b9f721e823b2165c90fd41")),
    };

    std::vector<Poseidon2PermutationEvent> event_results = perm_event_emitter.dump_events();

    EXPECT_EQ(result, expected);
    EXPECT_EQ(event_results.size(), 1);

    auto event_result = event_results[0];
    EXPECT_EQ(event_result.output[0], expected[0]);
    EXPECT_EQ(event_result.output[1], expected[1]);
    EXPECT_EQ(event_result.output[2], expected[2]);
    EXPECT_EQ(event_result.output[3], expected[3]);
}

// This test may seem redundant, but since we kind of re-implement the Poseidon2 sponge function, it's good to have it.
TEST(AvmSimulationPoseidon2Test, RandomHash)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    std::vector<FF> input;
    input.reserve(14);

    for (int i = 0; i < 14; i++) {
        input.push_back(FF::random_element());
    }

    FF result = poseidon2.hash(input);
    FF bb_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input);

    EXPECT_EQ(result, bb_result);
}

} // namespace
} // namespace bb::avm2::simulation
