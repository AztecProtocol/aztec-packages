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

/**
 * Fix the following notation:
 *  1. \$E\$ is an elliptic curve over the base field \$\mathbb{F}_q\$.
 *  2. \$G\$ is a generator of the group of points of \$E\$, the order of \$G\$ is \$n\$.
 *  3. \$a \in \mathbb{F}_n^{\ast}$ is a private key, and \$P := aG\$ is the associated public key
 *  4. \$\mathcal{H}\$ is a hash function
 *
 * Given a message \$m\$, a couple \$(r,s)\$ is a valid signature for the message \$m\$ with respect to the public key
 * \$P\$ if:
 *  1. \$P\$ is a point on \$E\$
 *  2. \$0 < r < n\$
 *  3. \$0 < s < (n+1) / 2\$
 *  4. Define \$e := \mathcal{H}(m) mod n$ and \$Q := e s^{-1} G + r s^{-1} P \$
 *  5. \$Q\$ is not the point at infinity AND \$Q_x = r mod n\$ (note that \$Q_x \in \mathbb{F}_q\$)
 *
 * @note The requirement of step 2. is to avoid transaction malleability: if \$(r,s)\$ is a valid signature for message
 * \$m\$ and public key \$P\$, so is \$(r,n-s)\$. We protect against malleability by enforcing that \$s\$ is always the
 * lowest of the two possible values.
 *
 * @note In Ethereum signatures contain also a recovery byte \$v\$ which is used to recover the public key for which
 * the signature is to be validated. As we receive the public key as part of the inputs to the verification function, we
 * do not handle the recovery byte. The signature which is the input to the verification function is given by \$(r,s)\$.
 * The users of the verification function should handle the recovery byte if that is in their interest.
 *
 */

namespace bb::stdlib {

namespace {
auto& engine = numeric::get_debug_randomness();
}

/**
 * @brief Verify ECDSA signature. Produces unsatisfiable constraints if signature fails
 *
 * @tparam Builder
 * @tparam Curve
 * @tparam Fq
 * @tparam Fr
 * @tparam G1
 * @param message
 * @param public_key
 * @param sig
 * @return bool_t<Builder>
 */
template <typename Builder, typename Curve, typename Fq, typename Fr, typename G1>
bool_t<Builder> ecdsa_verify_signature(const stdlib::byte_array<Builder>& message,
                                       const G1& public_key,
                                       const ecdsa_signature<Builder>& sig)
{
    Builder* ctx = message.get_context() ? message.get_context() : public_key.x.context;

    stdlib::byte_array<Builder> hashed_message =
        static_cast<stdlib::byte_array<Builder>>(stdlib::SHA256<Builder>::hash(message));

    Fr z(hashed_message);
    z.assert_is_in_field();

    Fr r(sig.r);
    // force r to be < secp256k1 group modulus, so we can compare with `result_mod_r` below
    r.assert_is_in_field();

    Fr s(sig.s);

    // r and s should not be zero
    r.assert_is_not_equal(Fr::zero());
    s.assert_is_not_equal(Fr::zero());

    // s should be less than |Fr| / 2
    // Read more about this at: https://www.derpturkey.com/inherent-malleability-of-ecdsa-signatures/amp/
    s.assert_less_than((Fr::modulus + 1) / 2);

    // We already checked that s is nonzero
    Fr u1 = z.div_without_denominator_check(s);
    Fr u2 = r.div_without_denominator_check(s);

    public_key.validate_on_curve();

    G1 result;
    // TODO(Cody): Having Plookup should not determine which curve is used.
    // Use special plookup secp256k1 ECDSA mul if available (this relies on k1 endomorphism, and cannot be used for
    // other curves)
    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        result = G1::secp256k1_ecdsa_mul(public_key, u1, u2);
    } else {
        result = G1::batch_mul({ G1::one(ctx), public_key }, { u1, u2 });
    }
    result.x.self_reduce();

    // transfer Fq value x to an Fr element and reduce mod r
    Fr result_mod_r(ctx, 0);
    result_mod_r.binary_basis_limbs[0].element = result.x.binary_basis_limbs[0].element;
    result_mod_r.binary_basis_limbs[1].element = result.x.binary_basis_limbs[1].element;
    result_mod_r.binary_basis_limbs[2].element = result.x.binary_basis_limbs[2].element;
    result_mod_r.binary_basis_limbs[3].element = result.x.binary_basis_limbs[3].element;
    result_mod_r.binary_basis_limbs[0].maximum_value = result.x.binary_basis_limbs[0].maximum_value;
    result_mod_r.binary_basis_limbs[1].maximum_value = result.x.binary_basis_limbs[1].maximum_value;
    result_mod_r.binary_basis_limbs[2].maximum_value = result.x.binary_basis_limbs[2].maximum_value;
    result_mod_r.binary_basis_limbs[3].maximum_value = result.x.binary_basis_limbs[3].maximum_value;

