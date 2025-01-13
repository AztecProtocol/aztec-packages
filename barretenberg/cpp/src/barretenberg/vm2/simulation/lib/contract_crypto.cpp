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

} // namespace bb::avm2::simulation