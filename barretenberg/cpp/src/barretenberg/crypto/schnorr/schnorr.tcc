#pragma once

#include <string_view>

#include "barretenberg/crypto/hmac/hmac.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"

#include "schnorr.hpp"

namespace bb::crypto {

/**
 * @brief Domain separation tag (DST) for the schnorr challenge hash.
 *
 * Defined as `poseidon2_hash_bytes("schnorr_grumpkin_poseidon2")`, where the byte-packing matches
 * noir's `poseidon2_hash_bytes`: bytes are packed little-endian into a single 31-byte chunk
 * (positions beyond the source length implicitly zero) and the resulting field element is hashed
 * with Poseidon2 (length-1 input, IV = 1 << 64).
 *
 * The same constant is mirrored in noir-lang/schnorr (`SCHNORR_CHALLENGE_DST` in `src/lib.nr`) and
 * verified there by a derivation test. Including it as the first input to the challenge hash binds
 * every signature to the "schnorr over grumpkin with Poseidon2" scheme, preventing cross-protocol
 * reinterpretation of a Poseidon2 output as a schnorr challenge.
 */
template <typename Fq> static inline Fq compute_schnorr_challenge_dst()
{
    constexpr std::string_view SRC = "schnorr_grumpkin_poseidon2";
    static_assert(SRC.size() <= 31, "DST source string must fit in a single 31-byte chunk");
    uint256_t packed = 0;
    uint256_t mul = 1;
    for (char c : SRC) {
        packed += uint256_t(static_cast<uint8_t>(c)) * mul;
        mul *= 256;
    }
    return Poseidon2<Poseidon2Bn254ScalarFieldParams>::hash({ Fq(packed) });
}

/**
 * @brief Generate the schnorr signature challenge parameter `e` given a message, signer pubkey and nonce.
 *
 * @details e = Poseidon2(SCHNORR_CHALLENGE_DST, R.x, pubkey.x, pubkey.y, message_field)
 *
 * Poseidon2 operates over bb::fr (BN254 scalar field = grumpkin base field). The output is a bb::fr
 * element. Since bb::fr modulus < bb::fq modulus (grumpkin scalar field), the result can be converted
 * to a grumpkin scalar (bb::fq) with no reduction and zero bias.
 *
 * @tparam G1 Group over which the signature is produced (grumpkin::g1, where G1::Fq = bb::fr)
 * @param message_field The message to sign, as a bb::fr element
 * @param pubkey the pubkey of the signer
 * @param R the nonce commitment
 * @return e as a bb::fr element
 */
template <typename G1>
static typename G1::Fq schnorr_generate_challenge(const typename G1::Fq& message_field,
                                                  const typename G1::affine_element& pubkey,
                                                  const typename G1::affine_element& R)
{
    static const typename G1::Fq dst = compute_schnorr_challenge_dst<typename G1::Fq>();
    return Poseidon2<Poseidon2Bn254ScalarFieldParams>::hash({ dst, R.x, pubkey.x, pubkey.y, message_field });
}

/**
 * @brief Construct a Schnorr signature (s, e) where s = k - priv * e and e is the challenge hash.
 *
 * @warning Signatures are not deterministic (nonce k is random).
 */
template <typename Fr, typename G1>
schnorr_signature schnorr_construct_signature(const typename G1::Fq& message_field,
                                              const schnorr_key_pair<Fr, G1>& account)
{
    auto& public_key = account.public_key;
    auto& private_key = account.private_key;

    // Sample random nonce k.
    //
    // Fr::random_element() will call std::random_device, which in turn relies on system calls to
    // generate a string of random bits. It is important to ensure that the execution environment will
    // correctly supply system calls that give std::random_device access to an entropy source that
    // produces a string of non-deterministic uniformly random bits. For example, when compiling into a
    // wasm binary, it is essential that the random_get method is overloaded to utilise a suitable
    // entropy source (see https://github.com/WebAssembly/WASI/blob/main/phases/snapshot/docs.md).
    //
    // Reuse of k across two distinct messages signed by the same private key reveals the private key,
    // so a working entropy source is load-bearing for security, not just liveness.
    Fr k = Fr::random_element();

    // k is a secret nonce; use the constant-time multiplication to defend against the
    // Hamming-weight / bit-length timing leak in operator*.
    typename G1::affine_element R(typename G1::element(G1::one).mul_const_time(k).to_affine_const_time());

    using Fq = typename G1::Fq;
    Fq e = schnorr_generate_challenge<G1>(message_field, public_key, R);
    // Convert the challenge from bb::fr (Poseidon2 output field, grumpkin base) to bb::fq (grumpkin scalar)
    // for the signature equation s = k - priv * e. Lossless because bb::fr modulus < bb::fq modulus.
    std::array<uint8_t, 32> e_buf;
    Fq::serialize_to_buffer(e, e_buf.data());
    Fr e_scalar = Fr::serialize_from_buffer(e_buf.data());
    Fr s = k - (private_key * e_scalar);
    secure_erase_bytes(&k, sizeof(k));

    return { s, e_scalar };
}

/**
 * @brief Verify a Schnorr signature produced by schnorr_construct_signature.
 */
template <typename Fr, typename G1>
bool schnorr_verify_signature(const typename G1::Fq& message_field,
                              const typename G1::affine_element& public_key,
                              const schnorr_signature& sig)
{
    using affine_element = typename G1::affine_element;
    using element = typename G1::element;

    if (!public_key.on_curve() || public_key.is_point_at_infinity()) {
        return false;
    }

    if (sig.s == 0 || sig.e == 0) {
        return false;
    }

    // R = g^s * pub^e
    affine_element R(element(public_key) * sig.e + G1::one * sig.s);
    if (R.is_point_at_infinity()) {
        return false;
    }

    // Recompute challenge and compare
    using Fq = typename G1::Fq;
    Fq target_e = schnorr_generate_challenge<G1>(message_field, public_key, R);
    std::array<uint8_t, 32> target_e_buf;
    Fq::serialize_to_buffer(target_e, target_e_buf.data());
    Fr target_e_scalar = Fr::serialize_from_buffer(target_e_buf.data());
    return (sig.e == target_e_scalar);
}
} // namespace bb::crypto