    result_mod_r.prime_basis_limb = result.x.prime_basis_limb;

    result_mod_r.assert_is_in_field();

    result_mod_r.binary_basis_limbs[0].element.assert_equal(r.binary_basis_limbs[0].element);
    result_mod_r.binary_basis_limbs[1].element.assert_equal(r.binary_basis_limbs[1].element);
    result_mod_r.binary_basis_limbs[2].element.assert_equal(r.binary_basis_limbs[2].element);
    result_mod_r.binary_basis_limbs[3].element.assert_equal(r.binary_basis_limbs[3].element);
    result_mod_r.prime_basis_limb.assert_equal(r.prime_basis_limb);
    return bool_t<Builder>(ctx, true);
}

/**
 * @brief Verify ECDSA signature. Returns 0 if signature fails (i.e. does not produce unsatisfiable constraints)
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
bool_t<Builder> ecdsa_verify_signature_prehashed_message_noassert(const stdlib::byte_array<Builder>& hashed_message,
                                                                  const G1& public_key,
                                                                  const ecdsa_signature<Builder>& sig)
{
    Builder* ctx = hashed_message.get_context() ? hashed_message.get_context() : public_key.x.context;

    Fr z(hashed_message);
    z.assert_is_in_field();

    Fr r(sig.r);
    // force r to be < secp256k1 group modulus, so we can compare with `result_mod_r` below
    r.assert_is_in_field();

    Fr s(sig.s);

    // r and s should not be zero
    r.assert_is_not_equal(Fr::zero());
    s.assert_is_not_equal(Fr::zero());

    // s should be less than |Fr| / 2
    // Read more about this at: https://www.derpturkey.com/inherent-malleability-of-ecdsa-signatures/amp/
    s.assert_less_than((Fr::modulus + 1) / 2);

    Fr u1 = z / s;
    Fr u2 = r / s;

    public_key.validate_on_curve();

    G1 result;
    // Use special plookup secp256k1 ECDSA mul if available (this relies on k1 endomorphism, and cannot be used for
    // other curves)
    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        result = G1::secp256k1_ecdsa_mul(public_key, u1, u2);
    } else {
        result = G1::batch_mul({ G1::one(ctx), public_key }, { u1, u2 });
    }
    result.x.self_reduce();

    // transfer Fq value x to an Fr element and reduce mod r
    Fr result_mod_r(ctx, 0);
    result_mod_r.binary_basis_limbs[0].element = result.x.binary_basis_limbs[0].element;
    result_mod_r.binary_basis_limbs[1].element = result.x.binary_basis_limbs[1].element;
    result_mod_r.binary_basis_limbs[2].element = result.x.binary_basis_limbs[2].element;
    result_mod_r.binary_basis_limbs[3].element = result.x.binary_basis_limbs[3].element;
    result_mod_r.binary_basis_limbs[0].maximum_value = result.x.binary_basis_limbs[0].maximum_value;
    result_mod_r.binary_basis_limbs[1].maximum_value = result.x.binary_basis_limbs[1].maximum_value;
    result_mod_r.binary_basis_limbs[2].maximum_value = result.x.binary_basis_limbs[2].maximum_value;
    result_mod_r.binary_basis_limbs[3].maximum_value = result.x.binary_basis_limbs[3].maximum_value;

    result_mod_r.prime_basis_limb = result.x.prime_basis_limb;

    result_mod_r.assert_is_in_field();

    bool_t<Builder> output(ctx, true);
    output &= result_mod_r.binary_basis_limbs[0].element == (r.binary_basis_limbs[0].element);
    output &= result_mod_r.binary_basis_limbs[1].element == (r.binary_basis_limbs[1].element);
    output &= result_mod_r.binary_basis_limbs[2].element == (r.binary_basis_limbs[2].element);
    output &= result_mod_r.binary_basis_limbs[3].element == (r.binary_basis_limbs[3].element);
    output &= result_mod_r.prime_basis_limb == (r.prime_basis_limb);

    return output;
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
        stdlib::ecdsa_verify_signature<Builder,
                                       curve,
                                       typename curve::fq_ct,
                                       typename curve::bigfr_ct,
                                       typename curve::g1_bigfr_ct>(message, public_key, sig);
    }
}

} // namespace bb::stdlib
