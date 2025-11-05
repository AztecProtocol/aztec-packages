use dep::types::{scalar::Scalar, traits::Empty};

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
