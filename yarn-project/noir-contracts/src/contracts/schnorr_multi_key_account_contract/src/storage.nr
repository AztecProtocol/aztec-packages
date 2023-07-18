use dep::aztec::state_vars::{
    immutable_singleton::ImmutableSingleton
};

use crate::public_key_note::{
    PublicKeyNote,
    PublicKeyNoteInterface,
    PUBLIC_KEY_NOTE_LEN,
};

struct Storage {
    public_key: ImmutableSingleton<PublicKeyNote, PUBLIC_KEY_NOTE_LEN>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            public_key: ImmutableSingleton::new(1, PublicKeyNoteInterface)
        }
    }
}