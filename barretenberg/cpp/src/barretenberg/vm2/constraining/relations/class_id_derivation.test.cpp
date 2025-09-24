#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/class_id_derivation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_retrieval.hpp"
#include "barretenberg/vm2/generated/relations/lookups_class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::StrictMock;

using tracegen::BytecodeTraceBuilder;
using tracegen::ClassIdDerivationTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;

using simulation::ClassIdDerivation;
using simulation::ClassIdDerivationEvent;
using simulation::compute_contract_class_id;
using simulation::EventEmitter;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::NoopEventEmitter;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using simulation::PurePoseidon2;

using FF = AvmFlavorSettings::FF;
using C = Column;
using class_id_derivation_relation = bb::avm2::class_id_derivation<FF>;

ContractClass generate_contract_class()
{
    return ContractClass{ .artifact_hash = FF::random_element(),
                          .private_function_root = FF::random_element(),
                          .public_bytecode_commitment = FF::random_element(),
                          .packed_bytecode = {} };
}

TEST(ClassIdDerivationConstrainingTest, EmptyRow)
{
    check_relation<class_id_derivation_relation>(testing::empty_trace());
}

TEST(ClassIdDerivationConstrainingTest, Basic)
{
    TestTraceContainer trace;
    ClassIdDerivationTraceBuilder builder;

    auto klass = generate_contract_class();

    FF class_id =
        compute_contract_class_id(klass.artifact_hash, klass.private_function_root, klass.public_bytecode_commitment);

    builder.process({ { .class_id = class_id, .klass = klass } }, trace);

    check_relation<class_id_derivation_relation>(trace);
}

TEST(ClassIdDerivationPoseidonTest, WithHashInteraction)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    NoopEventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> mock_gt;
    Poseidon2 poseidon2 =
        Poseidon2(execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);

    EventEmitter<ClassIdDerivationEvent> event_emitter;
    ClassIdDerivation class_id_derivation(poseidon2, event_emitter);

    auto klass = generate_contract_class();
    FF class_id =
        compute_contract_class_id(klass.artifact_hash, klass.private_function_root, klass.public_bytecode_commitment);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ClassIdDerivationTraceBuilder builder;
    Poseidon2TraceBuilder poseidon2_builder;

    class_id_derivation.assert_derivation(class_id, klass);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    builder.process({ { .class_id = class_id, .klass = klass } }, trace);

    check_interaction<ClassIdDerivationTraceBuilder,
                      lookup_class_id_derivation_class_id_poseidon2_0_settings,
                      lookup_class_id_derivation_class_id_poseidon2_1_settings>(trace);
}

// TODO: This should probably be refined and moved to bc_retrieval test file once that exists
TEST(ClassIdDerivationPoseidonTest, WithRetrievalInteraction)
{
    PurePoseidon2 poseidon2 = PurePoseidon2();

    EventEmitter<ClassIdDerivationEvent> event_emitter;
    ClassIdDerivation class_id_derivation(poseidon2, event_emitter);

    auto klass = generate_contract_class();
    FF class_id =
        compute_contract_class_id(klass.artifact_hash, klass.private_function_root, klass.public_bytecode_commitment);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ClassIdDerivationTraceBuilder builder;
    BytecodeTraceBuilder bc_trace_builder;

    class_id_derivation.assert_derivation(class_id, klass);
    builder.process({ { .class_id = class_id, .klass = klass } }, trace);

    bc_trace_builder.process_retrieval({ { .bytecode_id = klass.public_bytecode_commitment,
                                           .address = 1,
                                           .current_class_id = class_id,
                                           .contract_class = klass,
                                           .nullifier_root = 3 } },
                                       trace);

    check_interaction<BytecodeTraceBuilder, lookup_bc_retrieval_class_id_derivation_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
