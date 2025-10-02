#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/address_derivation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_address_derivation.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/address_derivation.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_to_radix.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/tracegen/address_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::Return;
using ::testing::StrictMock;

using tracegen::AddressDerivationTraceBuilder;
using tracegen::EccTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;

using simulation::AddressDerivation;
using simulation::AddressDerivationEvent;
using simulation::compute_contract_address;
using simulation::Ecc;
using simulation::EccAddEvent;
using simulation::EccAddMemoryEvent;
using simulation::EventEmitter;
using simulation::hash_public_keys;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::NoopEventEmitter;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using simulation::PureToRadix;
using simulation::ScalarMulEvent;

using FF = AvmFlavorSettings::FF;
using C = Column;
using address_derivation_relation = bb::avm2::address_derivation<FF>;
using poseidon2_relation = bb::avm2::poseidon2_hash<FF>;
using ecadd_relation = bb::avm2::ecc<FF>;
using scalar_mul_relation = bb::avm2::scalar_mul<FF>;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(AddressDerivationConstrainingTest, EmptyRow)
{
    check_relation<address_derivation_relation>(testing::empty_trace());
}

TEST(AddressDerivationConstrainingTest, Basic)
{
    TestTraceContainer trace;
    AddressDerivationTraceBuilder builder;

    auto instance = testing::random_contract_instance();

    FF salted_initialization_hash = poseidon2::hash(
        { GENERATOR_INDEX__PARTIAL_ADDRESS, instance.salt, instance.initialisation_hash, instance.deployer_addr });

    FF partial_address =
        poseidon2::hash({ GENERATOR_INDEX__PARTIAL_ADDRESS, instance.original_class_id, salted_initialization_hash });

    FF public_keys_hash = hash_public_keys(instance.public_keys);
    FF preaddress = poseidon2::hash({ GENERATOR_INDEX__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address });

    EmbeddedCurvePoint g1 = EmbeddedCurvePoint::one();
    EmbeddedCurvePoint preaddress_public_key = g1 * Fq(preaddress);
    EmbeddedCurvePoint address_point = preaddress_public_key + instance.public_keys.incoming_viewing_key;

    builder.process({ { .address = address_point.x(),
                        .instance = instance,
                        .salted_initialization_hash = salted_initialization_hash,
                        .partial_address = partial_address,
                        .public_keys_hash = public_keys_hash,
                        .preaddress = preaddress,
                        .preaddress_public_key = preaddress_public_key,
                        .address_point = address_point } },
                    trace);

    EXPECT_EQ(trace.get_num_rows(), 1);
    check_relation<address_derivation_relation>(trace);
}

TEST(AddressDerivationConstrainingTest, WithInteractions)
{
    EventEmitter<EccAddEvent> ecadd_event_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_event_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_event_emitter;
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    NoopEventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;
    EventEmitter<AddressDerivationEvent> address_derivation_event_emitter;

    StrictMock<MockExecutionIdManager> mock_exec_id_manager;
    EXPECT_CALL(mock_exec_id_manager, get_execution_id)
        .WillRepeatedly(Return(0)); // Use a fixed execution ID for the test
    StrictMock<MockGreaterThan> mock_gt;
    Poseidon2 poseidon2_simulator(
        mock_exec_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);

    PureToRadix to_radix_simulator;
    Ecc ecc_simulator(mock_exec_id_manager,
                      mock_gt,
                      to_radix_simulator,
                      ecadd_event_emitter,
                      scalar_mul_event_emitter,
                      ecc_add_memory_event_emitter);

    AddressDerivation address_derivation(poseidon2_simulator, ecc_simulator, address_derivation_event_emitter);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    AddressDerivationTraceBuilder builder;
    Poseidon2TraceBuilder poseidon2_builder;
    EccTraceBuilder ecc_builder;

    ContractInstance instance = testing::random_contract_instance();
    AztecAddress address = compute_contract_address(instance);
    address_derivation.assert_derivation(address, instance);

    builder.process(address_derivation_event_emitter.dump_events(), trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    ecc_builder.process_add(ecadd_event_emitter.dump_events(), trace);
    ecc_builder.process_scalar_mul(scalar_mul_event_emitter.dump_events(), trace);

    check_interaction<AddressDerivationTraceBuilder,
                      lookup_address_derivation_salted_initialization_hash_poseidon2_0_settings,
                      lookup_address_derivation_salted_initialization_hash_poseidon2_1_settings,
                      lookup_address_derivation_partial_address_poseidon2_settings,
                      lookup_address_derivation_public_keys_hash_poseidon2_0_settings,
                      lookup_address_derivation_public_keys_hash_poseidon2_1_settings,
                      lookup_address_derivation_public_keys_hash_poseidon2_2_settings,
                      lookup_address_derivation_public_keys_hash_poseidon2_3_settings,
                      lookup_address_derivation_public_keys_hash_poseidon2_4_settings,
                      lookup_address_derivation_preaddress_poseidon2_settings,
                      lookup_address_derivation_preaddress_scalar_mul_settings,
                      lookup_address_derivation_address_ecadd_settings>(trace);
    check_relation<address_derivation_relation>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
