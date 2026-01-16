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

    std::string message_str(reinterpret_cast<const char*>(message.data()), message.size());
    auto sig = crypto::schnorr_construct_signature<crypto::Blake2sHasher, grumpkin::fq>(message_str, key_pair);

    return { sig.s, sig.e };
}

SchnorrVerifySignature::Response SchnorrVerifySignature::execute(BB_UNUSED BBApiRequest& request) &&
{
    std::string message_str(reinterpret_cast<const char*>(message.data()), message.size());
    crypto::schnorr_signature sig = { s, e };

    bool result = crypto::schnorr_verify_signature<crypto::Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(
        message_str, public_key, sig);

    return { result };
}

} // namespace bb::bbapi
