// docs:start:state_vars-Set
use dep::aztec::state_vars::set::Set;

use crate::types::card::{Card, CardMethods, CARD_LEN};

fn init(storage_slot: Field) -> Set<Card, CARD_LEN> {
    Set::new(storage_slot, CardMethods)
}
// docs:end:state_vars-Set