#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::ElementsAreArray;
using ::testing::Field;
using ::testing::StrictMock;

class Poseidon2SimulationTest : public ::testing::Test {
  protected:
    Poseidon2SimulationTest()
    {
        EXPECT_CALL(execution_id_manager, get_execution_id())
            .WillRepeatedly(testing::Return(0)); // Default execution ID for testing
    }

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;

    PureGreaterThan gt;
    Poseidon2 poseidon2 =
        Poseidon2(execution_id_manager, gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
};

TEST_F(Poseidon2SimulationTest, Hash)
{
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

TEST_F(Poseidon2SimulationTest, Permutation)
{
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
TEST_F(Poseidon2SimulationTest, RandomHash)
{
    std::vector<FF> input;
    input.reserve(14);

    for (int i = 0; i < 14; i++) {
        input.push_back(FF::random_element());
    }

    FF result = poseidon2.hash(input);
    FF bb_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input);

    EXPECT_EQ(result, bb_result);
}

TEST_F(Poseidon2SimulationTest, PermutationWithMemory)
{
    MemoryStore mem;
    MemoryAddress src_address = 0;

    // Inputs taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    std::array<FF, 4> inputs = { FF("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"),
                                 FF("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"),
                                 FF("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"),
                                 FF("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789") };
    // Fill the memory with 4 FF Elements
    for (uint32_t i = 0; i < 4; ++i) {
        mem.set(src_address + i, MemoryValue::from<FF>(inputs[i]));
    }

    MemoryAddress dst_address = 4;

    poseidon2.permutation(mem, src_address, dst_address);

    std::array<FF, 4> expected = {
        FF("0x2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95"),
        FF("0x0c01fa1b8d0748becafbe452c0cb0231c38224ea824554c9362518eebdd5701f"),
        FF("0x018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3"),
        FF("0x0cbea457c91c22c6c31fd89afd2541efc2edf31736b9f721e823b2165c90fd41"),
    };

    // Read the memory at the destination address and check if it matches the expected output
    for (uint32_t i = 0; i < expected.size(); ++i) {
        EXPECT_EQ(mem.get(dst_address + i).as_ff(), expected[i]);
    }
}

TEST_F(Poseidon2SimulationTest, PermutationWithMemoryAddressOutOfRange)
{
    MemoryStore mem;
    MemoryAddress src_address = AVM_HIGHEST_MEM_ADDRESS; // This will cause an out of range error
    MemoryAddress dst_address = 0;

    EXPECT_THROW(poseidon2.permutation(mem, src_address, dst_address), std::runtime_error);
}

TEST_F(Poseidon2SimulationTest, PermutationWithMemoryInvalidMemTag)
{
    MemoryStore mem;
    MemoryAddress src_address = 0;
    MemoryAddress dst_address = 4;

    // Inputs taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    std::array<MemoryValue, 4> inputs = {
        MemoryValue::from<FF>(FF("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")),
        MemoryValue::from<FF>(FF("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")),
        MemoryValue::from<uint64_t>(123456789), // Invalid tag
        MemoryValue::from<FF>(FF("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"))
    };

    // Fill the memory with 4 elements
    for (uint32_t i = 0; i < inputs.size(); ++i) {
        mem.set(src_address + i, inputs[i]);
    }

    EXPECT_THROW(poseidon2.permutation(mem, src_address, dst_address), Poseidon2Exception);
}

} // namespace
} // namespace bb::avm2::simulation
