#include "barretenberg/vm2/simulation/poseidon2.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::ElementsAreArray;
using ::testing::Field;

TEST(Poseidon2SimulationTest, Hash)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    // Taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    FF a("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF b("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF c("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF d("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");

    std::vector<FF> input = { a, b, c, d };

    FF result = poseidon2.hash(input);
    FF expected("0x2f43a0f83b51a6f5fc839dea0ecec74947637802a579fa9841930a25a0bcec11");
    EXPECT_EQ(result, expected);

    std::vector<Poseidon2HashEvent> event_result = hash_event_emitter.dump_events();

    EXPECT_THAT(event_result,
                ElementsAre(testing::AllOf(Field(&Poseidon2HashEvent::inputs, ElementsAreArray(input)),
                                           Field(&Poseidon2HashEvent::intermediate_states, _),
                                           Field(&Poseidon2HashEvent::output, expected))));
}

TEST(Poseidon2SimulationTest, Permutation)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    // Taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    FF a("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF b("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF c("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF d("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");

    std::array<FF, 4> input = { a, b, c, d };
    auto result = poseidon2.permutation(input);

    std::array<FF, 4> expected = {
        FF("0x2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95"),
        FF("0x0c01fa1b8d0748becafbe452c0cb0231c38224ea824554c9362518eebdd5701f"),
        FF("0x018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3"),
        FF("0x0cbea457c91c22c6c31fd89afd2541efc2edf31736b9f721e823b2165c90fd41"),
    };
    EXPECT_THAT(result, ElementsAreArray(expected));

    std::vector<Poseidon2PermutationEvent> event_results = perm_event_emitter.dump_events();

    EXPECT_THAT(event_results,
                ElementsAre(AllOf(Field(&Poseidon2PermutationEvent::input, ElementsAreArray(input)),
                                  Field(&Poseidon2PermutationEvent::output, ElementsAreArray(expected)))));
}

// This test may seem redundant, but since we kind of re-implement the Poseidon2 sponge function, it's good to have it.
TEST(Poseidon2SimulationTest, RandomHash)
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
