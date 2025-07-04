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
