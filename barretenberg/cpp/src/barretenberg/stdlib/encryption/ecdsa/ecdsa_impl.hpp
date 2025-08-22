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
 * @brief Validate the inputs used by the verification function and return messages if they produce and invalid circuit.
 *
 * @tparam Builder
 * @tparam Curve
 * @tparam Fq
 * @tparam Fr
 * @tparam G1
 * @param hashed_message
 * @param public_key
 * @param sig
 * @param scalar_mul_result
 */
template <typename Builder, typename Curve, typename Fq, typename Fr, typename G1>
void validate_inputs(const stdlib::byte_array<Builder>& hashed_message,
                     const G1& public_key,
                     const ecdsa_signature<Builder>& sig,
                     const G1& scalar_mul_result)
{
    auto assert_smaller_than = [](const uint512_t& value,
                                  const uint256_t& max_value,
                                  const std::string& value_label,
                                  const std::string& max_value_label) {
        std::string msg =
            "The " + value_label + " is bigger than " + max_value_label + ". This will produce an unsatisfied circuit.";
        if (value > max_value) {
            info(msg);
        }
    };

    auto assert_is_not_zero = [](const uint512_t& value, const std::string& label) {
        std::string msg = "The " + label + " is equal to zero. This will produce an unsatisfied circuit.";
        if (value == 0) {
            info(msg);
        }
    };

    // H(m) < n
    uint512_t hash_value = static_cast<uint512_t>(Fr(hashed_message).get_value());
    assert_smaller_than(hash_value, Fr::modulus, "hash of the message", "order of the elliptic curve");

    // P \in E
    if (!public_key.get_value().on_curve()) {
        info("The public key is not a point on the elliptic curve. This will produce an unsatisfied circuit.");
    }

    // 0 < r < n
    uint512_t r_value = static_cast<uint512_t>(Fr(sig.r).get_value());
    assert_smaller_than(r_value, Fr::modulus, "r component of the signature", "order of the elliptic curve");
    assert_is_not_zero(r_value, "r component of the signature");

    // 0 < s < (n+1)/2
    uint512_t s_value = static_cast<uint512_t>(Fr(sig.r).get_value());
    assert_smaller_than(s_value, Fr::modulus, "s component of the signature", "order of the elliptic curve");
    assert_is_not_zero(s_value, "s component of the signature");

    // Q = H(m) s^{-1} G + r s^{-1} P is not the point at infinity
    if (scalar_mul_result.get_value().is_point_at_infinity()) {
        info("The result of the scalar multiplication is the point at infinity. This will produce an unsatisfied "
             "circuit.");
    }
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
 *
 * @note The circuit introduces constraints for the following assertions:
 *          1. \$P\$ is on the curve
 *          2. \$H(m) < n\$
 *          3. \$0 < r < n\$
 *          4. \$0 < s < (n+1)/2\$
 *          5. \$Q := H(m) s^{-1} G + r s^{-1} P\$ is not the point at infinity
 * Therefore, if the witnesses passed to this function do not satisfy these constraints, the resulting circuit
 * will be unsatisfied. If a user wants to use the verification inside a in-circuit branch, then they need to supply
 * valid data for \$P, r, s\$, even though \$(r,s)\$ doesn't need to be a valid signature.
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
    result.is_point_at_infinity().assert_equal(bool_t<Builder>(false));

    // TODO(federicobarbacovi): Confirm with Suyash usage is correct!
    // Transfer Fq value result.x to Fr
    Fr result_x_mod_r = Fr::unsafe_construct_from_limbs(result.x.binary_basis_limbs[0].element,
                                                        result.x.binary_basis_limbs[1].element,
                                                        result.x.binary_basis_limbs[2].element,
                                                        result.x.binary_basis_limbs[3].element);

    // Check result.x = r mod n
    bool_t<Builder> is_signature_valid = result_x_mod_r == r;

    // Logging
    if (is_signature_valid.get_value()) {
        info("Signature verification succeeded.");
    } else {
        info("Signature verification failed");
    }

    // Validate inputs for debugging
    validate_inputs<Builder, Curve, Fq, Fr>(hashed_message, public_key, sig, result);

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
