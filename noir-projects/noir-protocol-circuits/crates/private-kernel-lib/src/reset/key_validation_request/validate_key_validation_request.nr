use ::types::{
    abis::validation_requests::KeyValidationRequestAndGenerator,
    hash::compute_app_siloed_secret_key, scalar::Scalar, side_effect::Scoped,
};
use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;

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
/// When a Key Validation Request tuple of (sk_app, Pk_m, app_address) is
/// submitted to the kernel, it will perform the following derivations
/// to validate the relationship between the claimed sk_app and the user's
/// Pk_m:
///
///       (sk_m) ----> * G ----> Pk_m
///         |                     |
///         v                       We use the kernel to prove this
///  h(sk_m, app_address)         | sk_app-Pk_m relationship, because app
///         |                       circuits must not be trusted to see sk_m.
///         v                     |
///      sk_app  - - - - - - - - -
///
/// Where G is a hard-coded, protocol-defined generator for deriving user public keys.
///
/// The fact that the user is able to furnish a sk_m that derives both the Pk_m and
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
///
pub fn validate_key_validation_request(
    scoped_request: Scoped<KeyValidationRequestAndGenerator>,
    sk_m: Scalar,
) {
    let contract_address = scoped_request.contract_address;
    let request_and_generator = scoped_request.inner;
    let request = request_and_generator.request;
    let sk_app_generator = request_and_generator.sk_app_generator;

    // First we check that the derived public key matches the master public key from the request.
    let pk_m = derive_public_key(sk_m);
    assert_eq(
        pk_m,
        request.pk_m,
        "Failed to derive matching master public key from the secret key",
    );

    // Then we check that siloing the master secret key with the contract address gives the app-siloed secret key.
    let sk_app = compute_app_siloed_secret_key(sk_m, contract_address, sk_app_generator);
    assert_eq(
        sk_app,
        request.sk_app,
        "Failed to derive matching app secret key from the secret key",
    );
}
