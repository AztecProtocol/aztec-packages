#include "barretenberg/vm2/simulation/keccakf1600.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {
namespace {

void flatten_state(KeccakF1600State state, uint64_t* flattened)
{
    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            flattened[(j * 5) + i] = state[i][j];
        }
    }
}

TEST(KeccakSimulationTest, matchesReferenceImplementation)
{
    NoopEventEmitter<KeccakF1600Event> keccak_event_emitter;
    NoopEventEmitter<BitwiseEvent> bitwise_event_emitter;
    NoopEventEmitter<RangeCheckEvent> range_check_event_emitter;

    Bitwise bitwise(bitwise_event_emitter);
    RangeCheck range_check(range_check_event_emitter);
    KeccakF1600 keccak(keccak_event_emitter, bitwise, range_check);

    KeccakF1600State input = {
        { { 0, 1, 2, 3, 4 }, { 5, 6, 7, 8, 9 }, { 10, 11, 12, 13, 14 }, { 15, 16, 17, 18, 19 }, { 20, 21, 22, 23, 24 } }
    };

    uint64_t flat_input[25];
    uint64_t flat_output[25];
    flatten_state(input, flat_input);

    const auto output = keccak.permutation(input);
    flatten_state(output, flat_output);

    uint64_t reference_output[25];
    std::copy(flat_input, flat_input + 25, reference_output);

    ethash_keccakf1600(reference_output); // Mutate input

    EXPECT_THAT(reference_output, testing::ElementsAreArray(flat_output));
}

} // namespace
} // namespace bb::avm2::simulation
