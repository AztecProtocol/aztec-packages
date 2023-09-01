use dep::aztec::state_vars::{
    map::Map,
    set::Set
};
use dep::value_note::value_note::{
    ValueNote,
    ValueNoteMethods,
    VALUE_NOTE_LEN,
};
use crate::claim_note::{CLAIM_NOTE_LEN, ClaimNote, ClaimNoteMethods};
use dep::std::option::Option;
use dep::aztec::context::{PrivateContext, PublicContext};

struct Storage {
    balances: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
    claims: Set<ClaimNote, CLAIM_NOTE_LEN>,
}

impl Storage {
    fn init(
        private_context: Option<&mut PrivateContext>,
        public_context: Option<&mut PublicContext>,
    ) -> Self {
        Storage {
            balances: Map::new(1, |s| Set::new(s, ValueNoteMethods)),
            claims: Set::new(2, ClaimNoteMethods),
        }
    }
}