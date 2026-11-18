#pragma once

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <cstdint>
#include <span>
#include <vector>

namespace bb::aztec {

/**
 * @brief Encodes @p bytecode as field elements of 31 big-endian bytes each, the last one zero-padded on the right
 *        (TS `bufferAsFields`).
 */
inline std::vector<fr> encode_bytecode(std::span<const uint8_t> bytecode)
{
    std::vector<fr> fields;
    fields.reserve((bytecode.size() + 30) / 31);
    for (size_t i = 0; i < bytecode.size(); i += 31) {
        // Read 32 bytes as a big-endian uint256_t and drop the last one, which belongs to the next field.
        std::array<uint8_t, 32> chunk{};
        std::copy_n(bytecode.begin() + static_cast<std::ptrdiff_t>(i),
                    std::min<size_t>(32, bytecode.size() - i),
                    chunk.begin());
        fields.emplace_back(from_buffer<uint256_t>(chunk, 0) >> 8);
    }
    return fields;
}

/**
 * @brief The field prepended to the public bytecode commitment preimage: the domain separator plus the bytecode length
 *        in bytes shifted by 32, which keeps it small.
 */
inline fr compute_public_bytecode_first_field(size_t bytecode_size)
{
    static_assert(DOM_SEP__PUBLIC_BYTECODE <= UINT32_MAX, "Public bytecode domain separator must fit in 32 bits");
    return fr(uint256_t(DOM_SEP__PUBLIC_BYTECODE) + (uint256_t(bytecode_size) << 32));
}

inline fr compute_public_bytecode_commitment(std::span<const uint8_t> bytecode)
{
    std::vector<fr> inputs = { compute_public_bytecode_first_field(bytecode.size()) };
    auto fields = encode_bytecode(bytecode);
    inputs.insert(inputs.end(), fields.begin(), fields.end());
    return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs);
}

inline fr compute_contract_class_id(const fr& artifact_hash,
                                    const fr& private_functions_root,
                                    const fr& public_bytecode_commitment)
{
    return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
        { DOM_SEP__CONTRACT_CLASS_ID, artifact_hash, private_functions_root, public_bytecode_commitment });
}

inline fr silo_nullifier(const fr& contract_address, const fr& nullifier)
{
    return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
        { DOM_SEP__SILOED_NULLIFIER, contract_address, nullifier });
}

} // namespace bb::aztec
