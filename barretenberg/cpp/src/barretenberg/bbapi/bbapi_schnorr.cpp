/**
 * @file bbapi_schnorr.cpp
 * @brief Implementation of Schnorr signature command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_schnorr.hpp"

namespace bb::bbapi {

SchnorrComputePublicKey::Response SchnorrComputePublicKey::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { grumpkin::g1::one * private_key };
}

SchnorrConstructSignature::Response SchnorrConstructSignature::execute(BB_UNUSED BBApiRequest& request) &&
{
    grumpkin::g1::affine_element pub_key = grumpkin::g1::one * private_key;
    crypto::schnorr_key_pair<grumpkin::fr, grumpkin::g1> key_pair = { private_key, pub_key };

    auto sig = crypto::schnorr_construct_signature<grumpkin::fr, grumpkin::g1>(message_field, key_pair);
    crypto::secure_erase_bytes(&key_pair.private_key, sizeof(key_pair.private_key));

    return { sig.s, sig.e };
}

SchnorrVerifySignature::Response SchnorrVerifySignature::execute(BB_UNUSED BBApiRequest& request) &&
{
    crypto::schnorr_signature sig = { s, e };

    bool result = crypto::schnorr_verify_signature<grumpkin::fr, grumpkin::g1>(message_field, public_key, sig);

    return { result };
}

} // namespace bb::bbapi
