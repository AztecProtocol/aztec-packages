use crate::traits::{Deserialize, Empty, Serialize};
use std::meta::derive;

/// A request from an app circuit to the kernel for validation of a siloed app secret key.
///
/// The master public key is exposed only as its [`hash_public_key`](crate::public_keys::hash_public_key) digest -- apps
/// must not see the raw point. The kernel reset circuit derives the point from the master secret
/// key hint, hashes it, and asserts equality with `pk_m_hash`.
#[derive(Deserialize, Eq, Serialize)]
pub struct KeyValidationRequest {
    pub pk_m_hash: Field,
    pub sk_app: Field, // not a grumpkin scalar because it's output of poseidon2
}

impl Empty for KeyValidationRequest {
    fn empty() -> Self {
        KeyValidationRequest { pk_m_hash: 0, sk_app: 0 }
    }
}

mod test {
    use crate::{
        abis::validation_requests::key_validation_request::KeyValidationRequest,
        constants::KEY_VALIDATION_REQUEST_LENGTH,
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn serialization_of_key_validation_request() {
        let item = KeyValidationRequest { pk_m_hash: 123, sk_app: 789 };
        let serialized: [Field; KEY_VALIDATION_REQUEST_LENGTH] = item.serialize();
        let deserialized = KeyValidationRequest::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
