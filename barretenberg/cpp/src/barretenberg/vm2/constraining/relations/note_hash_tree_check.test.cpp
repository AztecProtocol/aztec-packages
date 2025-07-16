#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/note_hash_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EventEmitter;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::NoteHashTreeCheck;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::unconstrained_root_from_path;

using tracegen::MerkleCheckTraceBuilder;
using tracegen::NoteHashTreeCheckTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::PublicInputsTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using note_hash_tree_check = bb::avm2::note_hash_tree_check<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(NoteHashTreeCheckConstrainingTests, PositiveExists)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<simulation::NoteHashTreeCheckEvent> note_hash_tree_check_event_emitter;
    NoteHashTreeCheck note_hash_tree_check_simulator(0, poseidon2, merkle_check, note_hash_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    MerkleCheckTraceBuilder merkle_check_builder;
    NoteHashTreeCheckTraceBuilder note_hash_tree_check_builder;

    FF note_hash = 42;

    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NOTE_HASH_TREE_HEIGHT);
    for (size_t i = 0; i < NOTE_HASH_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(note_hash, leaf_index, sibling_path);

    EXPECT_TRUE(note_hash_tree_check_simulator.note_hash_exists(
        note_hash,
        note_hash,
        leaf_index,
        sibling_path,
        AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 128 }));

    note_hash_tree_check_builder.process(note_hash_tree_check_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    check_relation<note_hash_tree_check>(trace);
    // Not checking all interactions due to the public inputs interaction, which needs to be checked in an e2e test
    check_interaction<NoteHashTreeCheckTraceBuilder,
                      lookup_note_hash_tree_check_silo_poseidon2_settings,
                      lookup_note_hash_tree_check_read_first_nullifier_settings,
                      lookup_note_hash_tree_check_nonce_computation_poseidon2_settings,
                      lookup_note_hash_tree_check_unique_note_hash_poseidon2_settings,
                      lookup_note_hash_tree_check_merkle_check_settings>(trace);
}

TEST(NoteHashTreeCheckConstrainingTests, PositiveNotExists)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<simulation::NoteHashTreeCheckEvent> note_hash_tree_check_event_emitter;
    NoteHashTreeCheck note_hash_tree_check_simulator(0, poseidon2, merkle_check, note_hash_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    MerkleCheckTraceBuilder merkle_check_builder;
    NoteHashTreeCheckTraceBuilder note_hash_tree_check_builder;

    FF requested_note_hash = 42;
    FF actual_leaf_value = 43;

    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NOTE_HASH_TREE_HEIGHT);
    for (size_t i = 0; i < NOTE_HASH_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(actual_leaf_value, leaf_index, sibling_path);

    EXPECT_FALSE(note_hash_tree_check_simulator.note_hash_exists(
        requested_note_hash,
        actual_leaf_value,
        leaf_index,
        sibling_path,
        AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 128 }));

    note_hash_tree_check_builder.process(note_hash_tree_check_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    check_relation<note_hash_tree_check>(trace);
    // Not checking all interactions due to the public inputs interaction, which needs to be checked in an e2e test
    check_interaction<NoteHashTreeCheckTraceBuilder,
                      lookup_note_hash_tree_check_silo_poseidon2_settings,
                      lookup_note_hash_tree_check_read_first_nullifier_settings,
                      lookup_note_hash_tree_check_nonce_computation_poseidon2_settings,
                      lookup_note_hash_tree_check_unique_note_hash_poseidon2_settings,
                      lookup_note_hash_tree_check_merkle_check_settings>(trace);
}

