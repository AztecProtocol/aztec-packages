// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/groups/precomputed_generators_secp256r1_impl.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
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
 *  2. \f$G\f$ is a generator of the group of points of \f$E\f$, the order of \f$G\f$ is \f$n\f$.
 *  3. \f$a \in \mathbb{F}_n^{\ast}\f$ is a private key, and \f$P := aG\f$ is the associated public key
 *  4. \f$\mathbf{H}\f$ is a hash function
 *
 * Given a message \f$m\f$, a couple \f$(r,s)\f$ is a valid signature for the message \f$m\f$ with respect to the public
 * key \f$P\f$ if:
 *  1. \f$P\f$ is a point on \f$E\f$
 *  2. \f$P\f$ is not the point at infinity
 *  3. \f$0 < r < n\f$
 *  4. \f$0 < s < (n+1) / 2\f$
 *  5. Define \f$e := \mathbf{H}(m) \mod n\f$ and \f$Q := e s^{-1} G + r s^{-1} P \f$
 *  6. \f$Q\f$ is not the point at infinity
 *  7. \f$Q_x = r \mod n\f$ (note that \f$Q_x \in \mathbb{F}_q\f$)
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
 * @note The circuit introduces constraints for the following assertions:
 *          1. \f$P\f$ is on the curve
 *          2. \f$P\f$ is on the point at infinity
 *          3. \f$H(m) < n\f$
 *          4. \f$0 < r < n\f$
 *          5. \f$0 < s < (n+1)/2\f$
 *          6. \f$Q := H(m) s^{-1} G + r s^{-1} P\f$ is not the point at infinity
 * Therefore, if the witnesses passed to this function do not satisfy these constraints, the resulting circuit
 * will be unsatisfied. If a user wants to use the verification inside a in-circuit branch, then they need to supply
 * valid data for \f$m, P, r, s\f$, even though \f$(r,s)\f$ doesn't need to be a valid signature.
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
    // Fetch the context
    Builder* builder = hashed_message.get_context();
    builder = validate_context(builder, public_key.get_context());
    builder = validate_context(builder, sig.get_context());
    BB_ASSERT_EQ(builder != nullptr, true, "At least one of the inputs should be non-constant.");

    // Turn the hashed message into an element of Fr
    // The assertion means that an honest prover has a small probability of not being able to generate a valid proof if
    // H(m) >= n. Enforcing this condition introduces a small number of gates, and ensures that signatures cannot be
    // forged by finding a collision of H modulo n. While finding such a collision is supposed to be hard even modulo n,
    // we protect against this case with this cheap check.
    Fr z(hashed_message);
    z.assert_is_in_field(
        "ECDSA input validation: the hash of the message is bigger than the order of the elliptic curve.");

    // Step 1.
    public_key.validate_on_curve("ECDSA input validation: the public key is not a point on the elliptic curve.");

    // Step 2.
    public_key.is_point_at_infinity().assert_equal(bool_t<Builder>(false),
                                                   "ECDSA input validation: the public key is the point at infinity.");

    // Step 3.
    Fr r(sig.r);
    r.assert_is_in_field("ECDSA input validation: the r component of the signature is bigger than the order of the "
                         "elliptic curve.");                                                                // r < n
    r.assert_is_not_equal(Fr::zero(), "ECDSA input validation: the r component of the signature is zero."); // 0 < r

    // Step 4.
    Fr s(sig.s);
    s.assert_less_than(
        (Fr::modulus + 1) / 2,
        "ECDSA input validation: the s component of the signature is bigger than Fr::modulus - s."); // s < (n+1)/2
    s.assert_is_not_equal(Fr::zero(), "ECDSA input validation: the s component of the signature is zero."); // 0 < s

    // Step 5.
    Fr u1 = z.div_without_denominator_check(s);
    Fr u2 = r.div_without_denominator_check(s);

    G1 result;
    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        result = G1::secp256k1_ecdsa_mul(public_key, u1, u2);
    } else {
        // This error comes from the lookup tables used in batch_mul. We could get rid of it by setting with_edgecase =
        // true. However, this would increase the gate count, and it would handle a case that should not appear in
        // general: someone using plus or minus the generator as a public key.
        if ((public_key.get_value().x == Curve::g1::affine_one.x) && (!builder->failed())) {
            builder->failure("ECDSA input validation: the public key is equal to plus or minus the generator point.");
        }
        result = G1::batch_mul({ G1::one(builder), public_key }, { u1, u2 });
    }

    // Step 6.
    result.is_point_at_infinity().assert_equal(
        bool_t<Builder>(false), "ECDSA validation: the result of the batch multiplication is the point at infinity.");

    // Step 7.
    // We reduce result.x to 2^s, where s is the smallest s.t. 2^s > q. It is cheap in terms of constraints, and avoids
    // possible edge cases
    result.x.self_reduce();

    // Transfer Fq value result.x to Fr (this is just moving from a C++ class to another)
    Fr result_x_mod_r = Fr::unsafe_construct_from_limbs(result.x.binary_basis_limbs[0].element,
                                                        result.x.binary_basis_limbs[1].element,
                                                        result.x.binary_basis_limbs[2].element,
                                                        result.x.binary_basis_limbs[3].element);
    // Copy maximum limb values from Fq to Fr: this is needed by the subtraction happening in the == operator
    for (size_t idx = 0; idx < 4; idx++) {
        result_x_mod_r.binary_basis_limbs[idx].maximum_value = result.x.binary_basis_limbs[idx].maximum_value;
    }

    // Check result.x = r mod n
    bool_t<Builder> is_signature_valid = result_x_mod_r == r;

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
    using FrNative = typename Curve::fr;
    using FqNative = typename Curve::fq;
    using G1Native = typename Curve::g1;

    // Stdlib types
    using Fr = typename Curve::bigfr_ct;
    using Fq = typename Curve::fq_ct;
    using G1 = typename Curve::g1_bigfr_ct;

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

        byte_array<Builder> message(&builder, message_string);

        // Compute H(m)
        stdlib::byte_array<Builder> hashed_message =
            static_cast<stdlib::byte_array<Builder>>(stdlib::SHA256<Builder>::hash(message));

        // Verify ecdsa signature
        bool_t<Builder> result =
            stdlib::ecdsa_verify_signature<Builder, Curve, Fq, Fr, G1>(hashed_message, public_key, sig);
        result.assert_equal(bool_t<Builder>(true));
    }
}

} // namespace bb::stdlib
