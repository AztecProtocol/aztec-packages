use super::{
    key_validation_hint::KeyValidationHint,
    validate_key_validation_request::validate_key_validation_request,
};
use ::types::{
    abis::validation_requests::KeyValidationRequestAndGenerator, side_effect::Scoped,
    utils::arrays::ClaimedLengthArray,
};

pub struct KeyValidationRequestsValidator<let KeyValidationRequestsLen: u32, let KeyValidationHintsLen: u32> {
    pub key_validation_requests: ClaimedLengthArray<Scoped<KeyValidationRequestAndGenerator>, KeyValidationRequestsLen>,
    pub propagated_key_validation_requests: ClaimedLengthArray<Scoped<KeyValidationRequestAndGenerator>, KeyValidationRequestsLen>,
    pub hints: [KeyValidationHint; KeyValidationHintsLen],
}

impl<let KeyValidationRequestsLen: u32, let KeyValidationHintsLen: u32> KeyValidationRequestsValidator<KeyValidationRequestsLen, KeyValidationHintsLen> {
    // Generic parameter is used because generic arrays cannot have zero length.
    // When a reset circuit does not require key validations, the `hints` array will still contain at least one item,
    // while `KeyValidationAmount` will be set to zero.
    pub fn validate<let KeyValidationAmount: u32>(self) {
        if KeyValidationAmount == 0 {
            assert_eq(
                self.propagated_key_validation_requests,
                self.key_validation_requests,
                "All unverified key validation requests must be propagated",
            );
        } else {
            assert_eq(
                KeyValidationAmount,
                KeyValidationHintsLen,
                "hints array length does not match KeyValidationAmount",
            );

            let mut within_length = true;
            for i in 0..KeyValidationHintsLen {
                within_length &= i != self.key_validation_requests.length;

                let hint = self.hints[i];
                let request = self.key_validation_requests.array[i];

                // Notice: if there are more KeyValidationHints than key_validation_requests.length,
                // we ignore them. This means those 'extra' hints can technically contain
                // anything: we don't assert them to be empty hints.
                if within_length {
                    validate_key_validation_request(request, hint.sk_m);
                }
            }

            // The number of items (within the length) that won't be validated by this
            // iteration of the Reset circuit.
            let num_unvalidated_items = if self.key_validation_requests.length
                > KeyValidationHintsLen {
                self.key_validation_requests.length - KeyValidationHintsLen
            } else {
                0
            };

            assert_eq(
                self.propagated_key_validation_requests.length,
                num_unvalidated_items,
                "Incorrect unverified key validation requests claimed length",
            );

            for i in KeyValidationHintsLen..KeyValidationRequestsLen {
                // Notice: this doesn't ignore items beyond key_validation_requests.length:
                // they effectively get copied over to the output. Recall, we'll be validating
                // that items beyond the `length` are empty in the final Tail circuit.
                let unvalidated_request = self.key_validation_requests.array[i];
                let to_index = i - KeyValidationHintsLen;

                // Notice: we also create a new unvalidated void of elements the end of the `propagated_key_validation_requests`
                // array (of size KeyValidationHintsLen).
                // The prover can technically inject whatever they like there. Recall, we'll be validating
                // that items beyond the `length` are empty in the final Tail circuit.
                let propagated_request = self.propagated_key_validation_requests.array[to_index];

                assert_eq(
                    propagated_request,
                    unvalidated_request,
                    "Mismatch propagated unverified key validation request",
                );
            }
        }
    }
}
