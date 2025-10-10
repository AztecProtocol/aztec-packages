/**
 * @file bbapi_crypto.cpp
 * @brief Implementation of cryptographic command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb::bbapi {

Poseidon2Hash::Response Poseidon2Hash::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    // Deserialize input field elements
    std::vector<fr> to_hash;
    to_hash.reserve(inputs.size());

    for (const auto& input_bytes : inputs) {
        if (input_bytes.size() != 32) {
            throw_or_abort("Invalid field element size. Expected 32 bytes.");
        }
        fr field_element = fr::serialize_from_buffer(input_bytes.data());
        to_hash.push_back(field_element);
    }

    // Compute hash
    auto result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(to_hash);

    // Serialize result
    Response response;
    response.hash.resize(32);
    fr::serialize_to_buffer(result, response.hash.data());

    return response;
}

} // namespace bb::bbapi
