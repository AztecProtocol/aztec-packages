/**
 * @file bbapi_ecdsa.cpp
 * @brief Implementation of ECDSA signature command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_ecdsa.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

namespace bb::bbapi {

// Secp256k1 implementations
BbEcdsaSecp256k1ComputePublicKey::Response BbEcdsaSecp256k1ComputePublicKey::execute(BB_UNUSED BbRequest& request) &&
{
    return { secp256k1::g1::one * private_key };
}

BbEcdsaSecp256k1ConstructSignature::Response BbEcdsaSecp256k1ConstructSignature::execute(
    BB_UNUSED BbRequest& request) &&
{
    auto pub_key = secp256k1::g1::one * private_key;
    crypto::ecdsa_key_pair<secp256k1::fr, secp256k1::g1> key_pair = { private_key, pub_key };

    std::string message_str(reinterpret_cast<const char*>(message.data()), message.size());
    auto sig = crypto::ecdsa_construct_signature<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, key_pair);

    return { sig.r, sig.s, sig.v };
}

BbEcdsaSecp256k1RecoverPublicKey::Response BbEcdsaSecp256k1RecoverPublicKey::execute(BB_UNUSED BbRequest& request) &&
{
    crypto::ecdsa_signature sig = { r, s, v };
    std::string message_str(reinterpret_cast<const char*>(message.data()), message.size());
    return { crypto::ecdsa_recover_public_key<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, sig) };
}

BbEcdsaSecp256k1VerifySignature::Response BbEcdsaSecp256k1VerifySignature::execute(BB_UNUSED BbRequest& request) &&
{
    crypto::ecdsa_signature sig = { r, s, v };
    std::string message_str(reinterpret_cast<const char*>(message.data()), message.size());
    return { crypto::ecdsa_verify_signature<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, public_key, sig) };
}

// Secp256r1 implementations
BbEcdsaSecp256r1ComputePublicKey::Response BbEcdsaSecp256r1ComputePublicKey::execute(BB_UNUSED BbRequest& request) &&
{
    return { secp256r1::g1::one * private_key };
}

BbEcdsaSecp256r1ConstructSignature::Response BbEcdsaSecp256r1ConstructSignature::execute(
    BB_UNUSED BbRequest& request) &&
{
    auto pub_key = secp256r1::g1::one * private_key;
    crypto::ecdsa_key_pair<secp256r1::fr, secp256r1::g1> key_pair = { private_key, pub_key };

    std::string message_str(reinterpret_cast<const char*>(message.data()), message.size());
    auto sig = crypto::ecdsa_construct_signature<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, key_pair);

    return { sig.r, sig.s, sig.v };
}

BbEcdsaSecp256r1RecoverPublicKey::Response BbEcdsaSecp256r1RecoverPublicKey::execute(BB_UNUSED BbRequest& request) &&
{
    crypto::ecdsa_signature sig = { r, s, v };
    std::string message_str(reinterpret_cast<const char*>(message.data()), message.size());
    return { crypto::ecdsa_recover_public_key<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, sig) };
}

BbEcdsaSecp256r1VerifySignature::Response BbEcdsaSecp256r1VerifySignature::execute(BB_UNUSED BbRequest& request) &&
{
    crypto::ecdsa_signature sig = { r, s, v };
    std::string message_str(reinterpret_cast<const char*>(message.data()), message.size());
    return { crypto::ecdsa_verify_signature<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, public_key, sig) };
}

} // namespace bb::bbapi
