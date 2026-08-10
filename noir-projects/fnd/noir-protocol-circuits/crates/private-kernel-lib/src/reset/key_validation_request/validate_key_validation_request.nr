use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;
use types::{
    abis::validation_requests::KeyValidationRequestAndSeparator,
    hash::compute_app_siloed_secret_key, point::EmbeddedCurvePoint, public_keys::hash_public_key,
    scalar::Scalar, side_effect::Scoped,
};

/// Validates a Key Validation Request that an app circuit has submitted to the kernel.
///
/// Private functions are not allowed to see a user's master secret keys (sk_m),
/// because we do not trust them. They are instead given "app-siloed" secret
/// keys (sk_app) with a claim that they relate to a master public key (pk_m).
/// The app circuit cannot validate this claim itself, because validation requires the
/// master secret key sk_m.
///
/// The app circuit can request validation of this claim, by making a "key
/// validation request" to the protocol's kernel circuits (which _are_
/// allowed to see certain master secret keys (sk_m)).
///
/// The app circuit only sees `pk_m_hash` (not the raw point). The kernel derives the
/// point from `sk_m`, hashes it, and asserts equality. When a Key Validation Request tuple of
/// (sk_app, pk_m_hash, app_address) is submitted to the kernel, it performs the following
/// derivations to validate the relationship between the claimed sk_app and the user's pk_m:
///
///       (sk_m) ----> * G ----> pk_m ----> hash_public_key(pk_m)
///         |                                        |
///         v                                        | We use the kernel to prove this
///  h(sk_m, app_address)                            | sk_app-pk_m_hash relationship, because app
///         |                                        | circuits must not be trusted to see sk_m.
///         v                                        |
///      sk_app  - - - - - - - - - - - - - - - - - -
///
/// Where G is a hard-coded, protocol-defined generator for deriving user public keys.
///
/// The fact that the user is able to furnish a sk_m that derives both the pk_m_hash and the
/// sk_app of the key_validation_request proves that this sk_m is the correct one.
/// If the wrong sk_m were used, then the assertions below would fail, and the user's
/// tx would not contain a valid proof and so would not be includable in a block.
///
/// If you squint, you can see that this looks a lot like hardened BIP32 child key
/// derivation.
///
/// Aside: an alternative to using key validation requests would be for apps to use
/// Plume nullifiers instead (which enable Chaum-Pedersen-like validation of knowledge
/// of a secret key). Key validation requests are slightly more efficient (although
/// the overhead of managing arrays of key validation requests in the kernels might
/// counter that claim).
pub fn validate_key_validation_request(
    scoped_request: Scoped<KeyValidationRequestAndSeparator>,
    sk_m: Scalar,
) {
    let contract_address = scoped_request.contract_address;
    let request_and_separator = scoped_request.inner;
    let request = request_and_separator.request;
    let key_type_domain_separator = request_and_separator.key_type_domain_separator;

    // First we check that the hash of the derived public key matches the requested pk_m_hash.
    let pk_m = derive_public_key(sk_m);

    // Safeguard against using a secret key equals to zero.
    assert_eq(
        pk_m.is_infinite(),
        false,
        "Derived master public key cannot be the point at infinity",
    );

    assert_eq(
        hash_public_key(pk_m),
        request.pk_m_hash,
        "Failed to derive matching master public key hash from the secret key",
    );

    // Then we check that siloing the master secret key with the contract address gives the app-siloed secret key.
    let sk_app = compute_app_siloed_secret_key(sk_m, contract_address, key_type_domain_separator);
    assert_eq(
        sk_app,
        request.sk_app,
        "Failed to derive matching app secret key from the secret key",
    );
}
