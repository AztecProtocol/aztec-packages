use crate::{point::Point, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct KeyValidationRequest {
    pub pk_m: Point,
    pub sk_app: Field, // not a grumpkin scalar because it's output of poseidon2
}

impl Empty for KeyValidationRequest {
    fn empty() -> Self {
        KeyValidationRequest { pk_m: Point::empty(), sk_app: 0 }
    }
}

mod test {
    use crate::{
        abis::validation_requests::key_validation_request::KeyValidationRequest,
        constants::KEY_VALIDATION_REQUEST_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_key_validation_request() {
        let item = KeyValidationRequest::empty();
        // We use the KEY_VALIDATION_REQUEST_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; KEY_VALIDATION_REQUEST_LENGTH] = item.serialize();
        let deserialized = KeyValidationRequest::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
