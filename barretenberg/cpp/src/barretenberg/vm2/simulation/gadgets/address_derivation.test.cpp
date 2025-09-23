#include "barretenberg/vm2/simulation/gadgets/address_derivation.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
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
    std::vector<FF> salted_init_hash_inputs = {
        GENERATOR_INDEX__PARTIAL_ADDRESS, instance.salt, instance.initialisation_hash, instance.deployer_addr
    };
    FF salted_init_hash = poseidon2::hash(salted_init_hash_inputs);

    std::vector<FF> partial_address_inputs = { GENERATOR_INDEX__PARTIAL_ADDRESS,
                                               instance.original_class_id,
                                               salted_init_hash };
    FF partial_address = poseidon2::hash(partial_address_inputs);

    std::vector<FF> public_keys_hash_fields = instance.public_keys.to_fields();
    std::vector<FF> public_key_hash_vec{ GENERATOR_INDEX__PUBLIC_KEYS_HASH };
    for (size_t i = 0; i < public_keys_hash_fields.size(); i += 2) {
        public_key_hash_vec.push_back(public_keys_hash_fields[i]);
        public_key_hash_vec.push_back(public_keys_hash_fields[i + 1]);
        // is_infinity will be removed from address preimage, asumming false.
        public_key_hash_vec.push_back(FF::zero());
    }
    FF public_keys_hash = poseidon2::hash(public_key_hash_vec);

    std::vector<FF> preaddress_inputs = { GENERATOR_INDEX__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address };
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
    EXPECT_THAT(events[0].instance, instance);
    EXPECT_THAT(events[0].address, derived_address);
    EXPECT_THAT(events[0].address_point.x(), derived_address);

    // Second derivation for the same address should be a cache hit and should not emit an event
    address_derivation.assert_derivation(derived_address, instance);
    events = address_derivation_event_emitter.dump_events();
    EXPECT_THAT(events, IsEmpty());
}

} // namespace
} // namespace bb::avm2::simulation
