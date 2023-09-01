use dep::aztec::state_vars::{
    immutable_singleton::ImmutableSingleton
};
use dep::std::option::Option;
use dep::aztec::context::{PrivateContext, PublicContext};

use crate::public_key_note::{
    PublicKeyNote,
    PublicKeyNoteMethods,
    PUBLIC_KEY_NOTE_LEN,
};

struct Storage {
    signing_public_key: ImmutableSingleton<PublicKeyNote, PUBLIC_KEY_NOTE_LEN>,
}

impl Storage {
    fn init(
        private_context: Option<&mut PrivateContext>,
        public_context: Option<&mut PublicContext>,
    ) -> Self {
        Storage {
            signing_public_key: ImmutableSingleton::new(1, PublicKeyNoteMethods)
        }
    }
}