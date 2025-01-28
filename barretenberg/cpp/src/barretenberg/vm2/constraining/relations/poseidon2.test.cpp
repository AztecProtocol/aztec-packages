#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/poseidon2_hash.hpp"
#include "barretenberg/vm2/generated/relations/poseidon2_perm.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
// Temporary imports, see comment in test.
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using poseidon2_hash = bb::avm2::poseidon2_hash<FF>;
using poseidon2_perm = bb::avm2::poseidon2_perm<FF>;

using simulation::EventEmitter;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;

TEST(Poseidon2, Poseidon2EmptyRow)
{
    auto trace = TestTraceContainer::from_rows({
        { .precomputed_clk = 1, .precomputed_first_row = 1 },
    });

    check_relation<poseidon2_hash>(trace);
    check_relation<poseidon2_perm>(trace);
}

// These tests imports a bunch of external code since hand-generating the poseidon2 trace is a bit laborious atm.
// TODO: Test lookup relations
TEST(Poseidon2, BasicPermutation)
{
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

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

    EXPECT_EQ(result, expected);

    TestTraceContainer trace;
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_permutation(poseidon2_perm_event_emitter.dump_events(), trace);

    check_relation<poseidon2_perm>(trace);
    EXPECT_EQ(trace.get_num_rows(), 1);
}

TEST(Poseidon2, HashWithSinglePermutation)
{
    simulation::EventEmitter<simulation::Poseidon2HashEvent> poseidon2_hash_event_emitter;
    simulation::EventEmitter<simulation::Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    simulation::Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

    FF a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::vector<FF> input{ a, b, c };
    poseidon2.hash(input);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_hash(poseidon2_hash_event_emitter.dump_events(), trace);
    builder.process_permutation(poseidon2_perm_event_emitter.dump_events(), trace);

    check_relation<poseidon2_hash>(trace);
    check_relation<poseidon2_perm>(trace);

    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 1);
}

TEST(Poseidon2Hash, HashWithMultiplePermutation)
{
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

    // Taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    FF a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    FF d(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::vector<FF> input{ a, b, c, d };
    poseidon2.hash(input);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_hash(poseidon2_hash_event_emitter.dump_events(), trace);
    builder.process_permutation(poseidon2_perm_event_emitter.dump_events(), trace);

    check_relation<poseidon2_hash>(trace);
    check_relation<poseidon2_perm>(trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 2);
}

TEST(Poseidon2Hash, MultipleHashInvocations)
{
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

    FF a{ 1 };
    FF b{ 2 };
    FF c{ 3 };
    FF d{ 4 };

    std::vector<FF> input{ a, b, c, d };

    FF result = poseidon2.hash(input);
    FF bb_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input);
    EXPECT_EQ(result, bb_result);

    result = poseidon2.hash({ result, a, b, c, d });
    bb_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ bb_result, a, b, c, d });
    EXPECT_EQ(result, bb_result);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_hash(poseidon2_hash_event_emitter.dump_events(), trace);
    builder.process_permutation(poseidon2_perm_event_emitter.dump_events(), trace);

    check_relation<poseidon2_hash>(trace);
    check_relation<poseidon2_perm>(trace);

    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + /*first_invocation=*/2 + /*second_invokcation=*/2);
}

} // namespace bb::avm2::constraining
