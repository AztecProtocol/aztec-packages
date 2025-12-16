#include "barretenberg/vm2/tracegen/address_derivation_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_address_derivation.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

void AddressDerivationTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::AddressDerivationEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    EmbeddedCurvePoint g1 = EmbeddedCurvePoint::one();

    uint32_t row = 0;
    for (const auto& event : events) {
        trace.set(
            row,
            { { { C::address_derivation_sel, 1 },
                { C::address_derivation_salt, event.instance.salt },
                { C::address_derivation_deployer_addr, event.instance.deployer_addr },
                { C::address_derivation_class_id, event.instance.original_class_id },
                { C::address_derivation_init_hash, event.instance.initialisation_hash },
                { C::address_derivation_nullifier_key_x, event.instance.public_keys.nullifier_key.x },
                { C::address_derivation_nullifier_key_y, event.instance.public_keys.nullifier_key.y },
                { C::address_derivation_incoming_viewing_key_x, event.instance.public_keys.incoming_viewing_key.x },
                { C::address_derivation_incoming_viewing_key_y, event.instance.public_keys.incoming_viewing_key.y },
                { C::address_derivation_outgoing_viewing_key_x, event.instance.public_keys.outgoing_viewing_key.x },
                { C::address_derivation_outgoing_viewing_key_y, event.instance.public_keys.outgoing_viewing_key.y },
                { C::address_derivation_tagging_key_x, event.instance.public_keys.tagging_key.x },
                { C::address_derivation_tagging_key_y, event.instance.public_keys.tagging_key.y },
                { C::address_derivation_address, event.address },
                { C::address_derivation_salted_init_hash, event.salted_initialization_hash },
                { C::address_derivation_partial_address_domain_separator, GENERATOR_INDEX__PARTIAL_ADDRESS },
                { C::address_derivation_partial_address, event.partial_address },
                { C::address_derivation_public_keys_hash, event.public_keys_hash },
                { C::address_derivation_public_keys_hash_domain_separator, GENERATOR_INDEX__PUBLIC_KEYS_HASH },
                { C::address_derivation_preaddress, event.preaddress },
                { C::address_derivation_preaddress_domain_separator, GENERATOR_INDEX__CONTRACT_ADDRESS_V1 },
                { C::address_derivation_preaddress_public_key_x, event.preaddress_public_key.x() },
                { C::address_derivation_preaddress_public_key_y, event.preaddress_public_key.y() },
                { C::address_derivation_g1_x, g1.x() },
                { C::address_derivation_g1_y, g1.y() },
                { C::address_derivation_address_y, event.address_point.y() } } });
        row++;
    }
}

const InteractionDefinition AddressDerivationTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_address_derivation_salted_initialization_hash_poseidon2_0_settings,
             InteractionType::LookupSequential>()
        .add<lookup_address_derivation_salted_initialization_hash_poseidon2_1_settings,
             InteractionType::LookupSequential>()
        .add<lookup_address_derivation_partial_address_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_address_derivation_public_keys_hash_poseidon2_0_settings, InteractionType::LookupSequential>()
        .add<lookup_address_derivation_public_keys_hash_poseidon2_1_settings, InteractionType::LookupSequential>()
        .add<lookup_address_derivation_public_keys_hash_poseidon2_2_settings, InteractionType::LookupSequential>()
        .add<lookup_address_derivation_public_keys_hash_poseidon2_3_settings, InteractionType::LookupSequential>()
        .add<lookup_address_derivation_public_keys_hash_poseidon2_4_settings, InteractionType::LookupSequential>()
        .add<lookup_address_derivation_preaddress_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_address_derivation_preaddress_scalar_mul_settings, InteractionType::LookupSequential>()
        .add<lookup_address_derivation_address_ecadd_settings, InteractionType::LookupSequential>();

} // namespace bb::avm2::tracegen
