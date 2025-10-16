#include "bbapi_crypto.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb::bbapi {

Poseidon2Hash::Response Poseidon2Hash::execute(BBApiRequest& request) &&
{
    (void)request;
    return { crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs) };
}
} // namespace bb::bbapi
