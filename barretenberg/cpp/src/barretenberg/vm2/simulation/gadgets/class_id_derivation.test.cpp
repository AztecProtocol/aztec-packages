#include "barretenberg/vm2/simulation/gadgets/class_id_derivation.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

using ::testing::IsEmpty;
using ::testing::SizeIs;

namespace bb::avm2::simulation {

namespace {

using simulation::PurePoseidon2;

TEST(AvmSimulationClassIdDerivationTest, Positive)
{
    EventEmitter<ClassIdDerivationEvent> class_id_derivation_event_emitter;
    PurePoseidon2 poseidon2 = PurePoseidon2();

    ClassIdDerivation class_id_derivation(poseidon2, class_id_derivation_event_emitter);

    ContractClass klass = { .artifact_hash = FF::random_element(),
                            .private_function_root = FF::random_element(),
                            .public_bytecode_commitment = FF::random_element(),
                            .packed_bytecode = { 0x01, 0x02, 0x03, 0x04 } };
    ContractClassId class_id = poseidon2.hash(std::vector<FF>{ GENERATOR_INDEX__CONTRACT_LEAF,
                                                               klass.artifact_hash,
                                                               klass.private_function_root,
                                                               klass.public_bytecode_commitment });

    class_id_derivation.assert_derivation(class_id, klass);

    auto events = class_id_derivation_event_emitter.dump_events();
    EXPECT_THAT(events, SizeIs(1));
    EXPECT_EQ(events[0].class_id, class_id);
    EXPECT_EQ(events[0].klass.artifact_hash, klass.artifact_hash);

    // Second derivation for the same class ID should be a cache hit and should not emit an event
    class_id_derivation.assert_derivation(class_id, klass);
    events = class_id_derivation_event_emitter.dump_events();
    EXPECT_THAT(events, IsEmpty());
}

} // namespace
} // namespace bb::avm2::simulation
