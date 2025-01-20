#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm/aztec_constants.hpp"

namespace bb::avm2::simulation {

using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

FF compute_public_bytecode_commitment(std::span<const uint8_t> bytecode)
{
    auto encode_bytecode = [](std::span<const uint8_t> contract_bytes) -> std::vector<FF> {
        // To make from_buffer<uint256_t> work properly, we need to make sure the contract is a multiple of 31 bytes
        // Otherwise we will end up over-reading the buffer
        size_t padded_size = 31 * ((contract_bytes.size() + 30) / 31);
        // We dont want to mutate the original contract bytes, since we will (probably) need them later in the trace
        // unpadded
        std::vector<uint8_t> contract_bytes_padded(contract_bytes.begin(), contract_bytes.end());
        contract_bytes_padded.resize(padded_size, 0);
        std::vector<FF> contract_bytecode_fields;
        for (size_t i = 0; i < contract_bytes_padded.size(); i += 31) {
            uint256_t u256_elem = from_buffer<uint256_t>(contract_bytes_padded, i);
            // Drop the last byte
            contract_bytecode_fields.emplace_back(u256_elem >> 8);
        }
        return contract_bytecode_fields;
    };

    std::vector<FF> contract_bytecode_fields = encode_bytecode(bytecode);
    FF running_hash = 0;
    for (const auto& contract_bytecode_field : contract_bytecode_fields) {
        running_hash = poseidon2::hash({ contract_bytecode_field, running_hash });
    }
    return running_hash;
}

FF compute_contract_class_id(const FF& artifact_hash, const FF& private_fn_root, const FF& public_bytecode_commitment)
{
    return poseidon2::hash(
        { GENERATOR_INDEX__CONTRACT_LEAF, artifact_hash, private_fn_root, public_bytecode_commitment });
}

FF compute_contract_address(const ContractInstance& contract_instance)
{
    FF salted_initialization_hash = poseidon2::hash({ GENERATOR_INDEX__PARTIAL_ADDRESS,
                                                      contract_instance.salt,
                                                      contract_instance.initialisation_hash,
                                                      contract_instance.deployer_addr });
    FF partial_address = poseidon2::hash(
        { GENERATOR_INDEX__PARTIAL_ADDRESS, contract_instance.contract_class_id, salted_initialization_hash });

    std::vector<FF> public_keys_hash_fields = contract_instance.public_keys.to_fields();
    std::vector<FF> public_key_hash_vec{ GENERATOR_INDEX__PUBLIC_KEYS_HASH };
    for (size_t i = 0; i < public_keys_hash_fields.size(); i += 2) {
        public_key_hash_vec.push_back(public_keys_hash_fields[i]);
        public_key_hash_vec.push_back(public_keys_hash_fields[i + 1]);
        // Is it guaranteed we wont get a point at infinity here?
        public_key_hash_vec.push_back(FF::zero());
    }
    FF public_keys_hash = poseidon2::hash({ public_key_hash_vec });

    FF h = poseidon2::hash({ GENERATOR_INDEX__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address });
    // This is safe since BN254_Fr < GRUMPKIN_Fr so we know there is no modulo reduction
    grumpkin::fr h_fq = grumpkin::fr(h);
    return (grumpkin::g1::affine_one * h_fq + contract_instance.public_keys.incoming_viewing_key).x;
}

} // namespace bb::avm2::simulation