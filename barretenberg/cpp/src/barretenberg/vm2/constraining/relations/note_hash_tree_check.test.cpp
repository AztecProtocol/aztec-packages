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
#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EventEmitter;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::NoopEventEmitter;
using simulation::NoteHashTreeCheck;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::root_from_path;

using tracegen::NoteHashTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using note_hash_tree_check = bb::avm2::note_hash_tree_check<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(NoteHashTreeCheckConstrainingTests, PositiveRead)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<simulation::NoteHashTreeCheckEvent> note_hash_tree_check_event_emitter;
    NoteHashTreeCheck note_hash_tree_check_simulator(0, poseidon2, merkle_check, note_hash_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    NoteHashTreeCheckTraceBuilder note_hash_tree_check_builder;

    FF note_hash = 42;

    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NOTE_HASH_TREE_HEIGHT);
    for (size_t i = 0; i < NOTE_HASH_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = root_from_path(note_hash, leaf_index, sibling_path);

    note_hash_tree_check_simulator.assert_read(
        note_hash, leaf_index, sibling_path, AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 128 });

    note_hash_tree_check_builder.process(note_hash_tree_check_event_emitter.dump_events(), trace);

    check_relation<note_hash_tree_check>(trace);
}

TEST(NoteHashTreeCheckConstrainingTests, PositiveWrite)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<simulation::NoteHashTreeCheckEvent> note_hash_tree_check_event_emitter;
    NoteHashTreeCheck note_hash_tree_check_simulator(27, poseidon2, merkle_check, note_hash_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    NoteHashTreeCheckTraceBuilder note_hash_tree_check_builder;

    FF raw_note_hash = 42;

    std::vector<FF> sibling_path;
    sibling_path.reserve(NOTE_HASH_TREE_HEIGHT);
    for (size_t i = 0; i < NOTE_HASH_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }

    AppendOnlyTreeSnapshot prev_snapshot{ .root = root_from_path(0, 128, sibling_path), .nextAvailableLeafIndex = 128 };

    note_hash_tree_check_simulator.append_note_hash(raw_note_hash, AztecAddress(7), 10, sibling_path, prev_snapshot);

    note_hash_tree_check_builder.process(note_hash_tree_check_event_emitter.dump_events(), trace);

    check_relation<note_hash_tree_check>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
