#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"

namespace bb::avm2::simulation {

using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

/**
 * @brief Encodes the @p bytecode into a vector of field elements. Each field element represents
 *        31 bytes of the @p bytecode. The field encoding is performed in big-endian order, i.e.,
 *        the ith field element is
 *        2^240 * bytecode[31*i] + 2^232 * bytecode[31*i + 1] + ... + 2^8 * bytecode[31*i + 30] + bytecode[31*i + 31].
 * @note This function follows TS `bufferAsFields`.
 *
 * @param bytecode The bytecode to encode.
 * @return std::vector<FF> The encoded bytecode.
 */
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
        // We can pack only 31 bytes per field but as we deserialized 32 bytes (uint256_t)
        // we need to shift by 8 bits to get the correct value.
        return FF(as_int >> 8);
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

// Takes the size of the bytecode in bytes and computes the field prepended to the public bytecode
// commitment hash.
FF compute_public_bytecode_first_field(size_t bytecode_size)
{
    // Note: Shifting by 32 (4 bytes). This value was chosen to keep the value of the first field small, avoiding having
    // to change types further down the stack. The maximum first field is currently:
    // Fr<0x00000000000000000000000000000000000000000000000000016b480f8411f1> From: max fields in bytes = 3000 * 31 =
    // 16b48, Dom sep = f8411f1
    static_assert(DOM_SEP__PUBLIC_BYTECODE <= UINT32_MAX, "Public bytecode domain separator must fit in 32 bits");
    return FF(uint256_t(DOM_SEP__PUBLIC_BYTECODE) + uint256_t(bytecode_size << 32));
}

FF compute_public_bytecode_commitment(std::span<const uint8_t> bytecode)
{
    std::vector<FF> inputs = { compute_public_bytecode_first_field(bytecode.size()) };
    auto bytecode_as_fields = encode_bytecode(bytecode);
    inputs.insert(inputs.end(), bytecode_as_fields.begin(), bytecode_as_fields.end());
    return poseidon2::hash(inputs);
}

FF compute_contract_class_id(const FF& artifact_hash, const FF& private_fn_root, const FF& public_bytecode_commitment)
{
    return poseidon2::hash({ DOM_SEP__CONTRACT_CLASS_ID, artifact_hash, private_fn_root, public_bytecode_commitment });
}

// public_keys_hash combines the four hashes (with the ivpk_m one computed in-circuit
// from its (x, y) coordinates) under DOM_SEP__PUBLIC_KEYS_HASH.
FF hash_public_keys(const PublicKeys& public_keys)
{
    FF incoming_viewing_key_hash = poseidon2::hash(
        { DOM_SEP__SINGLE_PUBLIC_KEY_HASH, public_keys.incoming_viewing_key.x, public_keys.incoming_viewing_key.y });
    return poseidon2::hash({ DOM_SEP__PUBLIC_KEYS_HASH,
                             public_keys.nullifier_key_hash,
                             incoming_viewing_key_hash,
                             public_keys.outgoing_viewing_key_hash,
                             public_keys.tagging_key_hash });
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
    FF h = poseidon2::hash({ DOM_SEP__CONTRACT_ADDRESS_V2, public_keys_hash, partial_address });
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
