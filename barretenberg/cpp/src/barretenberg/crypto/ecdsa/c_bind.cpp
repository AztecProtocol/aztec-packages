// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "ecdsa.hpp"
#include <barretenberg/ecc/curves/secp256k1/secp256k1.hpp>
#include <barretenberg/ecc/curves/secp256r1/secp256r1.hpp>

using namespace bb;
using namespace bb::crypto;

template <typename fr, typename g1> void ecdsa__compute_public_key(uint8_t const* private_key, uint8_t* public_key_buf)
{
    auto priv_key = from_buffer<fr>(private_key);
    typename g1::affine_element pub_key = g1::one * priv_key;
    write(public_key_buf, pub_key);
}

WASM_EXPORT void ecdsa__compute_public_key(uint8_t const* private_key, uint8_t* public_key_buf)
{
    ecdsa__compute_public_key<secp256k1::fr, secp256k1::g1>(private_key, public_key_buf);
}

WASM_EXPORT void ecdsa_r_compute_public_key(uint8_t const* private_key, uint8_t* public_key_buf)
{
    ecdsa__compute_public_key<secp256r1::fr, secp256r1::g1>(private_key, public_key_buf);
}

template <typename fr, typename fq, typename g1>
void ecdsa__construct_signature(uint8_t const* message,
                                size_t msg_len,
                                uint8_t const* private_key,
                                uint8_t* output_sig_r,
                                uint8_t* output_sig_s,
                                uint8_t* output_sig_v)
{
    using serialize::write;
    auto priv_key = from_buffer<fr>(private_key);
    auto pub_key = g1::one * priv_key;
    ecdsa_key_pair<fr, g1> key_pair = { priv_key, pub_key };

    auto sig = ecdsa_construct_signature<Sha256Hasher, fq, fr, g1>(std::string((char*)message, msg_len), key_pair);
    write(output_sig_r, sig.r);
    write(output_sig_s, sig.s);
    write(output_sig_v, sig.v);
}

WASM_EXPORT void ecdsa__construct_signature(uint8_t const* message,
                                            size_t msg_len,
                                            uint8_t const* private_key,
                                            uint8_t* output_sig_r,
                                            uint8_t* output_sig_s,
                                            uint8_t* output_sig_v)
{
    ecdsa__construct_signature<secp256k1::fr, secp256k1::fq, secp256k1::g1>(
        message, msg_len, private_key, output_sig_r, output_sig_s, output_sig_v);
}

WASM_EXPORT void ecdsa_r_construct_signature(uint8_t const* message,
                                             size_t msg_len,
                                             uint8_t const* private_key,
                                             uint8_t* output_sig_r,
                                             uint8_t* output_sig_s,
                                             uint8_t* output_sig_v)
{
    ecdsa__construct_signature<secp256r1::fr, secp256r1::fq, secp256r1::g1>(
        message, msg_len, private_key, output_sig_r, output_sig_s, output_sig_v);
}

template <typename fr, typename fq, typename g1>
void ecdsa__construct_signature_(uint8_t const* message_buf,
                                 uint8_t const* private_key,
                                 uint8_t* output_sig_r,
                                 uint8_t* output_sig_s,
                                 uint8_t* output_sig_v)
{
    using serialize::write;
    auto priv_key = from_buffer<fr>(private_key);
    auto pub_key = g1::one * priv_key;
    ecdsa_key_pair<fr, g1> key_pair = { priv_key, pub_key };

    auto message = from_buffer<std::string>(message_buf);

    auto sig = ecdsa_construct_signature<Sha256Hasher, fq, fr, g1>(message, key_pair);
    write(output_sig_r, sig.r);
    write(output_sig_s, sig.s);
    write(output_sig_v, sig.v);
}

WASM_EXPORT void ecdsa__construct_signature_(uint8_t const* message_buf,
                                             uint8_t const* private_key,
                                             uint8_t* output_sig_r,
                                             uint8_t* output_sig_s,
                                             uint8_t* output_sig_v)
{
    ecdsa__construct_signature_<secp256k1::fr, secp256k1::fq, secp256k1::g1>(
        message_buf, private_key, output_sig_r, output_sig_s, output_sig_v);
}

WASM_EXPORT void ecdsa_r_construct_signature_(uint8_t const* message_buf,
                                              uint8_t const* private_key,
                                              uint8_t* output_sig_r,
                                              uint8_t* output_sig_s,
                                              uint8_t* output_sig_v)
{
    ecdsa__construct_signature_<secp256r1::fr, secp256r1::fq, secp256r1::g1>(
        message_buf, private_key, output_sig_r, output_sig_s, output_sig_v);
}

template <typename fr, typename fq, typename g1>
void ecdsa__recover_public_key_from_signature(uint8_t const* message,
                                              size_t msg_len,
                                              uint8_t const* sig_r,
                                              uint8_t const* sig_s,
                                              uint8_t* sig_v,
                                              uint8_t* output_pub_key)
{
    std::array<uint8_t, 32> r, s;
    std::copy(sig_r, sig_r + 32, r.begin());
    std::copy(sig_s, sig_s + 32, s.begin());
    const uint8_t v = *sig_v;

    ecdsa_signature sig = { r, s, v };
    auto recovered_pub_key =
        ecdsa_recover_public_key<Sha256Hasher, fq, fr, g1>(std::string((char*)message, msg_len), sig);
    write(output_pub_key, recovered_pub_key);
}

WASM_EXPORT void ecdsa__recover_public_key_from_signature(uint8_t const* message,
                                                          size_t msg_len,
                                                          uint8_t const* sig_r,
                                                          uint8_t const* sig_s,
                                                          uint8_t* sig_v,
                                                          uint8_t* output_pub_key)
{
    ecdsa__recover_public_key_from_signature<secp256k1::fr, secp256k1::fq, secp256k1::g1>(
        message, msg_len, sig_r, sig_s, sig_v, output_pub_key);
}

