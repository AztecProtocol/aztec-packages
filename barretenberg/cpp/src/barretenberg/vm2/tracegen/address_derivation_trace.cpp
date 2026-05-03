#include "barretenberg/vm2/tracegen/address_derivation_trace.hpp"

#include <memory>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_address_derivation.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Process address derivation events and populate the relevant columns in the trace.
 *  Corresponds to the subtrace address_derivation.pil.
 *
 *  This trace is non memory-aware and does not handle any errors. It relies on the poseidon2,
 *  scalar_mul, and ecc traces to constrain correctness of the address, which is derived as:
 *   1. salted_init_hash  = Poseidon2(DOM_SEP__SALTED_INITIALIZATION_HASH, salt, init_hash, deployer_addr)
 *   2. partial_address   = Poseidon2(DOM_SEP__PARTIAL_ADDRESS, class_id, salted_init_hash)
 *   3. public_keys_hash  = Poseidon2(DOM_SEP__PUBLIC_KEYS_HASH, [...public_keys.to_fields()])
 *   4. preaddress        = Poseidon2(DOM_SEP__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address)
 *   5. preaddress_public_key = preaddress * G1  (Grumpkin scalar multiplication)
 *   6. address           = (preaddress_public_key + incoming_viewing_key).x  (Grumpkin EC add)
 *
 * @param events The container of address derivation events to process.
 * @param trace The trace container.
 */
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
                // Address.
                { C::address_derivation_address, event.address },
                // Contract instance members.
                { C::address_derivation_salt, event.instance.salt },
                { C::address_derivation_deployer_addr, event.instance.deployer },
                { C::address_derivation_class_id, event.instance.original_contract_class_id },
                { C::address_derivation_init_hash, event.instance.initialization_hash },
                // Public keys (Grumpkin curve points).
                { C::address_derivation_nullifier_key_x, event.instance.public_keys.nullifier_key.x },
                { C::address_derivation_nullifier_key_y, event.instance.public_keys.nullifier_key.y },
                { C::address_derivation_incoming_viewing_key_x, event.instance.public_keys.incoming_viewing_key.x },
                { C::address_derivation_incoming_viewing_key_y, event.instance.public_keys.incoming_viewing_key.y },
                { C::address_derivation_outgoing_viewing_key_x, event.instance.public_keys.outgoing_viewing_key.x },
                { C::address_derivation_outgoing_viewing_key_y, event.instance.public_keys.outgoing_viewing_key.y },
                { C::address_derivation_tagging_key_x, event.instance.public_keys.tagging_key.x },
                { C::address_derivation_tagging_key_y, event.instance.public_keys.tagging_key.y },
                // Intermediate hash results.
                { C::address_derivation_salted_init_hash, event.salted_initialization_hash },
                { C::address_derivation_partial_address, event.partial_address },
                { C::address_derivation_public_keys_hash, event.public_keys_hash },
                { C::address_derivation_preaddress, event.preaddress },
                // Intermediate EC results.
                { C::address_derivation_preaddress_public_key_x, event.preaddress_public_key.x() },
                { C::address_derivation_preaddress_public_key_y, event.preaddress_public_key.y() },
                { C::address_derivation_address_y, event.address_point.y() },
                // Constant columns (this is temp because aliasing is not allowed in lookups).
                { C::address_derivation_salted_init_hash_domain_separator, DOM_SEP__SALTED_INITIALIZATION_HASH },
                { C::address_derivation_partial_address_domain_separator, DOM_SEP__PARTIAL_ADDRESS },
                { C::address_derivation_public_keys_hash_domain_separator, DOM_SEP__PUBLIC_KEYS_HASH },
                { C::address_derivation_preaddress_domain_separator, DOM_SEP__CONTRACT_ADDRESS_V1 },
                { C::address_derivation_g1_x, g1.x() },
                { C::address_derivation_g1_y, g1.y() },
                { C::address_derivation_const_two, 2 },
                { C::address_derivation_const_three, 3 },
                { C::address_derivation_const_four, 4 },
                { C::address_derivation_const_thirteen, 13 } } });
        row++;
    }
}

const InteractionDefinition AddressDerivationTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupSequential,
             lookup_address_derivation_salted_initialization_hash_poseidon2_0_settings>()
        .add<InteractionType::LookupSequential,
             lookup_address_derivation_salted_initialization_hash_poseidon2_1_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_partial_address_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_public_keys_hash_poseidon2_0_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_public_keys_hash_poseidon2_1_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_public_keys_hash_poseidon2_2_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_public_keys_hash_poseidon2_3_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_public_keys_hash_poseidon2_4_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_preaddress_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_preaddress_scalar_mul_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_address_ecadd_settings>();

} // namespace bb::avm2::tracegen
