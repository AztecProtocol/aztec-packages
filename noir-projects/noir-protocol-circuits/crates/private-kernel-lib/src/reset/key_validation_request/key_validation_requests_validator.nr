use super::{
    key_validation_hint::KeyValidationHint,
    validate_key_validation_request::validate_key_validation_request,
};
use dep::types::{
    abis::validation_requests::ScopedKeyValidationRequestAndGenerator,
    utils::arrays::ClaimedLengthArray,
};

pub struct KeyValidationRequestsValidator<let RequestsLen: u32, let HintsLen: u32> {
    pub key_validation_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, RequestsLen>,
    pub propagated_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, RequestsLen>,
    pub hints: [KeyValidationHint; HintsLen],
}

impl<let RequestsLen: u32, let HintsLen: u32> KeyValidationRequestsValidator<RequestsLen, HintsLen> {
    // Generic parameter is used because generic arrays cannot have zero length.
    // When a reset circuit does not require key validations, the hints array will still contain at least one item,
    // while `KeyValidationAmount` will be set to zero.
    pub fn validate<let KeyValidationAmount: u32>(self) {
        if KeyValidationAmount == 0 {
            assert_eq(
                self.propagated_requests,
                self.key_validation_requests,
                "All unverified key validation requests must be propagated",
            );
        } else {
            assert_eq(
                KeyValidationAmount,
                self.hints.len(),
                "hints array length does not match KeyValidationAmount",
            );

            for i in 0..self.hints.len() {
                let hint = self.hints[i];
                let request = self.key_validation_requests.array[i];
                if i < self.key_validation_requests.length {
                    validate_key_validation_request(request, hint.sk_m);
                }
            }

            let unverified_length = if self.key_validation_requests.length > KeyValidationAmount {
                self.key_validation_requests.length - KeyValidationAmount
            } else {
                0
            };

            assert_eq(
                self.propagated_requests.length,
                unverified_length,
                "Incorrect unverified key validation requests claimed length",
            );

            for i in HintsLen..RequestsLen {
                let unverified_request = self.key_validation_requests.array[i];
                let to_index = i - HintsLen;
                let propagated_request = self.propagated_requests.array[to_index];
                assert_eq(
                    propagated_request,
                    unverified_request,
                    "Mismatch propagated unverified key validation request",
                );
            }
        }
    }
}
