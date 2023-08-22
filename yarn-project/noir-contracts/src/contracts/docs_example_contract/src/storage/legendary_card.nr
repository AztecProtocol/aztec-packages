// docs:start:state_vars-Singleton
use dep::aztec::state_vars::singleton::Singleton;

use crate::types::card::{Card, CardMethods, CARD_LEN};

fn init(storage_slot: Field) -> Singleton<Card, CARD_LEN> {
    Singleton::new(storage_slot, CardMethods)
}
// docs:end:state_vars-Singleton