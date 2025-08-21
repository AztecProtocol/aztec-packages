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
 *  2. \f$0 < r < n\f$
 *  3. \f$0 < s < (n+1) / 2\f$
 *  4. Define \f$e := \mathbf{H}(m) \mod n\f$ and \f$Q := e s^{-1} G + r s^{-1} P \f$
 *  5. \f$Q\f$ is not the point at infinity AND \f$Q_x = r \mod n\f$ (note that \f$Q_x \in \mathbb{F}_q\f$)
 *
 * @note The requirement of step 2. is to avoid transaction malleability: if \f$(r,s)\f$ is a valid signature for
 * message \f$m\f$ and public key \f$P\f$, so is \f$(r,n-s)\f$. We protect against malleability by enforcing that
 * \f$s\f$ is always the lowest of the two possible values.
 *
 * @note In Ethereum signatures contain also a recovery byte \$v\$ which is used to recover the public key for which
 * the signature is to be validated. As we receive the public key as part of the inputs to the verification function, we
 * do not handle the recovery byte. The signature which is the input to the verification function is given by \$(r,s)\$.
 * The users of the verification function should handle the recovery byte if that is in their interest.
 *
 * @note This function verifies that `sig` is a valid signature for the public key `public_key`. The function returns
 * an in-circuit boolean value which bears witness to whether the signature verification was successfull or not. The
 * boolean is NOT constrained to be equal to bool_t(true).
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
    bool message_is_not_constant = hashed_message.get_context() != nullptr;
    bool public_key_is_not_constant = public_key.get_context() != nullptr;
    bool sig_is_not_constant = sig.get_context() != nullptr;
    BB_ASSERT_EQ(message_is_not_constant || public_key_is_not_constant || sig_is_not_constant,
                 true,
                 "At least one of the inputs should be non-constant.");

    Builder* ctx = nullptr;
    if (message_is_not_constant) {
        ctx = hashed_message.get_context();
    } else if (public_key_is_not_constant) {
        ctx = public_key.get_context();
    } else if (sig_is_not_constant) {
        ctx = sig.get_context();
    } else {
        throw_or_abort(
            "At least one of the inputs passed should be non-constant. Assert failed to catch this condition.");
    }

    // Turn the hashed message into an element of Fr
    // The assertion means that an honest prover has a small probability of not being able to generate a valid proof if
    // H(m) > n. Enforcing this condition introduces a small number of gates, and ensures that signatures cannot be
    // forged by finding a collision of H modulo n. While finding such a collision is supposed to be hard even modulo n,
    // we protect against this case with this cheap check.
    Fr z(hashed_message);
    z.assert_is_in_field();

    // Step 1.
    public_key.validate_on_curve();

    // Step 2.
    Fr r(sig.r);
    r.assert_is_in_field();            // r < n
    r.assert_is_not_equal(Fr::zero()); // 0 < r

    // Step 3.
    Fr s(sig.s);
    s.assert_less_than((Fr::modulus + 1) / 2); // s < (n+1) / 2
    s.assert_is_not_equal(Fr::zero());         // 0 < s

    // Step 4.
    Fr u1 = z.div_without_denominator_check(s);
    Fr u2 = r.div_without_denominator_check(s);

    G1 result;
    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        result = G1::secp256k1_ecdsa_mul(public_key, u1, u2);
    } else {
        result = G1::batch_mul({ G1::one(ctx), public_key }, { u1, u2 });
    }

    // Step 5.
    // TODO(federicobarbacovi): Confirm with Suyash usage is correct!
    result.is_point_at_infinity().assert_equal(bool_t<Builder>(false));

    // Transfer Fq value result.x to Fr
    Fr result_x_mod_r = Fr::unsafe_construct_from_limbs(result.x.binary_basis_limbs[0].element,
                                                        result.x.binary_basis_limbs[1].element,
                                                        result.x.binary_basis_limbs[2].element,
                                                        result.x.binary_basis_limbs[3].element);

    // Check result.x = r mod n
    bool_t<Builder> is_signature_valid = result_x_mod_r == r;

    if (is_signature_valid.get_value()) {
        vinfo("Signature verification succeeded.");
    } else {
        vinfo("Signature verification failed");
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
    using curve = stdlib::secp256k1<Builder>;
    using fr = typename curve::fr;
    using fq = typename curve::fq;
    using g1 = typename curve::g1;

    std::string message_string = "Instructions unclear, ask again later.";

    crypto::ecdsa_key_pair<fr, g1> account;
    for (size_t i = 0; i < num_iterations; i++) {
        // Generate unique signature for each iteration
        account.private_key = curve::fr::random_element(&engine);
        account.public_key = curve::g1::one * account.private_key;

        crypto::ecdsa_signature signature =
            crypto::ecdsa_construct_signature<crypto::Sha256Hasher, fq, fr, g1>(message_string, account);

        bool first_result = crypto::ecdsa_verify_signature<crypto::Sha256Hasher, fq, fr, g1>(
            message_string, account.public_key, signature);
        static_cast<void>(first_result); // TODO(Cody): This is not used anywhere.

        std::vector<uint8_t> rr(signature.r.begin(), signature.r.end());
        std::vector<uint8_t> ss(signature.s.begin(), signature.s.end());

        typename curve::g1_bigfr_ct public_key = curve::g1_bigfr_ct::from_witness(&builder, account.public_key);

        stdlib::ecdsa_signature<Builder> sig{ typename curve::byte_array_ct(&builder, rr),
                                              typename curve::byte_array_ct(&builder, ss) };

        typename curve::byte_array_ct message(&builder, message_string);

        // Verify ecdsa signature
        typename curve::bool_ct result =
            stdlib::ecdsa_verify_signature<Builder,
                                           curve,
                                           typename curve::fq_ct,
                                           typename curve::bigfr_ct,
                                           typename curve::g1_bigfr_ct>(message, public_key, sig);
        result.assert_equal(typename curve::bool_ct(true));
    }
}

} // namespace bb::stdlib
