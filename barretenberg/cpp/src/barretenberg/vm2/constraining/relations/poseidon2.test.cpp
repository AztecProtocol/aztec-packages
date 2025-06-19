#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_poseidon2_hash.hpp"
#include "barretenberg/vm2/generated/relations/poseidon2_hash.hpp"
#include "barretenberg/vm2/generated/relations/poseidon2_perm.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"

// Temporary imports, see comment in test.
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {

using ::testing::ElementsAreArray;

using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using poseidon2_hash = bb::avm2::poseidon2_hash<FF>;
using poseidon2_perm = bb::avm2::poseidon2_perm<FF>;

using simulation::EventEmitter;
using simulation::NoopEventEmitter;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;

TEST(Poseidon2ConstrainingTest, Poseidon2EmptyRow)
{
    check_relation<poseidon2_hash>(testing::empty_trace());
    check_relation<poseidon2_perm>(testing::empty_trace());
}

// These tests imports a bunch of external code since hand-generating the poseidon2 trace is a bit laborious atm.
// TODO: Test lookup relations
TEST(Poseidon2ConstrainingTest, BasicPermutation)
{
    // We are just testing the permutation event here so we can use a noop emitter for the hash events.
    NoopEventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

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

    TestTraceContainer trace;
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_permutation(poseidon2_perm_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<poseidon2_perm>(trace);
}

TEST(Poseidon2ConstrainingTest, HashWithSinglePermutation)
{
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    // We are just testing the hash event here so we can use a noop emitter for the permutation events.
    NoopEventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

    FF a("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF b("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF c("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");

    std::vector<FF> input = { a, b, c };
    poseidon2.hash(input);

    // This first row column is set becuase it is used in the relations for Poseidon2Hash.
    // This could be replaced by having the precomputed tables in the trace, but currently that would
    // mean the clk column of length 2^21 -1 will be include :O
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_hash(poseidon2_hash_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 1);

    check_relation<poseidon2_hash>(trace);
}

TEST(Poseidon2ConstrainingTest, HashWithMultiplePermutation)
{
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

    // Taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    FF a("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF b("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF c("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF d("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");

    std::vector<FF> input = { a, b, c, d };
    poseidon2.hash(input);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_hash(poseidon2_hash_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 2);

    check_relation<poseidon2_hash>(trace);
}

TEST(Poseidon2ConstrainingTest, MultipleHashInvocations)
{
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

    std::vector<FF> input = { 1, 2, 3, 4 };

    FF result = poseidon2.hash(input);
    FF bb_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input);
    EXPECT_EQ(result, bb_result);

    result = poseidon2.hash({ result, 1, 2, 3, 4 });
    bb_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ bb_result, 1, 2, 3, 4 });
    EXPECT_EQ(result, bb_result);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_hash(poseidon2_hash_event_emitter.dump_events(), trace);
    builder.process_permutation(poseidon2_perm_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + /*first_invocation=*/2 + /*second_invokcation=*/2);

    check_relation<poseidon2_hash>(trace);
}

TEST(Poseidon2ConstrainingTest, HashPermInteractions)
{
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

    std::vector<FF> input = { 1, 2, 3, 4 };

    poseidon2.hash(input);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_hash(poseidon2_hash_event_emitter.dump_events(), trace);
    builder.process_permutation(poseidon2_perm_event_emitter.dump_events(), trace);
    check_interaction<Poseidon2TraceBuilder, lookup_poseidon2_hash_poseidon2_perm_settings>(trace);

    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + /*first_invocation=*/2);

    check_relation<poseidon2_hash>(trace);
    check_relation<poseidon2_perm>(trace);
}

TEST(Poseidon2ConstrainingTest, NegativeHashPermInteractions)
{
    // We won't generate permutation events which will cause the lookup to fail
    NoopEventEmitter<Poseidon2PermutationEvent> poseidon2_perm_event_emitter;
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_event_emitter;
    Poseidon2 poseidon2(poseidon2_hash_event_emitter, poseidon2_perm_event_emitter);

    std::vector<FF> input = { 1, 2, 3, 4 };

    poseidon2.hash(input);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_hash(poseidon2_hash_event_emitter.dump_events(), trace);

    // This sets the length of the inverse polynomial via SetDummyInverses, so we still need to call this even though we
    // know it will fail.
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<Poseidon2TraceBuilder, lookup_poseidon2_hash_poseidon2_perm_settings>(trace)),
        "Failed.*POSEIDON2_PERM. Could not find tuple in destination.");

    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + /*first_invocation=*/2);

    check_relation<poseidon2_hash>(trace);
}

} // namespace bb::avm2::constraining
