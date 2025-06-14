use dep::types::{
    abis::validation_requests::ScopedKeyValidationRequestAndGenerator,
    hash::compute_app_secret_key,
    scalar::Scalar,
    traits::{Empty, is_empty},
};
use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;

pub struct KeyValidationHint {
    pub sk_m: Scalar,
}

impl Empty for KeyValidationHint {
    fn empty() -> Self {
        KeyValidationHint { sk_m: Scalar::empty() }
    }
}

impl Eq for KeyValidationHint {
    fn eq(self, other: Self) -> bool {
        self.sk_m.eq(other.sk_m)
    }
}

fn verify_key_validation_request(
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
        "Failed to derive matching master public key from the secret key.",
    );

    // Then we check that siloing the master secret key with the contract address gives the app secret key.
    let sk_app = compute_app_secret_key(sk_m, contract_address, sk_app_generator);
    assert_eq(
        sk_app,
        request.sk_app,
        "Failed to derive matching app secret key from the secret key.",
    );
}

// `key_validation_amount` should be a known constant at compile time.
// For reset variants, the constant is defined in the main.nr files and passed down to this function.
pub fn verify_reset_key_validation_requests<let REQUESTS_LEN: u32, let HINTS_LEN: u32>(
    key_validation_requests: [ScopedKeyValidationRequestAndGenerator; REQUESTS_LEN],
    hints: [KeyValidationHint; HINTS_LEN],
    key_validation_amount: u32,
    unverified_requests: [ScopedKeyValidationRequestAndGenerator; REQUESTS_LEN],
) {
    assert(
        key_validation_amount <= HINTS_LEN,
        "key_validation_amount cannot be greater than the hints array length",
    );

    for i in 0..REQUESTS_LEN {
        let request = key_validation_requests[i];
        if i < key_validation_amount {
            let hint = hints[i];
            if !is_empty(request.contract_address) {
                verify_key_validation_request(request, hint.sk_m);
            }

            // For each verified key validation request, an empty request is added to the unverified requests.
            // We need to make sure that the unverified requests are padded with empty requests, because the protocol
            // expects it to be a validated array ([...non_empty_items, ...empty_items]).
            // This ensures that the new requests from later iterations are appended correctly and can't override the
            // previous values, and the result will still be a validated array.
            // This will enable the tail kernels to simply check that the first request is empty to know that all the
            // requests are validated.
            assert(
                is_empty(unverified_requests[REQUESTS_LEN - i - 1]),
                "unverified requests should be padded with empty requests",
            );
        } else {
            assert_eq(
                request,
                unverified_requests[i - key_validation_amount],
                "mismatch propagated key validation request",
            );
        }
    }
}

pub unconstrained fn get_unverified_key_validation_requests<let N: u32>(
    key_validation_requests: [ScopedKeyValidationRequestAndGenerator; N],
    key_validation_amount: u32,
) -> [ScopedKeyValidationRequestAndGenerator; N] {
    let mut propagated = [ScopedKeyValidationRequestAndGenerator::empty(); N];
    for i in key_validation_amount..N {
        propagated[i - key_validation_amount] = key_validation_requests[i];
    }
    propagated
}
