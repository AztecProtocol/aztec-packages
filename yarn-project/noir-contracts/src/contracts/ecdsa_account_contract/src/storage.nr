use dep::aztec::state_vars::{
    immutable_singleton::ImmutableSingleton
};

use crate::ecdsa_public_key_note::{
    EcdsaPublicKeyNote,
    EcdsaPublicKeyNoteInterface,
    ECDSA_PUBLIC_KEY_NOTE_LEN,
};
use dep::std::option::Option;
use dep::aztec::context::{PrivateContext, PublicContext};

struct Storage {
    public_key: ImmutableSingleton<EcdsaPublicKeyNote, ECDSA_PUBLIC_KEY_NOTE_LEN>,
}

impl Storage {
    fn init(
        private_context: Option<&mut PrivateContext>,
        public_context: Option<&mut PublicContext>,
    ) -> Self {
        Storage {
            public_key: ImmutableSingleton::new(1, EcdsaPublicKeyNoteInterface)
        }
    }
}