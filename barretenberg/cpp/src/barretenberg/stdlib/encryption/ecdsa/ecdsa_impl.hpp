// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Federico], commit: 05a381f8b31ae4648e480f1369e911b148216e8b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_secp256r1_impl.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"

namespace bb::stdlib {

namespace {
auto& engine = numeric::get_debug_randomness();
}

/**
 * @brief Verify ECDSA signature. Returns bool_t(true/false) depending on whether the signature is valid or not.
 *
 * @details Fix the following notation:
 *  1. \f$E\f$ is an elliptic curve over the base field \f$\mathbb{F}_q\f$.
 *  2. \f$G\f$ is a generator of the group of points of \f$E\f$, the order of \f$G\f$ is \f$n\f$ and prime.
 *  3. \f$a \in \mathbb{F}_n^{\ast}\f$ is a private key, and \f$P := aG\f$ is the associated public key
 *  4. \f$\mathbf{H}\f$ is a hash function
 *
 * Given a message \f$m\f$, a couple \f$(r,s)\f$ is a valid signature for the message \f$m\f$ with respect to the public
 * key \f$P\f$ if (following https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-5.pdf):
 *  1. \f$P\f$ is a point on \f$E\f$
 *  2. \f$P = (x,y)\f$, then x < q, y < q
 *  3. \f$P\f$ is not the point at infinity
 *  4. \f$0 < r < n\f$
 *  5. \f$0 < s < (n+1) / 2\f$
 *  6. Define \f$e := \mathbf{H}(m) \mod n\f$ and \f$Q := e s^{-1} G + r s^{-1} P \f$
 *  7. \f$Q\f$ is not the point at infinity
 *  8. \f$Q_x = r \mod n\f$ (note that \f$Q_x \in \mathbb{F}_q\f$)
 *
 * @note The requirement of step 4. is to avoid signature malleability: if \f$(r,s)\f$ is a valid signature for
 * message \f$m\f$ and public key \f$P\f$, so is \f$(r,n-s)\f$. We protect against malleability by enforcing that
 * \f$s\f$ is always the lowest of the two possible values.
 *
 * @note In Ethereum signatures contain also a recovery byte \f$v\f$ which is used to recover the public key for which
 * the signature is to be validated. As we receive the public key as part of the inputs to the verification function, we
 * do not handle the recovery byte. The signature which is the input to the verification function is given by
 * \f$(r,s)\f$. The users of the verification function should handle the recovery byte if that is in their interest.
 *
 * @note This function verifies that `sig` is a valid signature for the public key `public_key`. The function returns
 * an in-circuit boolean value which bears witness to whether the signature verification was successfull or not. The
 * boolean is NOT constrained to be equal to bool_t(true).
 *
 * @note For secp256r1 the verification routine uses the "fake GLV" two-2-MSM construction. When the public key is
 * off-curve the native multiplication T₂ = u₂·pubkey would produce an off-curve witness that `from_witness`
 * rejects, so we substitute the public key with 2·G in that case; the verifier then reports the signature as
 * invalid because the substituted MSM result no longer matches the signature's r component, and the original
 * `is_point_on_curve` bit still flows into the validity output.
 *
 * @tparam Builder
 * @tparam Curve
 * @tparam Fq
 * @tparam Fr
 * @tparam G1
 * @param hashed_message
 * @param public_key
 * @param sig
 * @return bool_t<Builder>
 */
template <typename Builder, typename Curve, typename Fq, typename Fr, typename G1>
bool_t<Builder> ecdsa_verify_signature(const stdlib::byte_array<Builder>& hashed_message,
                                       const G1& public_key,
                                       const ecdsa_signature<Builder>& sig)
{
    using bool_ct = stdlib::bool_t<Builder>;

    BB_ASSERT_EQ(Fr::modulus.get_msb() + 1, 256UL, "The implementation assumes that the bit-length of Fr is 256 bits.");

    // Fetch the context
    Builder* builder = hashed_message.get_context();
    builder = validate_context(builder, public_key.get_context());
    builder = validate_context(builder, sig.get_context());
    BB_ASSERT_EQ(builder != nullptr, true, "At least one of the inputs should be non-constant.");

    // Turn the hashed message into an element of Fr
    // Note that we don't need to trim the length of the output of the hash function because the bit length of the
    // scalar fields we work with (secp256k1, secp256r1) is equal to 256.
    Fr z(hashed_message);

    // Step 1.
    bool_ct is_x_less_than_modulus = public_key.x().is_less_than(
        Fq::modulus, "ECDSA input validation: x coordinate of the public key bigger than the base field modulus.");
    bool_ct is_y_less_than_modulus = public_key.y().is_less_than(
        Fq::modulus, "ECDSA input validation: y coordinate of the public key bigger than the base field modulus.");

    // Step 2.
    bool_ct is_point_at_infinity = public_key.is_point_at_infinity();

    // Step 3.
    // We conditionally select a public key whose x and y coordinates are smaller than the base field modulus. We need
    // to do this to avoid circuit failures in the function validate_on_curve. Note that this doesn't allow any attack
    // as the result of the verification takes into account whether the original point coordinates were valid or not.
    typename Curve::AffineElementNative native_double_generator(Curve::GroupNative::one + Curve::GroupNative::one);
    G1 double_generator(Fq(native_double_generator.x), Fq(native_double_generator.y), /*assert_on_curve=*/false);
    G1 corrected_public_key = G1::conditional_assign(
        is_point_at_infinity || !is_x_less_than_modulus || !is_y_less_than_modulus, double_generator, public_key);
    bool_t<Builder> is_point_on_curve =
        corrected_public_key.validate_on_curve(
            "ECDSA input validation: the public key is not a point on the elliptic curve.", false) == Fq::zero();

    // Step 4.
    Fr r(sig.r);
    bool_ct is_r_in_range = r.is_less_than(
        Fr::modulus, "ECDSA input validation: the r component of the signature is bigger than Fr::modulus.");
    bool_ct is_r_zero = r == Fr::zero();

    // Step 5.
    Fr s(sig.s);
    bool_ct is_s_in_range =
        s.is_less_than((Fr::modulus + 1) / 2,
                       "ECDSA input validation: the s component of the signature is bigger than (Fr::modulus + 1)/2.");
    bool_ct is_s_zero = s == Fr::zero();

    // Step 6.
    // We conditionally select a non-zero scalar to perform the verification to avoid circuit failures when s = 0.
    Fr corrected_s = Fr::conditional_assign(is_s_zero, Fr::one(), s);

    Fr u1 = z.div_without_denominator_check(corrected_s);
    Fr u2 = r.div_without_denominator_check(corrected_s);

    // Default to true for paths without a u₂ restriction (secp256k1 via real GLV, generic batch_mul).
    bool_ct is_u2_acceptable = bool_ct(true);

    G1 result;
    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        result = G1::secp256k1_ecdsa_mul(corrected_public_key, u1, u2);
    } else if constexpr (Curve::type == bb::CurveType::SECP256R1) {
        // Substitute off-curve pubkeys with 2·G so `secp256r1_ecdsa_mul`'s `from_witness(u₂·Q)` doesn't fail.
        // `is_point_on_curve` is already in the validity AND-chain, so rejection is unaffected.
        G1 fake_glv_pubkey = G1::conditional_assign(!is_point_on_curve, double_generator, corrected_public_key);
        // `secp256r1_ecdsa_mul` returns a wrong result for u₂ ∈ {0, ±1} (it substitutes internally to keep
        // witness gen alive). `u2_is_acceptable` flags this and must flow into validity.
        const auto mul_out = G1::secp256r1_ecdsa_mul(fake_glv_pubkey, u1, u2);
        result = mul_out.result;
        is_u2_acceptable = mul_out.u2_is_acceptable;
    } else {
        result = G1::batch_mul(
            { G1::one(builder), corrected_public_key }, { u1, u2 }, /*max_num_bits=*/0, /*with_edgecases=*/false);
    }

