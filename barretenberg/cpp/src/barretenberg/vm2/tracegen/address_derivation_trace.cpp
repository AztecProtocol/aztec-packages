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
 *  scalar_mul, and ecc traces to constrain correctness of the address. Only the
 *  incoming_viewing_key is held as a Grumpkin point; the other three master public keys are
 *  exposed as their hashes (DOM_SEP__SINGLE_PUBLIC_KEY_HASH). The address is derived as:
 *   1. salted_init_hash          = Poseidon2(DOM_SEP__SALTED_INITIALIZATION_HASH, salt, init_hash, deployer_addr,
 *                                  immutables_hash)
 *   2. partial_address           = Poseidon2(DOM_SEP__PARTIAL_ADDRESS, class_id, salted_init_hash)
 *   3. incoming_viewing_key_hash = Poseidon2(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, ivpk.x, ivpk.y)
 *   4. public_keys_hash          = Poseidon2(DOM_SEP__PUBLIC_KEYS_HASH, npk_hash, ivpk_m_hash, ovpk_hash, tpk_hash)
 *   5. preaddress                = Poseidon2(DOM_SEP__CONTRACT_ADDRESS_V2, public_keys_hash, partial_address)
 *   6. preaddress_public_key     = preaddress * G1  (Grumpkin scalar multiplication)
 *   7. address                   = (preaddress_public_key + incoming_viewing_key).x  (Grumpkin EC add)
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
                { C::address_derivation_immutables_hash, event.instance.immutables_hash },
                // Public keys: only ivpk_m as a point, the other three as hashes.
                { C::address_derivation_nullifier_key_hash, event.instance.public_keys.nullifier_key_hash },
                { C::address_derivation_incoming_viewing_key_x, event.instance.public_keys.incoming_viewing_key.x },
                { C::address_derivation_incoming_viewing_key_y, event.instance.public_keys.incoming_viewing_key.y },
                { C::address_derivation_outgoing_viewing_key_hash,
                  event.instance.public_keys.outgoing_viewing_key_hash },
                { C::address_derivation_tagging_key_hash, event.instance.public_keys.tagging_key_hash },
                // Intermediate hash results.
                { C::address_derivation_salted_init_hash, event.salted_initialization_hash },
                { C::address_derivation_partial_address, event.partial_address },
                { C::address_derivation_incoming_viewing_key_hash, event.incoming_viewing_key_hash },
                { C::address_derivation_public_keys_hash, event.public_keys_hash },
                { C::address_derivation_preaddress, event.preaddress },
                // Intermediate EC results.
                { C::address_derivation_preaddress_public_key_x, event.preaddress_public_key.x() },
                { C::address_derivation_preaddress_public_key_y, event.preaddress_public_key.y() },
                { C::address_derivation_address_y, event.address_point.y() },
                // Constant columns (this is temp because aliasing is not allowed in lookups).
                { C::address_derivation_salted_init_hash_domain_separator, DOM_SEP__SALTED_INITIALIZATION_HASH },
                { C::address_derivation_partial_address_domain_separator, DOM_SEP__PARTIAL_ADDRESS },
                { C::address_derivation_single_public_key_hash_domain_separator, DOM_SEP__SINGLE_PUBLIC_KEY_HASH },
                { C::address_derivation_public_keys_hash_domain_separator, DOM_SEP__PUBLIC_KEYS_HASH },
                { C::address_derivation_preaddress_domain_separator, DOM_SEP__CONTRACT_ADDRESS_V2 },
                { C::address_derivation_g1_x, g1.x() },
                { C::address_derivation_g1_y, g1.y() },
                { C::address_derivation_const_three, 3 },
                { C::address_derivation_const_five, 5 } } });
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
        .add<InteractionType::LookupSequential, lookup_address_derivation_ivpk_m_hash_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_public_keys_hash_poseidon2_0_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_public_keys_hash_poseidon2_1_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_preaddress_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_preaddress_scalar_mul_settings>()
        .add<InteractionType::LookupSequential, lookup_address_derivation_address_ecadd_settings>();

} // namespace bb::avm2::tracegen
