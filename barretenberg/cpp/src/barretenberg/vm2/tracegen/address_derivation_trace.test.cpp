#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/address_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::testing::ElementsAre;

using R = TestTraceContainer::Row;

TEST(AddressDerivationTraceGenTest, TraceGeneration)
{
    TestTraceContainer trace;
    AddressDerivationTraceBuilder builder;

    ContractInstance instance = testing::random_contract_instance();

    EmbeddedCurvePoint preaddress_public_key = EmbeddedCurvePoint::one() * Fq(56);
    EmbeddedCurvePoint address_point = EmbeddedCurvePoint::one() * Fq(67);

    simulation::AddressDerivationEvent addr_event{ .address = FF(0xdeadbeef),
                                                   .instance = instance,
                                                   .salted_initialization_hash = FF(12),
                                                   .partial_address = FF(23),
                                                   .incoming_viewing_key_hash = FF(56),
                                                   .public_keys_hash = FF(34),
                                                   .preaddress = FF(45),
                                                   .preaddress_public_key = preaddress_public_key,
                                                   .address_point = address_point };
    builder.process({ { addr_event } }, trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            // Only one row.
            AllOf(
                ROW_FIELD_EQ(address_derivation_sel, 1),
                ROW_FIELD_EQ(address_derivation_address, FF(0xdeadbeef)),
                ROW_FIELD_EQ(address_derivation_salt, instance.salt),
                ROW_FIELD_EQ(address_derivation_deployer_addr, instance.deployer),
                ROW_FIELD_EQ(address_derivation_class_id, instance.original_contract_class_id),
                ROW_FIELD_EQ(address_derivation_init_hash, instance.initialization_hash),
                ROW_FIELD_EQ(address_derivation_immutables_hash, instance.immutables_hash),
                ROW_FIELD_EQ(address_derivation_nullifier_key_hash, instance.public_keys.nullifier_key_hash),
                ROW_FIELD_EQ(address_derivation_incoming_viewing_key_x, instance.public_keys.incoming_viewing_key.x),
                ROW_FIELD_EQ(address_derivation_incoming_viewing_key_y, instance.public_keys.incoming_viewing_key.y),
                ROW_FIELD_EQ(address_derivation_outgoing_viewing_key_hash,
                             instance.public_keys.outgoing_viewing_key_hash),
                ROW_FIELD_EQ(address_derivation_tagging_key_hash, instance.public_keys.tagging_key_hash),
                ROW_FIELD_EQ(address_derivation_message_signing_key_hash,
                             instance.public_keys.message_signing_key_hash),
                ROW_FIELD_EQ(address_derivation_fallback_key_hash, instance.public_keys.fallback_key_hash),
                ROW_FIELD_EQ(address_derivation_salted_init_hash, FF(12)),
                ROW_FIELD_EQ(address_derivation_partial_address, FF(23)),
                ROW_FIELD_EQ(address_derivation_incoming_viewing_key_hash, FF(56)),
                ROW_FIELD_EQ(address_derivation_public_keys_hash, FF(34)),
                ROW_FIELD_EQ(address_derivation_preaddress, FF(45)),
                ROW_FIELD_EQ(address_derivation_preaddress_public_key_x, preaddress_public_key.x()),
                ROW_FIELD_EQ(address_derivation_preaddress_public_key_y, preaddress_public_key.y()),
                ROW_FIELD_EQ(address_derivation_address_y, address_point.y()),
                ROW_FIELD_EQ(address_derivation_salted_init_hash_domain_separator, DOM_SEP__SALTED_INITIALIZATION_HASH),
                ROW_FIELD_EQ(address_derivation_partial_address_domain_separator, DOM_SEP__PARTIAL_ADDRESS),
                ROW_FIELD_EQ(address_derivation_single_public_key_hash_domain_separator,
                             DOM_SEP__SINGLE_PUBLIC_KEY_HASH),
                ROW_FIELD_EQ(address_derivation_public_keys_hash_domain_separator, DOM_SEP__PUBLIC_KEYS_HASH),
                ROW_FIELD_EQ(address_derivation_preaddress_domain_separator, DOM_SEP__CONTRACT_ADDRESS_V2),
                ROW_FIELD_EQ(address_derivation_g1_x, EmbeddedCurvePoint::one().x()),
                ROW_FIELD_EQ(address_derivation_g1_y, EmbeddedCurvePoint::one().y()),
                ROW_FIELD_EQ(address_derivation_const_two, 2),
                ROW_FIELD_EQ(address_derivation_const_three, 3),
                ROW_FIELD_EQ(address_derivation_const_five, 5),
                ROW_FIELD_EQ(address_derivation_const_seven, 7))));
}

} // namespace
} // namespace bb::avm2::tracegen