    // Step 7.
    bool_ct result_is_infinity = result.is_point_at_infinity();

    // Step 8.
    result.x().reduce_mod_target_modulus();

    // Transfer Fq value result.x() to Fr (this is just moving from a C++ class to another)
    Fr result_x_mod_r = Fr::unsafe_construct_from_limbs(result.x().get_limb(0).element,
                                                        result.x().get_limb(1).element,
                                                        result.x().get_limb(2).element,
                                                        result.x().get_limb(3).element);
    // Copy maximum limb values from Fq to Fr: this is needed by the subtraction happening in the == operator
    for (size_t idx = 0; idx < 4; idx++) {
        result_x_mod_r.set_limb_max(idx, result.x().get_limb(idx).maximum_value);
    }

    // Check result.x() = r mod n AND that no other check failed
    bool_ct x_matches = result_x_mod_r == r;
    bool_ct is_signature_valid = x_matches && !is_point_at_infinity && !result_is_infinity && is_r_in_range &&
                                 !is_r_zero && is_s_in_range && !is_s_zero && is_point_on_curve &&
                                 is_x_less_than_modulus && is_y_less_than_modulus && is_u2_acceptable;

    // Logging
    if (is_signature_valid.get_value()) {
        vinfo("ECDSA signature verification succeeded.");
    } else {
        vinfo("ECDSA signature verification failed");
    }

