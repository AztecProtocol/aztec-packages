use dep::aztec::state_vars::{
    map::Map,
    set::Set
};
use dep::aztec::context::PrivateContext;
use dep::value_note::value_note::{
    ValueNote,
    ValueNoteMethods,
    VALUE_NOTE_LEN,
};

// docs:start:storage-declaration
// highlight-next-line:storage-declaration
struct Storage {
    // maps an aztec address to its balance
    balances: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
}

// highlight-next-line:storage-declaration
impl Storage {
    fn init(context: &mut PrivateContext) -> Self {
        Storage {
            balances: Map::new(context, 1, |context, slot| Set::new(context, slot, ValueNoteMethods)),
        }
    }
}
// docs:end:storage-declaration