WASM_EXPORT void ecdsa_r_recover_public_key_from_signature(uint8_t const* message,
                                                           size_t msg_len,
                                                           uint8_t const* sig_r,
                                                           uint8_t const* sig_s,
                                                           uint8_t* sig_v,
                                                           uint8_t* output_pub_key)
{
    ecdsa__recover_public_key_from_signature<secp256r1::fr, secp256r1::fq, secp256r1::g1>(
        message, msg_len, sig_r, sig_s, sig_v, output_pub_key);
}

template <typename fr, typename fq, typename g1>
void ecdsa__recover_public_key_from_signature_(
    uint8_t const* message_buf, uint8_t const* sig_r, uint8_t const* sig_s, uint8_t* sig_v, uint8_t* output_pub_key)
{
    std::array<uint8_t, 32> r, s;
    std::copy(sig_r, sig_r + 32, r.begin());
    std::copy(sig_s, sig_s + 32, s.begin());
    const uint8_t v = *sig_v;

    auto message = from_buffer<std::string>(message_buf);
    ecdsa_signature sig = { r, s, v };
    auto recovered_pub_key = ecdsa_recover_public_key<Sha256Hasher, fq, fr, g1>(message, sig);
    write(output_pub_key, recovered_pub_key);
}

WASM_EXPORT void ecdsa__recover_public_key_from_signature_(
    uint8_t const* message_buf, uint8_t const* sig_r, uint8_t const* sig_s, uint8_t* sig_v, uint8_t* output_pub_key)
{
    ecdsa__recover_public_key_from_signature_<secp256k1::fr, secp256k1::fq, secp256k1::g1>(
        message_buf, sig_r, sig_s, sig_v, output_pub_key);
}

WASM_EXPORT void ecdsa_r_recover_public_key_from_signature_(
    uint8_t const* message_buf, uint8_t const* sig_r, uint8_t const* sig_s, uint8_t* sig_v, uint8_t* output_pub_key)
{
    ecdsa__recover_public_key_from_signature_<secp256r1::fr, secp256r1::fq, secp256r1::g1>(
        message_buf, sig_r, sig_s, sig_v, output_pub_key);
}

template <typename fr, typename fq, typename g1>
bool ecdsa__verify_signature(uint8_t const* message,
                             size_t msg_len,
                             uint8_t const* pub_key,
                             uint8_t const* sig_r,
                             uint8_t const* sig_s,
                             uint8_t const* sig_v)
{
    auto pubk = from_buffer<typename g1::affine_element>(pub_key);
    std::array<uint8_t, 32> r, s;
    std::copy(sig_r, sig_r + 32, r.begin());
    std::copy(sig_s, sig_s + 32, s.begin());
    const uint8_t v = *sig_v;

    ecdsa_signature sig = { r, s, v };
    return ecdsa_verify_signature<Sha256Hasher, fq, fr, g1>(std::string((char*)message, msg_len), pubk, sig);
}

WASM_EXPORT bool ecdsa__verify_signature(uint8_t const* message,
                                         size_t msg_len,
                                         uint8_t const* pub_key,
                                         uint8_t const* sig_r,
                                         uint8_t const* sig_s,
                                         uint8_t const* sig_v)
{
    return ecdsa__verify_signature<secp256k1::fr, secp256k1::fq, secp256k1::g1>(
        message, msg_len, pub_key, sig_r, sig_s, sig_v);
}

WASM_EXPORT bool ecdsa_r_verify_signature(uint8_t const* message,
                                          size_t msg_len,
                                          uint8_t const* pub_key,
                                          uint8_t const* sig_r,
                                          uint8_t const* sig_s,
                                          uint8_t const* sig_v)
{
    return ecdsa__verify_signature<secp256r1::fr, secp256r1::fq, secp256r1::g1>(
        message, msg_len, pub_key, sig_r, sig_s, sig_v);
}

template <typename fr, typename fq, typename g1>
void ecdsa__verify_signature_(uint8_t const* message_buf,
                              uint8_t const* pub_key,
                              uint8_t const* sig_r,
                              uint8_t const* sig_s,
                              uint8_t const* sig_v,
                              bool* result)
{
    auto pubk = from_buffer<typename g1::affine_element>(pub_key);
    std::array<uint8_t, 32> r, s;
    std::copy(sig_r, sig_r + 32, r.begin());
    std::copy(sig_s, sig_s + 32, s.begin());
    const uint8_t v = *sig_v;

    auto message = from_buffer<std::string>(message_buf);
    ecdsa_signature sig = { r, s, v };
    *result = ecdsa_verify_signature<Sha256Hasher, fq, fr, g1>(message, pubk, sig);
}

WASM_EXPORT void ecdsa__verify_signature_(uint8_t const* message,
                                          uint8_t const* pub_key,
                                          uint8_t const* sig_r,
                                          uint8_t const* sig_s,
                                          uint8_t const* sig_v,
                                          bool* result)
{
    ecdsa__verify_signature_<secp256k1::fr, secp256k1::fq, secp256k1::g1>(
        message, pub_key, sig_r, sig_s, sig_v, result);
}

WASM_EXPORT void ecdsa_r_verify_signature_(uint8_t const* message,
                                           uint8_t const* pub_key,
                                           uint8_t const* sig_r,
                                           uint8_t const* sig_s,
                                           uint8_t const* sig_v,
                                           bool* result)
{
    ecdsa__verify_signature_<secp256r1::fr, secp256r1::fq, secp256r1::g1>(
        message, pub_key, sig_r, sig_s, sig_v, result);
}
