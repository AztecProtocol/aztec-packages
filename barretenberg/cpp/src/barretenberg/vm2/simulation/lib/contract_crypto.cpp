#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/aztec/contract_hashing.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"

namespace bb::avm2::simulation {

using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

std::vector<FF> encode_bytecode(std::span<const uint8_t> bytecode)
{
    return aztec::encode_bytecode(bytecode);
}

FF compute_public_bytecode_first_field(size_t bytecode_size)
{
    return aztec::compute_public_bytecode_first_field(bytecode_size);
}

FF compute_public_bytecode_commitment(std::span<const uint8_t> bytecode)
{
    return aztec::compute_public_bytecode_commitment(bytecode);
}

FF compute_contract_class_id(const FF& artifact_hash, const FF& private_fn_root, const FF& public_bytecode_commitment)
{
    return aztec::compute_contract_class_id(artifact_hash, private_fn_root, public_bytecode_commitment);
}

// public_keys_hash combines the six hashes (with the ivpk_m one computed in-circuit
// from its (x, y) coordinates) under DOM_SEP__PUBLIC_KEYS_HASH.
FF hash_public_keys(const PublicKeys& public_keys)
{
    FF incoming_viewing_key_hash = poseidon2::hash(
        { DOM_SEP__SINGLE_PUBLIC_KEY_HASH, public_keys.incoming_viewing_key.x, public_keys.incoming_viewing_key.y });
    return poseidon2::hash({ DOM_SEP__PUBLIC_KEYS_HASH,
                             public_keys.nullifier_key_hash,
                             incoming_viewing_key_hash,
                             public_keys.outgoing_viewing_key_hash,
                             public_keys.tagging_key_hash,
                             public_keys.message_signing_key_hash,
                             public_keys.fallback_key_hash });
}

// Computes a contract instance's derived address. Follows method of AddressDerivation::assert_derivation() (noir's
// AztecAddress::compute()).
FF compute_contract_address(const ContractInstance& contract_instance)
{
    FF salted_initialization_hash = poseidon2::hash({ DOM_SEP__SALTED_INITIALIZATION_HASH,
                                                      contract_instance.salt,
                                                      contract_instance.initialization_hash,
                                                      contract_instance.deployer,
                                                      contract_instance.immutables_hash });
    FF partial_address = poseidon2::hash(
        { DOM_SEP__PARTIAL_ADDRESS, contract_instance.original_contract_class_id, salted_initialization_hash });

    FF public_keys_hash = hash_public_keys(contract_instance.public_keys);
    FF h = poseidon2::hash({ DOM_SEP__CONTRACT_ADDRESS_V3, public_keys_hash, partial_address });
    // This is safe since BN254_Fr < GRUMPKIN_Fr so we know there is no modulo reduction
    grumpkin::fr h_fq = grumpkin::fr(h);
    BB_ASSERT(contract_instance.public_keys.incoming_viewing_key.on_curve(),
              "Incoming viewing key is not on the curve when computing contract address");
    return (grumpkin::g1::affine_one * h_fq + contract_instance.public_keys.incoming_viewing_key).x;
}

FF compute_calldata_hash(std::span<const FF> calldata)
{
    std::vector<FF> calldata_with_sep = { DOM_SEP__PUBLIC_CALLDATA };
    for (const auto& value : calldata) {
        // Note: Using `insert` breaks GCC.
        calldata_with_sep.push_back(value);
    }
    return poseidon2::hash(calldata_with_sep);
}

} // namespace bb::avm2::simulation
