#include "bbapi_crypto.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb::bbapi {

Poseidon2Hash::Response Poseidon2Hash::execute(const BBApiRequest&) &&
{
    using Params = crypto::Poseidon2Bn254ScalarFieldParams;
    using FF = Params::FF;

    // Convert uint256_t inputs to field elements
    std::vector<FF> field_inputs;
    field_inputs.reserve(inputs.size());

    for (const auto& input_uint : inputs) {
        field_inputs.push_back(FF(input_uint));
    }

    // Compute hash
    FF hash_result = crypto::Poseidon2<Params>::hash(field_inputs);

    // Return hash as uint256_t
    return { .hash = uint256_t(hash_result) };
}

} // namespace bb::bbapi
