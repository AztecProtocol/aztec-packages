use dep::types::{
    abis::validation_requests::ScopedKeyValidationRequestAndGenerator, hash::compute_app_secret_key,
    scalar::Scalar, traits::Empty, utils::arrays::ClaimedLengthArray,
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

// `key_validation_amount` is a known constant at compile time. For all such reset variant
// amounts, the constant is defined in the main.nr files and passed down to this function.
pub fn verify_reset_key_validation_requests<let REQUESTS_LEN: u32, let HINTS_LEN: u32>(
    key_validation_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, REQUESTS_LEN>,
    hints: [KeyValidationHint; HINTS_LEN],
    key_validation_amount: u32,
    propagated_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, REQUESTS_LEN>,
) {
    if key_validation_amount == 0 {
        assert_eq(
            propagated_requests,
            key_validation_requests,
            "All unverified key validation requests must be propagated",
        );
    } else {
        assert_eq(
            key_validation_amount,
            HINTS_LEN,
            "key_validation_amount should be the same as the number of hints",
        );

        for i in 0..HINTS_LEN {
            let hint = hints[i];
            let request = key_validation_requests.array[i];
            if i < key_validation_requests.length {
                verify_key_validation_request(request, hint.sk_m);
            }
        }

        let unverified_length = if key_validation_requests.length > key_validation_amount {
            key_validation_requests.length - key_validation_amount
        } else {
            0
        };

        assert_eq(
            propagated_requests.length,
            unverified_length,
            "Incorrect unverified key validation requests claimed length",
        );

        for i in HINTS_LEN..REQUESTS_LEN {
            let unverified_request = key_validation_requests.array[i];
            let to_index = i - HINTS_LEN;
            let propagated_request = propagated_requests.array[to_index];
            assert_eq(
                propagated_request,
                unverified_request,
                "Mismatch propagated unverified key validation request",
            );
        }
    }
}

pub unconstrained fn get_propagated_key_validation_requests<let N: u32>(
    key_validation_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, N>,
    key_validation_amount: u32,
) -> ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, N> {
    let mut propagated: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, N> =
        ClaimedLengthArray::empty();

    // We'll process a number of requests up to the `key_validation_amount`. We'll propagate any beyond that.
    // We "shift" (from the front) items that we want to process, instead of "pop" (from the back),
    // to process the requests in the order in which they were made. It will also be easier to verify later.
    for i in key_validation_amount..key_validation_requests.length {
        propagated.array[i - key_validation_amount] = key_validation_requests.array[i];
    }

    propagated.length = if key_validation_requests.length > key_validation_amount {
        key_validation_requests.length - key_validation_amount
    } else {
        0
    };

    propagated
}

mod tests {
    use crate::reset::key_validation_request::{
        get_propagated_key_validation_requests, KeyValidationHint,
        verify_reset_key_validation_requests,
    };
    use dep::types::{
        abis::validation_requests::{
            KeyValidationRequest, KeyValidationRequestAndGenerator,
            ScopedKeyValidationRequestAndGenerator,
        },
        address::AztecAddress,
        hash::compute_app_secret_key,
        scalar::Scalar,
        tests::utils::assert_array_eq,
        traits::{Empty, FromField},
        utils::arrays::ClaimedLengthArray,
    };
    use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;

    struct TestBuilder<let REQUESTS_LEN: u32, let HINTS_LEN: u32> {
        key_validation_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, REQUESTS_LEN>,
        hints: BoundedVec<KeyValidationHint, HINTS_LEN>,
        key_validation_amount: u32,
        propagated_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, REQUESTS_LEN>,
    }

    impl TestBuilder<6, 2> {
        pub fn new_clear_all() -> Self {
            let mut builder = Self::empty();

            builder.add_request_and_hint(11);
            builder.add_request_and_hint(22);
            builder.propagated_requests = builder.get_propagated_key_validation_requests();

            builder
        }

        pub fn new_clear_partial() -> Self {
            let mut builder = Self::empty();

            builder.add_request_and_hint(11);
            builder.add_request_and_hint(22);
            builder.add_request(33);
            builder.add_request(44);
            builder.propagated_requests = builder.get_propagated_key_validation_requests();

            builder
        }

        pub fn new_clear_nothing() -> Self {
            let mut builder = Self::empty();

            builder.add_request(11);
            builder.add_request(22);
            builder.add_request(33);
            builder.key_validation_amount = 0;
            builder.propagated_requests = builder.get_propagated_key_validation_requests();

            builder
        }
    }

    impl TestBuilder<4, 4> {
        pub fn new_clear_all_with_extra_hints() -> Self {
            let mut builder = Self::empty();

            builder.add_request_and_hint(11);
            builder.add_request_and_hint(22);
            builder.propagated_requests = builder.get_propagated_key_validation_requests();

            builder
        }
    }

    impl<let REQUESTS_LEN: u32, let HINTS_LEN: u32> TestBuilder<REQUESTS_LEN, HINTS_LEN> {
        pub fn empty() -> Self {
            Self {
                key_validation_requests: ClaimedLengthArray::empty(),
                hints: BoundedVec::new(),
                key_validation_amount: HINTS_LEN,
                propagated_requests: ClaimedLengthArray::empty(),
            }
        }

        pub fn add_request(&mut self, sk: Field) {
            let contract_address = AztecAddress::from_field(456654);

            let sk_m = Scalar::from_field(sk);
            let pk_m = derive_public_key(sk_m);

            let sk_app_generator = 123321;
            let sk_app = compute_app_secret_key(sk_m, contract_address, sk_app_generator);

            let request = KeyValidationRequestAndGenerator {
                request: KeyValidationRequest { pk_m, sk_app },
                sk_app_generator,
            }
                .scope(contract_address);

            self.key_validation_requests.push(request);
        }

        pub fn add_hint(&mut self, sk: Field) {
            self.hints.push(KeyValidationHint { sk_m: Scalar::from_field(sk) });
        }

        pub fn add_request_and_hint(&mut self, sk: Field) {
            self.add_request(sk);
            self.add_hint(sk);
        }

        pub fn get_propagated_key_validation_requests(
            self,
        ) -> ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, REQUESTS_LEN> {
            // Safety: This is only used in tests.
            unsafe {
                get_propagated_key_validation_requests(
                    self.key_validation_requests,
                    self.key_validation_amount,
                )
            }
        }

        pub fn verify(self) {
            verify_reset_key_validation_requests(
                self.key_validation_requests,
                self.hints.storage(),
                self.key_validation_amount,
                self.propagated_requests,
            );
        }
    }

    #[test]
    fn verify_reset_key_validation_requests_clear_all_succeeds() {
        let builder = TestBuilder::new_clear_all();
        builder.verify();

        let propagated = builder.propagated_requests;
        assert_eq(propagated.length, 0);
        assert(propagated.array.is_empty());
    }

    #[test(should_fail_with = "Failed to derive matching master public key from the secret key")]
    fn verify_reset_key_validation_requests_wrong_hint_fails() {
        let mut builder = TestBuilder::new_clear_all();

        // Tweak the last hint.
        let mut last_hint = builder.hints.pop();
        last_hint.sk_m.lo += 1;
        builder.hints.push(last_hint);

        builder.verify();
    }

    #[test(should_fail_with = "Failed to derive matching app secret key from the secret key")]
    fn verify_reset_key_validation_requests_wrong_app_secret_key_fails() {
        let mut builder = TestBuilder::new_clear_all();

        builder.key_validation_requests.array[1].contract_address.inner += 1;

        builder.verify();
    }

    #[test(should_fail_with = "key_validation_amount should be the same as the number of hints")]
    fn verify_reset_key_validation_requests_larger_amount_fails() {
        let mut builder = TestBuilder::new_clear_all();

        builder.key_validation_amount += 1;

        builder.verify();
    }

    #[test(should_fail_with = "key_validation_amount should be the same as the number of hints")]
    fn verify_reset_key_validation_requests_smaller_amount_fails() {
        let mut builder = TestBuilder::new_clear_all();

        builder.key_validation_amount -= 1;

        builder.verify();
    }

    #[test(should_fail_with = "Failed to derive matching master public key from the secret key")]
    fn verify_reset_key_validation_requests_hints_fewer_than_requests_fails() {
        let mut builder = TestBuilder::new_clear_all();

        // Remove the last hint
        let _ = builder.hints.pop();

        builder.verify();
    }

    #[test]
    fn verify_reset_key_validation_requests_clear_partial_succeeds() {
        let builder = TestBuilder::new_clear_partial();
        builder.verify();

        let propagated = builder.propagated_requests;
        let requests = builder.key_validation_requests.array;
        assert_eq(propagated.length, 2);
        assert_array_eq(propagated.array, [requests[2], requests[3]]);
    }

    #[test(should_fail_with = "Incorrect unverified key validation requests claimed length")]
    fn verify_reset_key_validation_requests_propagate_less_amount_fails() {
        let mut builder = TestBuilder::new_clear_partial();

        builder.propagated_requests.length -= 1;

        builder.verify();
    }

    #[test(should_fail_with = "Mismatch propagated unverified key validation request")]
    fn verify_reset_key_validation_requests_propagate_fewer_requests_fails() {
        let mut builder = TestBuilder::new_clear_partial();

        let num_propagated = builder.propagated_requests.length;
        builder.propagated_requests.array[num_propagated - 1] =
            ScopedKeyValidationRequestAndGenerator::empty();

        builder.verify();
    }

    #[test(should_fail_with = "Incorrect unverified key validation requests claimed length")]
    fn verify_reset_key_validation_requests_propagate_more_amount_fails() {
        let mut builder = TestBuilder::new_clear_partial();

        builder.propagated_requests.length += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Mismatch propagated unverified key validation request")]
    fn verify_reset_key_validation_requests_propagate_more_requests_fails() {
        let mut builder = TestBuilder::new_clear_partial();

        let num_propagated = builder.propagated_requests.length;
        // Add an extra request beyond the claimed length.
        builder.propagated_requests.array[num_propagated] = builder.propagated_requests.array[0];

        builder.verify();
    }

    #[test]
    fn verify_reset_key_validation_requests_clear_all_with_extra_hints_succeeds() {
        let builder = TestBuilder::new_clear_all_with_extra_hints();
        builder.verify();

        let propagated = builder.propagated_requests;
        assert_eq(propagated.length, 0);
        assert(propagated.array.is_empty());
    }

    #[test]
    fn verify_reset_key_validation_requests_clear_all_with_extra_hints_non_empty_hints_succeeds() {
        let mut builder = TestBuilder::new_clear_all_with_extra_hints();

        // Add a dummy hint, which should be ignored.
        builder.add_hint(9999);

        builder.verify();
    }

    #[test]
    fn verify_reset_key_validation_requests_clear_nothing_succeeds() {
        let builder = TestBuilder::new_clear_nothing();
        builder.verify();

        let propagated = builder.propagated_requests;
        let requests = builder.key_validation_requests;
        assert_eq(propagated.length, 3);
        assert_eq(propagated, requests);
    }

    #[test(should_fail_with = "All unverified key validation requests must be propagated")]
    fn verify_reset_key_validation_requests_clear_nothing_propagate_fewer_requests_fails() {
        let mut builder = TestBuilder::new_clear_nothing();

        let num_propagated = builder.propagated_requests.length;
        // Remove the last request.
        builder.propagated_requests.array[num_propagated - 1] =
            ScopedKeyValidationRequestAndGenerator::empty();

        builder.verify();
    }

    #[test(should_fail_with = "All unverified key validation requests must be propagated")]
    fn verify_reset_key_validation_requests_clear_nothing_propagate_less_amount_fails() {
        let mut builder = TestBuilder::new_clear_nothing();

        // Make the propagated array a bit smaller.
        builder.propagated_requests.length -= 1;

        builder.verify();
    }

    #[test(should_fail_with = "All unverified key validation requests must be propagated")]
    fn verify_reset_key_validation_requests_clear_nothing_propagate_more_requests_fails() {
        let mut builder = TestBuilder::new_clear_nothing();

        let num_propagated = builder.propagated_requests.length;
        // Add an extra request beyond the claimed length.
        builder.propagated_requests.array[num_propagated] =
            builder.propagated_requests.array[num_propagated - 1];

        builder.verify();
    }

    #[test(should_fail_with = "All unverified key validation requests must be propagated")]
    fn verify_reset_key_validation_requests_clear_nothing_propagate_more_amount_fails() {
        let mut builder = TestBuilder::new_clear_nothing();

        // Make the propagated array a bit larger.
        builder.propagated_requests.length += 1;

        builder.verify();
    }
}
