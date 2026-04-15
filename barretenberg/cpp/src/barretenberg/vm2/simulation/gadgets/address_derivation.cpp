#include "barretenberg/vm2/simulation/gadgets/address_derivation.hpp"

#include <cassert>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Verifies a contract instance's address derivation and emits an AddressDerivationEvent.
 * Corresponds to the subtrace address_derivation.pil.
 *
 * If the address has already been derived, an event has already been emitted and we skip
 * repeating the computation and emission. Otherwise, we compute the address from the instance
 * members using the poseidon2, scalar_mul, and ecc traces, which is given as:
 *   1. salted_init_hash  = Poseidon2(DOM_SEP__PARTIAL_ADDRESS, salt, init_hash, deployer_addr)
 *   2. partial_address   = Poseidon2(DOM_SEP__PARTIAL_ADDRESS, class_id, salted_init_hash)
 *   3. public_keys_hash  = Poseidon2(DOM_SEP__PUBLIC_KEYS_HASH, [...public_keys.to_fields()])
 *   4. preaddress        = Poseidon2(DOM_SEP__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address)
 *   5. preaddress_public_key = preaddress * G1  (Grumpkin scalar multiplication)
 *   6. address           = (preaddress_public_key + incoming_viewing_key).x  (Grumpkin EC add)
 *  and we add the output to the local cache.
 *
 * @throws Unexpected exception if
 *        - the calculated address does not match @p address.
 *
 * @param address The expected derived address.
 * @param instance The contract instance containing the address preimage.
 */
void AddressDerivation::assert_derivation(const AztecAddress& address, const ContractInstance& instance)
{
    // Check if we've already derived this address.
    if (cached_derivations.contains(address)) {
        // Note: it is likely safe to skip this recalculation, but if we do, then a mismatch will throw in the
        // non-cache case and return in the cache case for the same input. No events are emitted either way, so
        // circuit and tracegen behave the same. The below exists just to unify simulation behaviour (#21374).
        BB_ASSERT_EQ(address, simulation::compute_contract_address(instance), "Address derivation mismatch");
        // Already processed this address - cache hit, don't emit event.
        return;
    }

    // First time seeing this address - do the actual derivation.
    // Emits Poseidon2HashEvents and Poseidon2PermutationEvents, see #[SALTED_INITIALIZATION_HASH_POSEIDON2_i] in
    // address_derivation.pil.
    FF salted_initialization_hash =
        poseidon2.hash({ DOM_SEP__PARTIAL_ADDRESS, instance.salt, instance.initialization_hash, instance.deployer });
    // Emits Poseidon2HashEvents and Poseidon2PermutationEvents, see #[PARTIAL_ADDRESS_POSEIDON2] in
    // address_derivation.pil.
    FF partial_address =
        poseidon2.hash({ DOM_SEP__PARTIAL_ADDRESS, instance.original_contract_class_id, salted_initialization_hash });

    std::vector<FF> public_keys_hash_fields = instance.public_keys.to_fields();
    std::vector<FF> public_key_hash_vec{ DOM_SEP__PUBLIC_KEYS_HASH };
    for (size_t i = 0; i < public_keys_hash_fields.size(); i += 2) {
        // Public key x coordinate.
        public_key_hash_vec.push_back(public_keys_hash_fields[i]);
        // Public key y coordinate.
        public_key_hash_vec.push_back(public_keys_hash_fields[i + 1]);
        // TODO(#7529): Public key is_infinity will be removed from address preimage, assuming false.
        public_key_hash_vec.push_back(FF::zero());
    }
    // Emits Poseidon2HashEvents and Poseidon2PermutationEvents, see #[PUBLIC_KEYS_HASH_POSEIDON2_i] in
    // address_derivation.pil.
    FF public_keys_hash = poseidon2.hash(public_key_hash_vec);
    // Emits Poseidon2HashEvents and Poseidon2PermutationEvents, see #[PREADDRESS_POSEIDON2] in address_derivation.pil.
    FF preaddress = poseidon2.hash({ DOM_SEP__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address });

    // Note: the below ecc calls assume points are on the curve. We know preaddress_public_key is (by definition),
    // but it may be possible that incoming_viewing_key is not.
    // The circuit enforces that the point is on the curve to meet ecc's precondition and we replicate this here.
    BB_ASSERT(instance.public_keys.incoming_viewing_key.on_curve(),
              "Incoming viewing key is not on the curve when asserting contract address derivation");

    // Emits ScalarMulEvent and EccAddEvents, see #[PREADDRESS_SCALAR_MUL] in address_derivation.pil.
    EmbeddedCurvePoint preaddress_public_key = ecc.scalar_mul(EmbeddedCurvePoint::one(), preaddress);
    // Emits EccAddEvent, see #[ADDRESS_ECADD] in address_derivation.pil.
    EmbeddedCurvePoint address_point = ecc.add(preaddress_public_key, instance.public_keys.incoming_viewing_key);

    // This will throw an unexpected exception if it fails. If we have reached this point,
    // the contract instance retrieval should have enforced this.
    BB_ASSERT_EQ(address, address_point.x(), "Address derivation mismatch");

    // Cache this derivation so we don't repeat it
    cached_derivations.insert(address);

    // Emits AddressDerivationEvent.
    events.emit({
        .address = address,
        .instance = instance,
        .salted_initialization_hash = salted_initialization_hash,
        .partial_address = partial_address,
        .public_keys_hash = public_keys_hash,
        .preaddress = preaddress,
        .preaddress_public_key = preaddress_public_key,
        .address_point = address_point,
    });
}

} // namespace bb::avm2::simulation
