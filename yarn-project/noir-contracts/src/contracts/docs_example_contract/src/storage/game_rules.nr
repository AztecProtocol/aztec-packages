// docs:start:state_vars-ImmutableSingleton
use dep::aztec::state_vars::immutable_singleton::ImmutableSingleton;

use crate::types::rules::{Rules, RulesMethods, RULES_LEN};

fn init(storage_slot: Field) -> ImmutableSingleton<Rules, RULES_LEN> {
    ImmutableSingleton::new(storage_slot, RulesMethods)
}
// docs:end:state_vars-ImmutableSingleton