/**
 * @file bbapi_crypto.cpp
 * @brief Implementation of cryptographic command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"

namespace bb::bbapi {

Poseidon2Hash::Response Poseidon2Hash::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs) };
}

Poseidon2Permutation::Response Poseidon2Permutation::execute(BB_UNUSED BBApiRequest& request) &&
{
    using Permutation = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;

    // inputs is already std::array<fr, 4>, direct use
    return { Permutation::permutation(inputs) };
}

Poseidon2HashAccumulate::Response Poseidon2HashAccumulate::execute(BB_UNUSED BBApiRequest& request) &&
{
    if (inputs.empty()) {
        throw_or_abort("Poseidon2HashAccumulate requires at least one input");
    }

    fr result = inputs[0];
    for (size_t i = 1; i < inputs.size(); ++i) {
        result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ inputs[i], result });
    }

    return { result };
}

PedersenCommit::Response PedersenCommit::execute(BB_UNUSED BBApiRequest& request) &&
{
    crypto::GeneratorContext<curve::Grumpkin> ctx;
    ctx.offset = static_cast<size_t>(hash_index);
    return { crypto::pedersen_commitment::commit_native(inputs, ctx) };
}

PedersenHash::Response PedersenHash::execute(BB_UNUSED BBApiRequest& request) &&
{
    crypto::GeneratorContext<curve::Grumpkin> ctx;
    ctx.offset = static_cast<size_t>(hash_index);
    return { crypto::pedersen_hash::hash(inputs, ctx) };
}

PedersenHashBuffer::Response PedersenHashBuffer::execute(BB_UNUSED BBApiRequest& request) &&
{
    crypto::GeneratorContext<curve::Grumpkin> ctx;
    ctx.offset = static_cast<size_t>(hash_index);
    return { crypto::pedersen_hash::hash_buffer(input, ctx) };
}

Blake2s::Response Blake2s::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { crypto::blake2s(data) };
}

Blake2sToField::Response Blake2sToField::execute(BB_UNUSED BBApiRequest& request) &&
{
    auto hash_result = crypto::blake2s(data);
    return { fr::serialize_from_buffer(hash_result.data()) };
}

AesEncrypt::Response AesEncrypt::execute(BB_UNUSED BBApiRequest& request) &&
{
    // Copy plaintext as AES encrypts in-place
    std::vector<uint8_t> result = plaintext;
    result.resize(length);

    crypto::aes128_encrypt_buffer_cbc(result.data(), iv.data(), key.data(), length);

    return { std::move(result) };
}

AesDecrypt::Response AesDecrypt::execute(BB_UNUSED BBApiRequest& request) &&
{
    // Copy ciphertext as AES decrypts in-place
    std::vector<uint8_t> result = ciphertext;
    result.resize(length);

    crypto::aes128_decrypt_buffer_cbc(result.data(), iv.data(), key.data(), length);

    return { std::move(result) };
}

} // namespace bb::bbapi
