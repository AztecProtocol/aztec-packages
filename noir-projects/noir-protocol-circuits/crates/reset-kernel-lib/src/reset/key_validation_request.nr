use dep::types::{
    abis::validation_requests::ScopedKeyValidationRequestAndGenerator, hash::compute_app_secret_key,
    scalar::Scalar, traits::Empty, utils::arrays::AppendedUnvalidatedArray,
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

// `key_validation_amount` is a known constant at compile time. For all such reset variant
// amounts, the constant is defined in the main.nr files and passed down to this function.
pub fn verify_reset_key_validation_requests<let REQUESTS_LEN: u32, let HINTS_LEN: u32>(
    key_validation_requests: AppendedUnvalidatedArray<ScopedKeyValidationRequestAndGenerator, REQUESTS_LEN>,
    hints: [KeyValidationHint; HINTS_LEN],
    key_validation_amount: u32,
    unverified_requests: AppendedUnvalidatedArray<ScopedKeyValidationRequestAndGenerator, REQUESTS_LEN>,
) {
    assert(
        key_validation_amount <= HINTS_LEN,
        "key_validation_amount cannot be greater than the hints array length",
    );

    for i in 0..REQUESTS_LEN {
        let request = key_validation_requests.array[i];
        if i < key_validation_amount {
            let hint = hints[i];
            if !request.contract_address.is_empty() {
                verify_key_validation_request(request, hint.sk_m);
            }

            // TODO: we might be able to remove these checks, given that we now have these safe types, that help us
            // track which checks have been performed so far.
            // For each verified key validation request, an empty request is added to the unverified requests.
            // We need to make sure that the unverified requests are padded with empty requests, because the protocol
            // expects it to be a validated array ([...non_empty_items, ...empty_items]).
            // This ensures that the new requests from later iterations are appended correctly and can't override the
            // previous values, and the result will still be a validated array.
            // This will enable the tail kernels to simply check that the first request is empty to know that all the
            // requests are validated.

            unverified_requests.array[REQUESTS_LEN - i - 1].assert_empty(
                "unverified requests should be padded with empty requests",
            );
        } else {
            assert_eq(
                request,
                unverified_requests.array[i - key_validation_amount],
                "mismatch propagated key validation request",
            );
        }
    }
}

// Dangerous. Come back to this, because I'm worried I'm missing constraints on the arrays.
pub unconstrained fn get_unverified_key_validation_requests<let N: u32>(
    key_validation_requests: AppendedUnvalidatedArray<ScopedKeyValidationRequestAndGenerator, N>,
    key_validation_amount: u32,
) -> AppendedUnvalidatedArray<ScopedKeyValidationRequestAndGenerator, N> {
    let mut propagated: AppendedUnvalidatedArray<ScopedKeyValidationRequestAndGenerator, N> =
        AppendedUnvalidatedArray::empty();

    // We'll process a number of requests up to the `key_validation_amount`. We'll propagate any beyond that.
    // We "shift" (from the front) items that we want to process, instead of "pop" (from the back),
    // to process the requests in the order in which they were made. It will also be easier to verify later.
    for i in key_validation_amount..N {
        propagated.array[i - key_validation_amount] = key_validation_requests.array[i];
    }
    propagated.length = key_validation_requests.length - key_validation_amount;
    propagated
}
