#include "barretenberg/vm2/simulation/address_derivation.hpp"

#include <cassert>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

void AddressDerivation::assert_derivation(const AztecAddress& address, const ContractInstance& instance)
{
    // TODO: Cache and deduplicate.
    FF salted_initialization_hash = poseidon2.hash(
        { GENERATOR_INDEX__PARTIAL_ADDRESS, instance.salt, instance.initialisation_hash, instance.deployer_addr });

    FF partial_address =
        poseidon2.hash({ GENERATOR_INDEX__PARTIAL_ADDRESS, instance.original_class_id, salted_initialization_hash });

    std::vector<FF> public_keys_hash_fields = instance.public_keys.to_fields();
    std::vector<FF> public_key_hash_vec{ GENERATOR_INDEX__PUBLIC_KEYS_HASH };
    for (size_t i = 0; i < public_keys_hash_fields.size(); i += 2) {
        public_key_hash_vec.push_back(public_keys_hash_fields[i]);
        public_key_hash_vec.push_back(public_keys_hash_fields[i + 1]);
        // is_infinity will be removed from address preimage, asumming false.
        public_key_hash_vec.push_back(FF::zero());
    }
    FF public_keys_hash = poseidon2.hash(public_key_hash_vec);

    FF preaddress = poseidon2.hash({ GENERATOR_INDEX__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address });

    EmbeddedCurvePoint preaddress_public_key = ecc.scalar_mul(EmbeddedCurvePoint::one(), preaddress);
    EmbeddedCurvePoint address_point = ecc.add(preaddress_public_key, instance.public_keys.incoming_viewing_key);

    assert(address == address_point.x());

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
