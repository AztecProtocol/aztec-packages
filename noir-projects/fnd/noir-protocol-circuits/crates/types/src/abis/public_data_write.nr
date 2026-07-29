use crate::traits::{Deserialize, Empty, Serialize};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicDataWrite {
    pub leaf_slot: Field,
    pub value: Field,
}

impl Empty for PublicDataWrite {
    fn empty() -> Self {
        Self { leaf_slot: 0, value: 0 }
    }
}

mod test {
    use crate::{
        abis::public_data_write::PublicDataWrite,
        constants::PUBLIC_DATA_WRITE_LENGTH,
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn serialization_of_public_data_write() {
        let item = PublicDataWrite { leaf_slot: 1, value: 2 };
        // We use the PUBLIC_DATA_WRITE_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; PUBLIC_DATA_WRITE_LENGTH] = item.serialize();
        let deserialized = PublicDataWrite::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
