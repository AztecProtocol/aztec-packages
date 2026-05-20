#include "barretenberg/vm2/simulation/gadgets/address_derivation.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <stdexcept>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_ecc.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

using ::testing::IsEmpty;
using ::testing::Return;
using ::testing::SizeIs;
using ::testing::StrictMock;

using poseidon2 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

namespace bb::avm2::simulation {

namespace {

using simulation::PurePoseidon2;

TEST(AvmSimulationAddressDerivationTest, Positive)
{
    EventEmitter<AddressDerivationEvent> address_derivation_event_emitter;
    PurePoseidon2 poseidon2 = PurePoseidon2();
    StrictMock<MockEcc> ecc;

    AddressDerivation address_derivation(poseidon2, ecc, address_derivation_event_emitter);

    ContractInstance instance = testing::random_contract_instance();
    AztecAddress derived_address = compute_contract_address(instance);
    std::vector<FF> salted_init_hash_inputs = { DOM_SEP__SALTED_INITIALIZATION_HASH,
                                                instance.salt,
                                                instance.initialization_hash,
                                                instance.deployer,
                                                instance.immutables_hash };
    FF salted_init_hash = poseidon2::hash(salted_init_hash_inputs);

    std::vector<FF> partial_address_inputs = { DOM_SEP__PARTIAL_ADDRESS,
                                               instance.original_contract_class_id,
                                               salted_init_hash };
    FF partial_address = poseidon2::hash(partial_address_inputs);

    FF public_keys_hash = hash_public_keys(instance.public_keys);

    std::vector<FF> preaddress_inputs = { DOM_SEP__CONTRACT_ADDRESS_V2, public_keys_hash, partial_address };
    FF preaddress = poseidon2::hash(preaddress_inputs);

    EmbeddedCurvePoint g1 = EmbeddedCurvePoint::one();
    EmbeddedCurvePoint preaddress_public_key = g1 * Fq(preaddress);
    EXPECT_CALL(ecc, scalar_mul(g1, preaddress)).WillOnce(Return(preaddress_public_key));

    EmbeddedCurvePoint address_point = preaddress_public_key + instance.public_keys.incoming_viewing_key;
    EXPECT_CALL(ecc, add(preaddress_public_key, EmbeddedCurvePoint(instance.public_keys.incoming_viewing_key)))
        .WillOnce(Return(address_point));

    address_derivation.assert_derivation(derived_address, instance);

    auto events = address_derivation_event_emitter.dump_events();
    EXPECT_THAT(events, SizeIs(1));
    EXPECT_EQ(events[0].instance, instance);
    EXPECT_EQ(events[0].salted_initialization_hash, salted_init_hash);
    EXPECT_EQ(events[0].partial_address, partial_address);
    EXPECT_EQ(events[0].public_keys_hash, public_keys_hash);
    EXPECT_EQ(events[0].preaddress, preaddress);
    EXPECT_EQ(events[0].preaddress_public_key, preaddress_public_key);
    EXPECT_EQ(events[0].address, derived_address);
    EXPECT_EQ(events[0].address_point.x(), derived_address);

    // Second derivation for the same address should be a cache hit and should not emit an event
    address_derivation.assert_derivation(derived_address, instance);
    events = address_derivation_event_emitter.dump_events();
    EXPECT_THAT(events, IsEmpty());
}

TEST(AvmSimulationAddressDerivationTest, Negative)
{
    EventEmitter<AddressDerivationEvent> address_derivation_event_emitter;
    PurePoseidon2 poseidon2 = PurePoseidon2();
    StrictMock<MockEcc> ecc;

    AddressDerivation address_derivation(poseidon2, ecc, address_derivation_event_emitter);

    ContractInstance instance = testing::random_contract_instance();
    AztecAddress derived_address = compute_contract_address(instance);

    std::vector<FF> salted_init_hash_inputs = { DOM_SEP__SALTED_INITIALIZATION_HASH,
                                                instance.salt,
                                                instance.initialization_hash,
                                                instance.deployer,
                                                instance.immutables_hash };
    FF salted_init_hash = poseidon2::hash(salted_init_hash_inputs);

    std::vector<FF> partial_address_inputs = { DOM_SEP__PARTIAL_ADDRESS,
                                               instance.original_contract_class_id,
                                               salted_init_hash };
    FF partial_address = poseidon2::hash(partial_address_inputs);

    FF public_keys_hash = hash_public_keys(instance.public_keys);

    std::vector<FF> preaddress_inputs = { DOM_SEP__CONTRACT_ADDRESS_V2, public_keys_hash, partial_address };
    FF preaddress = poseidon2::hash(preaddress_inputs);

    EmbeddedCurvePoint g1 = EmbeddedCurvePoint::one();
    EmbeddedCurvePoint preaddress_public_key = g1 * Fq(preaddress);
    EXPECT_CALL(ecc, scalar_mul(g1, preaddress)).WillOnce(Return(preaddress_public_key));

    EmbeddedCurvePoint address_point = preaddress_public_key + instance.public_keys.incoming_viewing_key;
    EXPECT_CALL(ecc, add(preaddress_public_key, EmbeddedCurvePoint(instance.public_keys.incoming_viewing_key)))
        .WillOnce(Return(address_point));

    // Should fail on incorrect derived address.
    EXPECT_THROW(address_derivation.assert_derivation(derived_address + 1, instance), std::runtime_error);

    // Should fail on mutated instance for unseen address.
    instance.public_keys.nullifier_key_hash = FF(0xdeadbeef);

    public_keys_hash = hash_public_keys(instance.public_keys);
    preaddress_inputs = { DOM_SEP__CONTRACT_ADDRESS_V2, public_keys_hash, partial_address };
    preaddress = poseidon2::hash(preaddress_inputs);
    preaddress_public_key = g1 * Fq(preaddress);
    address_point = preaddress_public_key + instance.public_keys.incoming_viewing_key;

    EXPECT_CALL(ecc, scalar_mul(g1, preaddress)).WillOnce(Return(preaddress_public_key));
    EXPECT_CALL(ecc, add(preaddress_public_key, EmbeddedCurvePoint(instance.public_keys.incoming_viewing_key)))
        .WillOnce(Return(address_point));

    // The below fails and does not emit an event.
    EXPECT_THROW(address_derivation.assert_derivation(derived_address, instance), std::runtime_error);
    EXPECT_THAT(address_derivation_event_emitter.dump_events(), IsEmpty());

    // Perform a successful derivation for the mutated instance above.
    EXPECT_CALL(ecc, scalar_mul(g1, preaddress)).WillOnce(Return(preaddress_public_key));
    EXPECT_CALL(ecc, add(preaddress_public_key, EmbeddedCurvePoint(instance.public_keys.incoming_viewing_key)))
        .WillOnce(Return(address_point));
    // The below succeeds, emits an event, and stores the address in the cached_derivations cache.
    address_derivation.assert_derivation(address_point.x(), instance);
    EXPECT_THAT(address_derivation_event_emitter.dump_events(), SizeIs(1));

    // Should fail on mutated instance for seen address.
    ContractInstance new_instance = instance;
    new_instance.deployer += 1;
    // Note: EXPECT_CALLs not required since the address is cached.
    EXPECT_THROW(address_derivation.assert_derivation(address_point.x(), new_instance), std::runtime_error);
    EXPECT_THAT(address_derivation_event_emitter.dump_events(), IsEmpty());

    // The below succeeds and hits the cache, so does not emit an event.
    address_derivation.assert_derivation(address_point.x(), instance);
    EXPECT_THAT(address_derivation_event_emitter.dump_events(), IsEmpty());
}

} // namespace
} // namespace bb::avm2::simulation
