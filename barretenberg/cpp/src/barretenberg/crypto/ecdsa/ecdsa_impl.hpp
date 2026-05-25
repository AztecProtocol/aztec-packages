// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <algorithm>

#include "../hmac/hmac.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "ecdsa.hpp"

namespace bb::crypto {

template <typename Hash, typename Fq, typename Fr, typename G1>
ecdsa_signature ecdsa_construct_signature(const std::string& message, const ecdsa_key_pair<Fr, G1>& account)
{
    ecdsa_signature sig;

    // Hash the message and convert it to an element of Fr
    Fr z = ecdsa_hash_message<Hash, Fr>(message);

    // Derived secret `k` using deterministic derivation according to RFC6979
    std::vector<uint8_t> pkey_buffer;
    write(pkey_buffer, account.private_key);
    Fr k = crypto::deterministic_nonce_rfc6979<Hash, Fr>(message, pkey_buffer);
    secure_erase(pkey_buffer);

    // Compute R = k * G. k is the secret RFC6979 nonce, so use the constant-time multiplication
    // to defend against the Hamming-weight / bit-length timing leak in operator*.
    typename G1::affine_element R(typename G1::element(G1::one).mul_const_time(k).to_affine_const_time());

    // Compute the signature
    Fr r = Fr(R.x);
    Fr s = (z + r * account.private_key) * k.invert_const_time();
    secure_erase_bytes(&k, sizeof(k));

    // Ensure that the value of s is "low", i.e. s := min{ s, (|Fr| - s) }
    const bool is_s_low = (uint256_t(s) < (uint256_t(Fr::modulus) + 1) / 2);
    s = is_s_low ? s : -s;

    Fr::serialize_to_buffer(r, &sig.r[0]);
    Fr::serialize_to_buffer(s, &sig.s[0]);

    // Compute recovery_id: given R = (x, y)
    //   0: y is even  &&  x < |Fr|
    //   1: y is odd   &&  x < |Fr|
    //   2: y is even  &&  |Fr| <= x < |Fq|
    //   3: y is odd   &&  |Fr| <= x < |Fq|
    // v = offset + recovery_id
    bool is_r_finite = (uint256_t(R.x) == uint256_t(r));
    bool y_parity = uint256_t(R.y).get_bit(0);
    // When s is negated (low-s normalization), the effective nonce point becomes -R,
    // which has the opposite y-parity. Flip y_parity accordingly.
    bool recovery_id = is_s_low ? y_parity : !y_parity;

    int value = is_r_finite ? ECDSA_RECOVERY_ID_OFFSET + recovery_id
                            : ECDSA_RECOVERY_ID_OFFSET + recovery_id + ECDSA_R_FINITENESS_OFFSET;
    BB_ASSERT_LTE(value, UINT8_MAX);
    sig.v = static_cast<uint8_t>(value);

    return sig;
}

template <typename Hash, typename Fq, typename Fr, typename G1>
typename G1::affine_element ecdsa_recover_public_key(const std::string& message, const ecdsa_signature& sig)
{
    using serialize::read;
    using AffineElement = G1::affine_element;

    // Read the signature components
    uint256_t r_uint;
    uint256_t s_uint;
    uint8_t v_uint;
    uint256_t mod = uint256_t(Fr::modulus);

    const auto* r_buf = &sig.r[0];
    const auto* s_buf = &sig.s[0];
    const auto* v_buf = &sig.v;
    read(r_buf, r_uint);
    read(s_buf, s_uint);
    read(v_buf, v_uint);
    Fr r = Fr(r_uint);
    Fr s = Fr(s_uint);

    // Validate signature components according to specification
    BB_ASSERT_LT(r_uint, mod, "r value exceeds the modulus");
    BB_ASSERT_LT(s_uint, mod, "s value exceeds the modulus");
    BB_ASSERT_LT(s_uint, (mod + 1) / 2, "s value is not less than curve order by 2");
    BB_ASSERT(r_uint != 0, "r value is zero");
    BB_ASSERT(s_uint != 0, "s value is zero");

    // Check that v is in {27, 28, 29, 30} and then bring it back to the range {0, 1, 2, 3}
    BB_ASSERT_GTE(v_uint, ECDSA_RECOVERY_ID_OFFSET, "v value is too small");
    BB_ASSERT_LTE(v_uint, ECDSA_RECOVERY_ID_OFFSET + 3, "v value is too large");
    bool is_r_finite = v_uint < ECDSA_RECOVERY_ID_OFFSET + 2;
    v_uint -= ECDSA_RECOVERY_ID_OFFSET;

    // Decompress the x-coordinate r_uint to get two possible R points
    // The first uncompressed R point is selected when r < |Fr|
    // The second uncompressed R point is selected when |Fr| <= r < |Fq|
    // Note that the second condition occurs with very low probability, so it's highly unlikely.
    auto uncompressed_points = AffineElement::from_compressed_unsafe(r_uint);
    AffineElement point_R = uncompressed_points[is_r_finite ? 0 : 1];

    // Negate the y-coordinate point of R based on the parity of v
    bool y_parity_R = uint256_t(point_R.y).get_bit(0);
    bool v_parity = v_uint & 1;
    // Flip the sign of R.y if either v is even and R.y is odd, or v is odd and R.y is even
    if ((v_parity && !y_parity_R) || (!v_parity && y_parity_R)) {
        point_R.y = -point_R.y;
    }

    // Start key recovery algorithm
    Fr z = ecdsa_hash_message<Hash, Fr>(message);

    Fr r_inv = r.invert();

    Fr u1 = -(z * r_inv);
    Fr u2 = s * r_inv;

    AffineElement recovered_public_key(point_R * u2 + G1::one * u1);
    return recovered_public_key;
}

template <typename Hash, typename Fq, typename Fr, typename G1>
bool ecdsa_verify_signature(const std::string& message,
                            const typename G1::affine_element& public_key,
                            const ecdsa_signature& sig)
{
    using serialize::read;
    using Element = G1::element;
    using AffineElement = G1::affine_element;

    // Validate that the public key is on the curve and not the point at infinity
    if ((!public_key.on_curve()) || (public_key.is_point_at_infinity())) {
        return false;
    }

    // Deserialize the signature and validate the components
    uint256_t r_uint;
    uint256_t s_uint;
    uint256_t mod = uint256_t(Fr::modulus);

    const auto* r_buf = &sig.r[0];
    const auto* s_buf = &sig.s[0];
    read(r_buf, r_uint);
    read(s_buf, s_uint);

    // We need to check that r and s are in Field according to specification
    if (r_uint >= mod) {
        vinfo("The r component of the signature exceeds the modulus of the scalar field of the curve.");
        return false;
    }
    if (s_uint >= (mod + 1) / 2) {
        vinfo("The s component of the signature exceeds (modulus + 1) / 2.");
        return false;
    }
    if (r_uint == 0) {
        vinfo("The r component of the signature is zero.");
        return false;
    }
    if (s_uint == 0) {
        vinfo("The s component of the signature is zero.");
        return false;
    }

    // Hash the message
    Fr z = ecdsa_hash_message<Hash, Fr>(message);

    // Validate the signature
    Fr r = Fr(r_uint);
    Fr s = Fr(s_uint);

    Fr s_inv = s.invert();

    Fr u1 = z * s_inv;
    Fr u2 = r * s_inv;

    AffineElement R = (G1::one * u1) + (Element(public_key) * u2);
    if (R.is_point_at_infinity()) {
        vinfo("Result of the scalar multiplication is the point at infinity.");
        return false;
    }

    uint256_t Rx(R.x);
    Fr result(Rx);
    return result == r;
}

template <typename Hash, typename Fr> Fr ecdsa_hash_message(const std::string& message)
{
    using serialize::read;
    using serialize::write;

    static_assert(Hash::OUTPUT_SIZE <= 32, "Hash output size is too large for our implementation of ECDSA.");

    constexpr size_t MODULUS_BIT_LENGTH = Fr::modulus.get_msb() + 1;

    std::vector<uint8_t> message_buffer;
    std::ranges::copy(message, std::back_inserter(message_buffer));
    auto ev = Hash::hash(message_buffer);

    if (Hash::OUTPUT_SIZE * 8 > MODULUS_BIT_LENGTH) {
        const uint8_t* ptr = ev.data();
        uint256_t ev_uint;
        read(ptr, ev_uint);

        // Bit shift the hash output
        ev_uint = ev_uint >> (Hash::OUTPUT_SIZE * 8 - MODULUS_BIT_LENGTH);

        // Write the output to ev
        uint8_t* ptr_write = ev.data();
        write(ptr_write, ev_uint);
    }

    return Fr::serialize_from_buffer(&ev[0]);
}
} // namespace bb::crypto
