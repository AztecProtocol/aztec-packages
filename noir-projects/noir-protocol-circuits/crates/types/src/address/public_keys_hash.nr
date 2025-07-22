use crate::traits::{Deserialize, Empty, Serialize, ToField};
use std::meta::derive;

// Public keys hash. Used in the computation of an address.
#[derive(Deserialize, Eq, Serialize)]
pub struct PublicKeysHash {
    inner: Field,
}

impl ToField for PublicKeysHash {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl Empty for PublicKeysHash {
    fn empty() -> Self {
        Self { inner: 0 }
    }
}

impl PublicKeysHash {
    pub fn from_field(field: Field) -> Self {
        Self { inner: field }
    }

    pub fn to_field(self) -> Field {
        self.inner
    }

    pub fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }
}

mod test {
    use crate::{address::public_keys_hash::PublicKeysHash, traits::{Deserialize, Empty, Serialize}};

    #[test]
    fn serialization_of_empty_public_keys_hash() {
        let item = PublicKeysHash::empty();
        let serialized: [Field; 1] = item.serialize();
        let deserialized = PublicKeysHash::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