    return is_signature_valid;
}

/**
 * @brief Generate a simple ecdsa verification circuit for testing purposes
 *
 * @tparam Builder
 * @param builder
 * @param num_iterations number of signature verifications to perform
 */
template <typename Builder> void generate_ecdsa_verification_test_circuit(Builder& builder, size_t num_iterations)
{
    using Curve = stdlib::secp256k1<Builder>;

    // Native types
    using FrNative = typename Curve::ScalarFieldNative;
    using FqNative = typename Curve::BaseFieldNative;
    using G1Native = typename Curve::GroupNative;

    // Stdlib types
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using G1 = typename Curve::Group;

    std::string message_string = "Instructions unclear, ask again later.";

    crypto::ecdsa_key_pair<FrNative, G1Native> account;
    for (size_t i = 0; i < num_iterations; i++) {
        // Generate unique signature for each iteration
        account.private_key = FrNative::random_element(&engine);
        account.public_key = G1Native::one * account.private_key;

        crypto::ecdsa_signature signature =
            crypto::ecdsa_construct_signature<crypto::Sha256Hasher, FqNative, FrNative, G1Native>(message_string,
                                                                                                  account);

        bool native_verification = crypto::ecdsa_verify_signature<crypto::Sha256Hasher, FqNative, FrNative, G1Native>(
            message_string, account.public_key, signature);
        BB_ASSERT_EQ(native_verification, true, "Native ECDSA verification failed while generating test circuit.");

        std::vector<uint8_t> rr(signature.r.begin(), signature.r.end());
        std::vector<uint8_t> ss(signature.s.begin(), signature.s.end());

        G1 public_key = G1::from_witness(&builder, account.public_key);

        ecdsa_signature<Builder> sig{ byte_array<Builder>(&builder, rr), byte_array<Builder>(&builder, ss) };

        // Compute H(m) natively and pass as witness (mirrors ACIR which takes pre-hashed message)
        auto hash_arr = crypto::sha256(std::vector<uint8_t>(message_string.begin(), message_string.end()));
        stdlib::byte_array<Builder> hashed_message(&builder, std::vector<uint8_t>(hash_arr.begin(), hash_arr.end()));

        // Verify ecdsa signature
        bool_t<Builder> result =
            stdlib::ecdsa_verify_signature<Builder, Curve, Fq, Fr, G1>(hashed_message, public_key, sig);
        result.assert_equal(bool_t<Builder>(true));
    }
}

} // namespace bb::stdlib
