use dep::types::{
    abis::validation_requests::ScopedKeyValidationRequestAndGenerator, hash::compute_app_secret_key,
    scalar::Scalar,
};
use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;

pub fn validate_key_validation_request(
    scoped_request: ScopedKeyValidationRequestAndGenerator,
    sk_m: Scalar,
) {
    let contract_address = scoped_request.contract_address;
    let request_and_generator = scoped_request.request;
    let request = request_and_generator.request;
    let sk_app_generator = request_and_generator.sk_app_generator;

    // First we check that derived public key matches master public key from request.
    let pk_m = derive_public_key(sk_m);
    assert_eq(
        pk_m,
        request.pk_m,
        "Failed to derive matching master public key from the secret key",
    );

    // Then we check that siloing the master secret key with the contract address gives the app secret key.
    let sk_app = compute_app_secret_key(sk_m, contract_address, sk_app_generator);
    assert_eq(
        sk_app,
        request.sk_app,
        "Failed to derive matching app secret key from the secret key",
    );
}