TEST(NoteHashTreeCheckConstrainingTests, PositiveWrite)
{
    auto test_public_inputs = testing::PublicInputsBuilder().rand_previous_non_revertible_accumulated_data(1).build();
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<simulation::NoteHashTreeCheckEvent> note_hash_tree_check_event_emitter;
    NoteHashTreeCheck note_hash_tree_check_simulator(
        test_public_inputs.previousNonRevertibleAccumulatedData.nullifiers[0],
        poseidon2,
        merkle_check,
        note_hash_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    FF raw_note_hash = 42;

    std::vector<FF> sibling_path;
    sibling_path.reserve(NOTE_HASH_TREE_HEIGHT);
    for (size_t i = 0; i < NOTE_HASH_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }

    AppendOnlyTreeSnapshot prev_snapshot{ .root = unconstrained_root_from_path(0, 128, sibling_path),
                                          .nextAvailableLeafIndex = 128 };

    note_hash_tree_check_simulator.append_note_hash(raw_note_hash, AztecAddress(7), 10, sibling_path, prev_snapshot);

    NoteHashTreeCheckTraceBuilder note_hash_tree_check_builder;
    note_hash_tree_check_builder.process(note_hash_tree_check_event_emitter.dump_events(), trace);
    Poseidon2TraceBuilder poseidon2_builder;
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    MerkleCheckTraceBuilder merkle_check_builder;
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_phase_table(trace);
    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    check_relation<note_hash_tree_check>(trace);
    // Not checking all interactions due to the public inputs interaction, which needs to be checked in an e2e test
    check_interaction<NoteHashTreeCheckTraceBuilder,
                      lookup_note_hash_tree_check_silo_poseidon2_settings,
                      lookup_note_hash_tree_check_read_first_nullifier_settings,
                      lookup_note_hash_tree_check_nonce_computation_poseidon2_settings,
                      lookup_note_hash_tree_check_unique_note_hash_poseidon2_settings,
                      lookup_note_hash_tree_check_merkle_check_settings>(trace);
}

TEST(NoteHashTreeCheckConstrainingTests, NegativeSiloingOnRead)
{
    TestTraceContainer trace({ {
        { C::note_hash_tree_check_sel, 1 },
        { C::note_hash_tree_check_write, 0 },
        { C::note_hash_tree_check_should_silo, 1 },
        { C::note_hash_tree_check_note_hash, 27 },
    } });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<note_hash_tree_check>(trace, note_hash_tree_check::SR_DISABLE_SILOING_ON_READ),
        "DISABLE_SILOING_ON_READ");
}

TEST(NoteHashTreeCheckConstrainingTests, NegativePassthroughSiloing)
{
    TestTraceContainer trace({ {
        { C::note_hash_tree_check_sel, 1 },
        { C::note_hash_tree_check_write, 0 },
        { C::note_hash_tree_check_should_silo, 0 },
        { C::note_hash_tree_check_note_hash, 27 },
        { C::note_hash_tree_check_siloed_note_hash, 27 },
    } });

    check_relation<note_hash_tree_check>(trace, note_hash_tree_check::SR_PASSTHROUGH_SILOING);

    trace.set(C::note_hash_tree_check_siloed_note_hash, 0, 28);

    EXPECT_THROW_WITH_MESSAGE(check_relation<note_hash_tree_check>(trace, note_hash_tree_check::SR_PASSTHROUGH_SILOING),
                              "PASSTHROUGH_SILOING");
}

TEST(NoteHashTreeCheckConstrainingTests, NegativeUniquenessOnRead)
{
    TestTraceContainer trace({ {
        { C::note_hash_tree_check_sel, 1 },
        { C::note_hash_tree_check_write, 0 },
        { C::note_hash_tree_check_should_unique, 1 },
        { C::note_hash_tree_check_note_hash, 27 },
    } });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<note_hash_tree_check>(trace, note_hash_tree_check::SR_DISABLE_UNIQUENESS_ON_READ),
        "DISABLE_UNIQUENESS_ON_READ");
}

TEST(NoteHashTreeCheckConstrainingTests, NegativePassthroughUniqueness)
{
    TestTraceContainer trace({ {
        { C::note_hash_tree_check_sel, 1 },
        { C::note_hash_tree_check_write, 0 },
        { C::note_hash_tree_check_should_unique, 0 },
        { C::note_hash_tree_check_note_hash, 27 },
        { C::note_hash_tree_check_siloed_note_hash, 27 },
        { C::note_hash_tree_check_unique_note_hash, 27 },
    } });

    check_relation<note_hash_tree_check>(trace, note_hash_tree_check::SR_PASSTHROUGH_UNIQUENESS);

    trace.set(C::note_hash_tree_check_unique_note_hash, 0, 28);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<note_hash_tree_check>(trace, note_hash_tree_check::SR_PASSTHROUGH_UNIQUENESS),
        "PASSTHROUGH_UNIQUENESS");
}

} // namespace
} // namespace bb::avm2::constraining
