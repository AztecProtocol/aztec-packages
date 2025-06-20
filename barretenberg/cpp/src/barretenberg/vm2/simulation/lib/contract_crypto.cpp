#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2::simulation {

using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

std::vector<FF> encode_bytecode(std::span<const uint8_t> bytecode)
{
    size_t bytecode_len = bytecode.size();

    auto bytecode_field_at = [&](size_t i) -> FF {
        // We need to read uint256_ts because reading FFs messes up the order of the bytes.
        uint256_t as_int = 0;
        if (bytecode_len - i >= 32) {
            as_int = from_buffer<uint256_t>(bytecode, i);
        } else {
            std::vector<uint8_t> tail(bytecode.begin() + static_cast<ssize_t>(i), bytecode.end());
            tail.resize(32, 0);
            as_int = from_buffer<uint256_t>(tail, 0);
        }
        return as_int >> 8;
    };

    std::vector<FF> contract_bytecode_fields;
    auto number_of_fields = (bytecode_len + 30) / 31;
    contract_bytecode_fields.reserve(number_of_fields);

    for (uint32_t i = 0; i < bytecode_len; i += 31) {
        FF bytecode_field = bytecode_field_at(i);
        contract_bytecode_fields.push_back(bytecode_field);
    }

    return contract_bytecode_fields;
}

FF compute_public_bytecode_commitment(std::span<const uint8_t> bytecode)
{
    std::vector<FF> inputs = { GENERATOR_INDEX__PUBLIC_BYTECODE };
    auto bytecode_as_fields = encode_bytecode(bytecode);
    inputs.insert(inputs.end(), bytecode_as_fields.begin(), bytecode_as_fields.end());
    return poseidon2::hash(inputs);
}

FF compute_contract_class_id(const FF& artifact_hash, const FF& private_fn_root, const FF& public_bytecode_commitment)
{
    return poseidon2::hash(
        { GENERATOR_INDEX__CONTRACT_LEAF, artifact_hash, private_fn_root, public_bytecode_commitment });
}

FF hash_public_keys(const PublicKeys& public_keys)
{
    std::vector<FF> public_keys_hash_fields = public_keys.to_fields();

    std::vector<FF> public_key_hash_vec{ GENERATOR_INDEX__PUBLIC_KEYS_HASH };
    for (size_t i = 0; i < public_keys_hash_fields.size(); i += 2) {
        public_key_hash_vec.push_back(public_keys_hash_fields[i]);
        public_key_hash_vec.push_back(public_keys_hash_fields[i + 1]);
        // is_infinity will be removed from address preimage, asumming false.
        public_key_hash_vec.push_back(FF::zero());
    }
    return poseidon2::hash({ public_key_hash_vec });
}

FF compute_contract_address(const ContractInstance& contract_instance)
{
    FF salted_initialization_hash = poseidon2::hash({ GENERATOR_INDEX__PARTIAL_ADDRESS,
                                                      contract_instance.salt,
                                                      contract_instance.initialisation_hash,
                                                      contract_instance.deployer_addr });
    FF partial_address = poseidon2::hash(
        { GENERATOR_INDEX__PARTIAL_ADDRESS, contract_instance.original_class_id, salted_initialization_hash });

    FF public_keys_hash = hash_public_keys(contract_instance.public_keys);
    FF h = poseidon2::hash({ GENERATOR_INDEX__CONTRACT_ADDRESS_V1, public_keys_hash, partial_address });
    // This is safe since BN254_Fr < GRUMPKIN_Fr so we know there is no modulo reduction
    grumpkin::fr h_fq = grumpkin::fr(h);
    return (grumpkin::g1::affine_one * h_fq + contract_instance.public_keys.incoming_viewing_key).x;
}

} // namespace bb::avm2::simulation
