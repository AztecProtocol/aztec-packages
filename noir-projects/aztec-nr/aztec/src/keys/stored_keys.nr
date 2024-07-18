use crate::keys::public_keys::{PublicKeys, PUBLIC_KEYS_LENGTH};
use dep::protocol_types::traits::{Serialize, Deserialize};

global STORED_KEYS_LENGTH: u32 = 13; // PUBLIC_KEYS_LENGTH + 1 -> this expression causes an ICE, look into it
global KEY_REGISTRY_STORAGE_SLOT = 1;

struct StoredKeys {
    public_keys: PublicKeys,
    hash: Field,
}

impl StoredKeys {
    fn new(public_keys: PublicKeys) -> Self {
        Self { public_keys, hash: public_keys.hash().inner }
    }
}

impl Serialize<STORED_KEYS_LENGTH> for StoredKeys {
    fn serialize(self) -> [Field; STORED_KEYS_LENGTH] {
        std::static_assert(PUBLIC_KEYS_LENGTH + 1 == STORED_KEYS_LENGTH, "Incorect value for STORED_KEYS_LENGTH");

        let mut array = [0; STORED_KEYS_LENGTH];

        let serialized_keys = self.public_keys.serialize();
        for i in 0..serialized_keys.len() {
            array[i] = serialized_keys[i];
        }

        array[PUBLIC_KEYS_LENGTH] = self.hash;

        array
    }
}

impl Deserialize<STORED_KEYS_LENGTH> for StoredKeys {
    fn deserialize(array: [Field; STORED_KEYS_LENGTH]) -> Self {
        std::static_assert(PUBLIC_KEYS_LENGTH + 1 == STORED_KEYS_LENGTH, "Incorect value for STORED_KEYS_LENGTH");

        let mut serialized_keys = [0; PUBLIC_KEYS_LENGTH];
        for i in 0..serialized_keys.len() {
            serialized_keys[i] = array[i];
        }

        let hash = array[PUBLIC_KEYS_LENGTH];

        Self { public_keys: PublicKeys::deserialize(serialized_keys), hash }
    }
}
